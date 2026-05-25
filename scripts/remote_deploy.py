import argparse
import sys
from typing import Optional, Tuple

import paramiko


def run_command(client: paramiko.SSHClient, command: str) -> Tuple[int, str, str]:
    stdin, stdout, stderr = client.exec_command(command)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    return exit_status, out, err


def resolve_repo_dir(client: paramiko.SSHClient, explicit_dir: Optional[str]) -> str:
    if explicit_dir:
        return explicit_dir

    candidates = [
        "/root/learning-portal",
        "/root/learning-portal-main",
        "/opt/learning-portal",
        "/srv/learning-portal",
    ]
    for candidate in candidates:
        code, out, _ = run_command(client, f"test -d {candidate} && echo OK")
        if code == 0 and "OK" in out:
            return candidate
    raise RuntimeError("Could not detect remote repository directory.")


def print_block(title: str, content: str) -> None:
    print(f"\n=== {title} ===")
    print(content.strip() or "<empty>")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--repo-dir")
    parser.add_argument(
        "--mode",
        choices=["deploy", "inspect", "inspect-patch", "status", "rebuild", "force-sync-deploy"],
        default="deploy",
    )
    args = parser.parse_args()

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(args.host, username=args.user, password=args.password, timeout=20)

    try:
        repo_dir = resolve_repo_dir(client, args.repo_dir)
        print(f"Remote repo dir: {repo_dir}")

        if args.mode == "inspect":
            commands = [
                ("git status", f"cd {repo_dir} && git status --short"),
                ("branch state", f"cd {repo_dir} && git rev-list --left-right --count origin/main...HEAD"),
                ("recent log", f"cd {repo_dir} && git log --oneline --decorate --graph -5 --all"),
                ("local diff", f"cd {repo_dir} && git diff --stat"),
                ("ahead diff", f"cd {repo_dir} && git diff --stat origin/main..HEAD"),
            ]
        elif args.mode == "inspect-patch":
            commands = [
                ("git status", f"cd {repo_dir} && git status --short"),
                ("local patch", f"cd {repo_dir} && git diff -- backend/app/database.py docker-compose.yml frontend/Caddyfile learning-portal-main/frontend/Caddyfile"),
                ("server commit patch", f"cd {repo_dir} && git show --stat --patch --max-count=1 HEAD"),
            ]
        elif args.mode == "status":
            commands = [
                ("revision", f"cd {repo_dir} && git rev-parse --short HEAD"),
                ("git status", f"cd {repo_dir} && git status --short"),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
            ]
        elif args.mode == "rebuild":
            commands = [
                ("revision", f"cd {repo_dir} && git rev-parse --short HEAD"),
                ("git status", f"cd {repo_dir} && git status --short"),
                ("docker compose up", f"cd {repo_dir} && docker compose up -d --build --force-recreate backend app_worker app_scheduler web"),
                ("migrations", f"cd {repo_dir} && docker compose exec -T backend alembic upgrade head"),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
            ]
        elif args.mode == "force-sync-deploy":
            commands = [
                ("git status", f"cd {repo_dir} && git status --short"),
                ("backup branch", f"cd {repo_dir} && git branch deploy-backup-$(date +%Y%m%d-%H%M%S)"),
                ("stash local changes", f"cd {repo_dir} && git stash push --include-untracked -m codex-deploy-backup-$(date +%Y%m%d-%H%M%S)"),
                ("fetch", f"cd {repo_dir} && git fetch origin main"),
                ("hard reset", f"cd {repo_dir} && git checkout main && git reset --hard origin/main"),
                ("clean untracked", f"cd {repo_dir} && git clean -fd"),
                ("restore server config", f"cd {repo_dir} && git checkout stash@{{0}} -- docker-compose.yml frontend/Caddyfile"),
                ("docker compose up", f"cd {repo_dir} && docker compose up -d --build"),
                ("migrations", f"cd {repo_dir} && docker compose exec -T backend alembic upgrade head"),
                ("revision", f"cd {repo_dir} && git rev-parse --short HEAD"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
                ("final git status", f"cd {repo_dir} && git status --short"),
            ]
        else:
            commands = [
                ("git status", f"cd {repo_dir} && git status --short"),
                ("git pull", f"cd {repo_dir} && git fetch origin main && git checkout main && git pull --ff-only origin main"),
                ("docker compose up", f"cd {repo_dir} && docker compose up -d --build"),
                ("migrations", f"cd {repo_dir} && docker compose exec -T backend alembic upgrade head"),
                ("revision", f"cd {repo_dir} && git rev-parse --short HEAD"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
            ]

        for title, command in commands:
            code, out, err = run_command(client, command)
            print_block(title, out)
            if err.strip():
                print_block(f"{title} stderr", err)
            if code != 0:
                print(f"\nFAILED at step: {title} (exit {code})")
                return code

        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main())
