#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
echo "--- colab new --help"; colab new --help 2>&1 | head -25
echo "--- colab run --help"; colab run --help 2>&1 | head -25
echo "--- sessions file"; ls -la ~/.config/colab-cli/ 2>&1 | head -5