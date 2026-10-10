#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
colab exec -s earth-gs-test -f /tmp/gpu_check.py > /tmp/exec_out.txt 2>&1
echo "exit code: $?"
grep -v "^│ *│\|new version\|colab update\|enable_update" /tmp/exec_out.txt | tail -25
echo "--- session list"
colab ls 2>&1 | tail -8