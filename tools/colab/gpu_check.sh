#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
cat > /tmp/gpu_check.py << 'PYEOF'
import subprocess, sys
print("python", sys.version.split()[0])
print(subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], capture_output=True, text=True).stdout.strip())
try:
    import torch
    print("torch", torch.__version__, "cuda available:", torch.cuda.is_available())
except Exception as e:
    print("torch not installed:", e)
PYEOF
colab exec -s earth-gs-test -f /tmp/gpu_check.py 2>&1 | grep -v "new version\|colab update\|enable_update_check" | head -20