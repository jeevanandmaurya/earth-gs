#!/usr/bin/env bash
# Keeps training data and checkpoints safe on Google Drive, so a lost Colab session loses nothing.
#   bash tools/colab/sync_to_drive.sh sync [interval_seconds]   copy local -> Drive every interval (default 600 s); run until stopped
#   bash tools/colab/sync_to_drive.sh restore                  copy Drive -> local, for a new session
# Drive must be mounted first: from google.colab import drive; drive.mount('/content/drive')
set -uo pipefail

DATA_ROOT="${EARTH_GS_DATA:-/content/earth-gs-data}"
DRIVE_ROOT="${DRIVE_ROOT:-/content/drive/MyDrive/earth-gs}"
mode="${1:-sync}"

if [ ! -d /content/drive/MyDrive ]; then
  echo "Google Drive is not mounted. Mount it first in a Colab cell."
  exit 1
fi

if [ "$mode" = "restore" ]; then
  mkdir -p "$DATA_ROOT/datasets"
  cp -r -u "$DRIVE_ROOT/datasets/." "$DATA_ROOT/datasets/" && echo "restored from Drive"
  exit 0
fi

interval="${2:-600}"
mkdir -p "$DRIVE_ROOT/datasets"
while true; do
  # images, sfm, poses, alignment and checkpoints of every dataset; cp -u copies only what changed
  cp -r -u "$DATA_ROOT/datasets/." "$DRIVE_ROOT/datasets/" 2>/dev/null
  echo "$(date +%H:%M:%S) synced to Drive"
  sleep "$interval"
done