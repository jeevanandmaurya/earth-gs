#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"
echo "Starting a Colab GPU session (T4). A sign-in page should open in your browser."
echo "Sign in with your Google account, then come back to this window."
echo
colab new --gpu T4 -s earth-gs-test
echo
echo "--- session status"
colab ls 2>&1 | head -20
echo
read -p "Press Enter to close"