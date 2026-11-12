import os
import subprocess

def unload_launchd():
    user_home = os.path.expanduser("~")
    plist_path = os.path.join(user_home, "Library", "LaunchAgents", "com.browserbrain.backend.plist")
    subprocess.run(["launchctl", "unload", plist_path])
    print(f"Launch agent unloaded: {plist_path}")

if __name__ == "__main__":
    unload_launchd()