#!/bin/bash
set -e

# Get the directory of the script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

# Make python script executable if it isn't
chmod +x "$DIR/send_telemetry.py"

if command -v python3 &>/dev/null; then
    echo "[*] Executing python verification script..."
    python3 "$DIR/send_telemetry.py"
else
    echo "[-] Error: python3 is required to run the verification script."
    exit 1
fi
