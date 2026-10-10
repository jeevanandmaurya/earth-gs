#!/bin/bash
ps -eo pid,etime,cmd | grep -i "colab\|pip\|uv " | grep -v grep | head -10
echo "--- colab log tail"
tail -5 ~/.config/colab-cli/colab.log 2>/dev/null