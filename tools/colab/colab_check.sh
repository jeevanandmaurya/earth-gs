#!/bin/bash
set -u
python3 -m pip install -q --user google-colab-cli 2>&1 | tail -3
export PATH="$HOME/.local/bin:$PATH"
echo "--- colab --help"
colab --help 2>&1 | head -40