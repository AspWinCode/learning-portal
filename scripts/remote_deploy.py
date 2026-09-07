import argparse
import shlex
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


# Единый лок для всех путей деплоя (этот скрипт, deploy/autodeploy.sh, deploy.sh).
# Одновременные `docker compose up` рвут recreate и оставляют контейнеры с
# префиксом-хэшем (<id>_learning-portal-backend-1).
DEPLOY_LOCK = "/tmp/learning-portal-deploy.lock"

# Долгоживущие сервисы, которым compose иногда не возвращает штатное имя после
# сорванного recreate — приводим имя в порядок без пересоздания контейнера.
FIX_RENAMED_CONTAINERS = (
    "for svc in backend app_worker app_scheduler app_delivery_worker web; do "
    'want="learning-portal-${svc}-1"; '
    "cid=$(docker ps -aq --filter label=com.docker.compose.project=learning-portal "
    "--filter label=com.docker.compose.service=${svc} | head -n1); "
    '[ -z "$cid" ] && continue; '
    "have=$(docker inspect -f '{{.Name}}' \"$cid\" | sed 's#^/##'); "
    'if [ -n "$have" ] && [ "$have" != "$want" ]; then '
    'echo "rename $have -> $want"; docker rm -f "$want" 2>/dev/null || true; '
    'docker rename "$have" "$want" || true; fi; done'
)


def locked(repo_dir: str, script: str) -> str:
    """Обернуть compose-команды во flock, чтобы не пересекаться с cron-автодеплоем."""
    body = f"cd {repo_dir} && {script}"
    return f"flock -w 600 {DEPLOY_LOCK} bash -lc {shlex.quote(body)}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--repo-dir")
    parser.add_argument(
        "--mode",
        choices=["deploy", "inspect", "inspect-patch", "status", "rebuild", "force-sync-deploy", "fix-orphans"],
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
                ("migrations", locked(repo_dir, "docker compose up -d db redis && docker compose run --rm migrator")),
                ("docker compose up", locked(repo_dir, "docker compose up -d --build --force-recreate --remove-orphans backend app_worker app_scheduler app_delivery_worker web")),
                ("fix renamed containers", locked(repo_dir, FIX_RENAMED_CONTAINERS)),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
            ]
        elif args.mode == "fix-orphans":
            commands = [
                ("compose ps (before)", f"cd {repo_dir} && docker compose ps"),
                ("fix renamed containers", locked(repo_dir, FIX_RENAMED_CONTAINERS)),
                ("docker compose up", locked(repo_dir, "docker compose up -d --remove-orphans")),
                ("prune stopped hash-prefixed leftovers", locked(
                    repo_dir,
                    "docker ps -a --filter label=com.docker.compose.project=learning-portal "
                    "--filter status=exited --filter status=created --format '{{.Names}}' "
                    "| { grep -E '^[0-9a-f]{12}_learning-portal-' || true; } | xargs -r docker rm -f",
                )),
                ("compose ps (after)", f"cd {repo_dir} && docker compose ps"),
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
                ("db/redis + migrations", locked(repo_dir, "docker compose up -d --build db redis && docker compose run --rm migrator")),
                ("docker compose up", locked(repo_dir, "docker compose up -d --build --remove-orphans")),
                ("fix renamed containers", locked(repo_dir, FIX_RENAMED_CONTAINERS)),
                ("revision", f"cd {repo_dir} && git rev-parse --short HEAD"),
                ("health", "curl -fsS http://127.0.0.1:8000/api/v1/health"),
                ("compose ps", f"cd {repo_dir} && docker compose ps"),
                ("final git status", f"cd {repo_dir} && git status --short"),
            ]
        else:
            commands = [
                ("git status", f"cd {repo_dir} && git status --short"),
                ("git pull", f"cd {repo_dir} && git fetch origin main && git checkout main && git pull --ff-only origin main"),
                ("db/redis + migrations", locked(repo_dir, "docker compose up -d --build db redis && docker compose run --rm migrator")),
                ("docker compose up", locked(repo_dir, "docker compose up -d --build --remove-orphans")),
                ("fix renamed containers", locked(repo_dir, FIX_RENAMED_CONTAINERS)),
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
