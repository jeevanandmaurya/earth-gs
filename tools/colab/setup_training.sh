#!/usr/bin/env bash
# One-time setup for a Colab GPU session (T4). Safe to re-run: each step is skipped if already done.
# Usage in Colab:   !bash tools/colab/setup_training.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jeevanandmaurya/earth-gs.git}"
REPO_DIR="${REPO_DIR:-/content/earth-gs}"
DATA_ROOT="${EARTH_GS_DATA:-/content/earth-gs-data}"
SPIRULA_VERSION="2026.9.30"
SPIRULA_URL="https://github.com/harry7557558/spirula-studio/releases/download/v${SPIRULA_VERSION}/spirula-${SPIRULA_VERSION}-ubuntu-vulkan-x86_64.zip"
SPIRULA_SHA256="123d6d0b826388abb64129b6fcf2a8d34fe0662a57ba34e53212a148c891431d"
NV_VERSION="580.82.07"
NV_URL="https://us.download.nvidia.com/tesla/${NV_VERSION}/NVIDIA-Linux-x86_64-${NV_VERSION}.run"

log() { echo "[setup] $*"; }

# 1. GPU: the NVIDIA Vulkan driver files must match the session's driver version.
drv=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
log "GPU driver on session: ${drv}"
if [ "$drv" != "$NV_VERSION" ]; then
  log "WARNING: session driver ${drv} differs from ${NV_VERSION}; the Vulkan driver below may not match."
fi
if [ -f /etc/vulkan/icd.d/nvidia_icd.json ]; then
  log "NVIDIA Vulkan driver already installed"
else
  log "installing NVIDIA user-space driver ${NV_VERSION} (no kernel module)"
  curl -fsSL -o /content/nv.run "$NV_URL"
  sh /content/nv.run --silent --no-kernel-module --no-questions --ui=none \
    --no-x-check --no-nouveau-check --no-systemd --no-cc-version-check > /content/nv_install.log 2>&1 \
    || { tail -20 /content/nv_install.log; exit 1; }
fi

# 2. Spirula Studio (Linux Vulkan build), checked against its published SHA-256.
SPIRULA_DIR=/content/spirula
mkdir -p "$SPIRULA_DIR"
if [ -z "$(find "$SPIRULA_DIR/bin" -name spirula -type f 2>/dev/null | head -1)" ]; then
  log "downloading Spirula ${SPIRULA_VERSION}"
  curl -fsSL -o "$SPIRULA_DIR/spirula.zip" "$SPIRULA_URL"
  echo "${SPIRULA_SHA256}  $SPIRULA_DIR/spirula.zip" | sha256sum -c -
  unzip -q -o "$SPIRULA_DIR/spirula.zip" -d "$SPIRULA_DIR/bin"
fi
SPIRULA_BIN=$(find "$SPIRULA_DIR/bin" -name spirula -type f | head -1)
chmod +x "$SPIRULA_BIN"
log "Spirula binary: $SPIRULA_BIN"

# 3. Python packages and the headless browser used by the globe renderer.
log "installing Python packages"
python3 -m pip install -q numpy pillow playwright
python3 -m playwright install --with-deps chromium

# 4. Repository: only the folders training needs (sparse checkout).
if [ ! -d "$REPO_DIR/.git" ]; then
  log "cloning repository (sparse)"
  git clone -q --filter=blob:none --sparse "$REPO_URL" "$REPO_DIR"
fi
git -C "$REPO_DIR" sparse-checkout set source-models pipeline tiles tools schemas
git -C "$REPO_DIR" pull -q --ff-only

# 5. Data folder and environment for later cells.
mkdir -p "$DATA_ROOT/datasets"
cat > /content/env.sh <<EOF
export EARTH_GS_DATA="$DATA_ROOT"
export SPIRULA_BIN="$SPIRULA_BIN"
export REPO_DIR="$REPO_DIR"
EOF
log "done. Run 'source /content/env.sh' in each new cell that needs these paths."
"$SPIRULA_BIN" --help > /dev/null && log "Spirula runs"