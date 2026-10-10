#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
echo "--- upgrading the Colab CLI"
colab update --install 2>&1 | grep -v "new version\|enable_update" | tail -5
colab --version 2>/dev/null
echo "--- retrying the GPU check on session earth-gs-test"
colab exec -s earth-gs-test -f /tmp/gpu_check.py > /tmp/exec_out.txt 2>&1
echo "exit code: $?"
grep -v "^│\|new version\|colab update\|enable_update" /tmp/exec_out.txt | tail -12