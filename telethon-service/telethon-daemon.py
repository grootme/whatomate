#!/usr/bin/env python3
"""
Telethon Service Daemon - Persistent wrapper that restarts on failure.
"""
import os
import sys
import signal
import subprocess
import time

def run():
    os.chdir('/home/z/my-project/telethon-service')
    while True:
        print(f"[daemon] Starting Telethon Service...", flush=True)
        proc = subprocess.Popen(
            [sys.executable, '-m', 'uvicorn', 'server:app', '--host', '0.0.0.0', '--port', '8700', '--log-level', 'info'],
            cwd='/home/z/my-project/telethon-service',
        )
        # Wait for process to exit
        proc.wait()
        exit_code = proc.returncode
        print(f"[daemon] Process exited with code {exit_code}", flush=True)
        if exit_code == 0:
            break  # Clean exit
        print(f"[daemon] Restarting in 3 seconds...", flush=True)
        time.sleep(3)

if __name__ == '__main__':
    # Detach from parent
    if os.fork() > 0:
        sys.exit(0)
    os.setsid()
    run()
