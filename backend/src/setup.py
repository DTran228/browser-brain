import os
import sys
import subprocess
import argparse

PLIST_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.browserbrain.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>{python_path}</string>
        <string>{source_path}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>{working_dir}</string>
    <key>StandardOutPath</key>
    <string>{log_path}</string>
    <key>StandardErrorPath</key>
    <string>{err_path}</string>
</dict>
</plist>
"""

def setup_launchd():
    main_dir = os.path.abspath(os.path.expanduser("~/.browser-brain"))
    if not os.path.exists(main_dir):
        os.makedirs(main_dir, exist_ok=True)
        print(f"Created main directory at {main_dir}")

    user_home = os.path.expanduser("~")
    python_path = sys.executable
    source_path = os.path.abspath(os.path.join(user_home, "repos", "browser-brain", "backend", "src", "main.py"))
    working_dir = os.path.abspath(os.path.join(user_home, "repos", "browser-brain", "backend"))
    log_path = os.path.join(main_dir, "browserbrain.log")
    err_path = os.path.join(main_dir, "browserbrain.err")
    plist_path = os.path.join(user_home, "Library", "LaunchAgents", "com.browserbrain.backend.plist")

    plist_content = PLIST_TEMPLATE.format(
        python_path=python_path,
        source_path=source_path,
        working_dir=working_dir,
        log_path=log_path,
        err_path=err_path
    )

    # Write the plist file
    os.makedirs(os.path.dirname(plist_path), exist_ok=True)
    with open(plist_path, "w") as f:
        f.write(plist_content)
    print(f"Plist written to {plist_path}")

    # Unload the launch agent if it exists
    if os.path.exists(plist_path):
        print("Unloading existing launch agent...")
        try:
            subprocess.run(
                ["launchctl", "unload", plist_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False
            )
        except Exception:
            pass  # Silently ignore any errors

    # Load the launch agent
    subprocess.run(["launchctl", "load", plist_path])
    print("Launch agent loaded. The backend will now run on login.")

def write_env_file(openai_api_key):
    # Write .env file at ../.env relative to this script
    env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    with open(env_path, "w") as f:
        f.write(f'OPENAI_API_KEY="{openai_api_key}"\n')
    print(f".env file written to {env_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup backend and write .env file")
    parser.add_argument("openai_api_key", help="Your OpenAI API key")
    args = parser.parse_args()

    write_env_file(args.openai_api_key)
    setup_launchd()