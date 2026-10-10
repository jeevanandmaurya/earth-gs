#!/bin/bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
pkill -f "colab update --install" 2>/dev/null; pkill -f "uv tool install" 2>/dev/null; sleep 2
echo "--- upgrading with uv (limit 240 s)"
timeout 240 uv tool install -U google-colab-cli 2>&1 | tail -6
echo "--- version now"
colab --version 2>/dev/null | head -2
echo "--- GPU check on earth-gs-test"
colab exec -s earth-gs-test -f /tmp/gpu_check.py > /tmp/exec_out.txt 2>&1
echo "exit code: $?"
grep -v "^│\|new version\|colab update\|enable_update" /tmp/exec_out.txt | tail -12