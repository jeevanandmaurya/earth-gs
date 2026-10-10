#!/bin/bash
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
echo "--- upgrading google-colab-cli (no time limit; a 51 MB download can take a few minutes)"
uv tool install -U google-colab-cli 2>&1 | tail -8
echo "--- version now"
colab --version 2>/dev/null | head -2
echo "--- GPU check on earth-gs-test"
colab exec -s earth-gs-test -f /tmp/gpu_check.py > /tmp/exec_out.txt 2>&1
echo "exit code: $?"
grep -v "^│\|new version\|colab update\|enable_update" /tmp/exec_out.txt | tail -12
echo
read -p "Press Enter to close"