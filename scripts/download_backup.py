#!/usr/bin/env python3
"""
Download a DB backup from the server.

Usage:
    python scripts/download_backup.py            # download latest
    python scripts/download_backup.py 2026-07-10 # download by date prefix
    python scripts/download_backup.py --list     # list available backups

Config — create .env.backup in the repo root (gitignored):
    BACKUP_SSH_HOST=80.87.201.25
    BACKUP_SSH_USER=root
    BACKUP_SSH_KEY=C:/Users/you/.ssh/id_rsa
    BACKUP_REMOTE_DIR=/root/backups
    BACKUP_LOCAL_DIR=backups
"""
import os
import sys
import subprocess
from pathlib import Path


def _load_env_backup() -> None:
    env_file = Path(__file__).parent.parent / ".env.backup"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip())


_load_env_backup()

HOST = os.getenv("BACKUP_SSH_HOST", "")
USER = os.getenv("BACKUP_SSH_USER", "root")
KEY = os.getenv("BACKUP_SSH_KEY", str(Path.home() / ".ssh" / "id_rsa"))
REMOTE_DIR = os.getenv("BACKUP_REMOTE_DIR", "/root/backups")
LOCAL_DIR = Path(os.getenv("BACKUP_LOCAL_DIR", "backups"))

_SSH_OPTS = ["-i", KEY, "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10"]


def _ssh(*cmd: str) -> str:
    result = subprocess.run(
        ["ssh", *_SSH_OPTS, f"{USER}@{HOST}", *cmd],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def _scp(remote_path: str, local_path: Path) -> None:
    subprocess.run(
        ["scp", *_SSH_OPTS, f"{USER}@{HOST}:{remote_path}", str(local_path)],
        check=True,
    )


def list_remote() -> list[str]:
    out = _ssh(f"ls -1 {REMOTE_DIR}/*.sql.gz 2>/dev/null || true")
    return sorted(line for line in out.splitlines() if line.strip())


def main() -> None:
    if not HOST:
        print("Error: BACKUP_SSH_HOST not set.")
        print("Create .env.backup in the repo root:")
        print("  BACKUP_SSH_HOST=80.87.201.25")
        print("  BACKUP_SSH_KEY=C:/Users/you/.ssh/id_rsa")
        sys.exit(1)

    arg = sys.argv[1] if len(sys.argv) > 1 else ""

    if arg == "--list":
        files = list_remote()
        if not files:
            print("No backups on server.")
        else:
            print(f"Backups on {HOST}:{REMOTE_DIR}")
            for f in files:
                print(" ", Path(f).name)
        return

    # Resolve which remote file to download
    if arg and arg != "--list":
        files = list_remote()
        matches = [f for f in files if arg in Path(f).name]
        if not matches:
            print(f"No backup matching '{arg}' on server.")
            sys.exit(1)
        remote_path = matches[-1]
    else:
        files = list_remote()
        if not files:
            print("No backups found on server.")
            sys.exit(1)
        remote_path = files[-1]

    filename = Path(remote_path).name
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    local_path = LOCAL_DIR / filename

    if local_path.exists():
        print(f"Already exists locally: {local_path}")
        return

    print(f"Downloading {filename} from {HOST} ...")
    _scp(remote_path, local_path)

    size_kb = local_path.stat().st_size // 1024
    print(f"Saved: {local_path} ({size_kb} KB)")
    print()
    print("To restore:")
    print(f"  gunzip -c {local_path} | psql -U learning_user learning_portal")


if __name__ == "__main__":
    main()
