"""Bootstrap Hez on Seoul server 43.108.12.78 (hez.zhutairo.top)."""
from __future__ import annotations

import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

OLD_HOST = "1.94.102.147"
HOST = "43.108.12.78"
USER = "root"
PASSWORD = "liwei0.123"
ROOT = Path(r"D:\GitHub\Hez")
REMOTE = "/opt/hez"
DOMAIN = "hez.zhutairo.top"

EXCLUDE_DIRS = {"node_modules", ".git", "dist", "data", "tools", "agent-transcripts"}
EXCLUDE_FILES = {".env", "hez.db", "livekit.out.log", "livekit.err.log"}


def skip(path: Path) -> bool:
    if set(path.parts) & EXCLUDE_DIRS:
        return True
    if path.name in EXCLUDE_FILES:
        return True
    if path.suffix in {".db", ".exe", ".log", ".tsbuildinfo"}:
        return True
    return False


def connect(host: str) -> paramiko.SSHClient:
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port=22, username=USER, password=PASSWORD, timeout=45)
    return ssh


def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 600, check: bool = True):
    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    text = (out + "\n" + err)[-8000:]
    # keep console readable on Windows
    print(text.encode("ascii", "replace").decode("ascii"))
    print("exit", code)
    if check and code != 0:
        raise RuntimeError(f"cmd failed ({code}): {cmd}")
    return code, out, err


def sftp_put_bytes(ssh: paramiko.SSHClient, data: bytes, remote_path: str):
    sftp = ssh.open_sftp()
    with sftp.file(remote_path, "wb") as rf:
        rf.write(data)
    sftp.close()


def sftp_get_bytes(ssh: paramiko.SSHClient, remote_path: str) -> bytes:
    sftp = ssh.open_sftp()
    with sftp.file(remote_path, "rb") as rf:
        data = rf.read()
    sftp.close()
    return data


def build_archive() -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for name in filenames:
                full = Path(dirpath) / name
                rel = full.relative_to(ROOT)
                if skip(rel):
                    continue
                tar.add(full, arcname=str(rel).replace("\\", "/"))
    payload = buf.getvalue()
    print(f"archive {len(payload) / 1024 / 1024:.2f} MB")
    return payload


NGINX_CONF = r"""
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name hez.zhutairo.top 43.108.12.78 _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://hez.zhutairo.top$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name hez.zhutairo.top;

    ssl_certificate     /etc/letsencrypt/live/hez.zhutairo.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hez.zhutairo.top/privkey.pem;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /opt/hez/apps/web/dist;
    index index.html;
    client_max_body_size 10m;

    location ~ ^/rtc {
        proxy_pass http://127.0.0.1:17880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        try_files $uri /index.html;
    }
}

# Fallback WSS on 7880 without http2 (WebSocket-friendly)
server {
    listen 7880 ssl;
    listen [::]:7880 ssl;
    server_name hez.zhutairo.top;

    ssl_certificate     /etc/letsencrypt/live/hez.zhutairo.top/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hez.zhutairo.top/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://127.0.0.1:17880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
"""

NGINX_HTTP_ONLY = r"""
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name hez.zhutairo.top 43.108.12.78 _;

    root /opt/hez/apps/web/dist;
    index index.html;
    client_max_body_size 10m;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }
}
"""

ENV_FILE = f"""PORT=3001
JWT_SECRET=hez-cloud-change-me-9f3a2c8e7b1d
DATABASE_PATH=./data/hez.db
LIVEKIT_URL=wss://1.94.102.147
LIVEKIT_API_KEY=APIhezdevkey
LIVEKIT_API_SECRET=hez_dev_secret_change_me_in_production
HEZ_LAN_IP={HOST}
CORS_ORIGIN=https://{DOMAIN},https://{HOST},http://{HOST},http://localhost:5173
HEZ_DEMO=0
"""


def fix_apt_sources(ssh: paramiko.SSHClient):
    """Debian 10 is EOL; Aliyun mirrors 404 — use archive.debian.org."""
    sources = (
        "deb http://archive.debian.org/debian buster main contrib non-free\n"
        "deb http://archive.debian.org/debian-security buster/updates main contrib non-free\n"
        "deb http://archive.debian.org/debian buster-updates main contrib non-free\n"
    )
    write_remote_file(ssh, "/etc/apt/sources.list", sources)
    run(
        ssh,
        "mkdir -p /etc/apt/sources.list.d.bak; "
        "mv /etc/apt/sources.list.d/* /etc/apt/sources.list.d.bak/ 2>/dev/null || true; "
        "printf 'Acquire::Check-Valid-Until \"false\";\\n' "
        "> /etc/apt/apt.conf.d/99no-check-valid-until",
        check=False,
    )


def install_packages(ssh: paramiko.SSHClient):
    fix_apt_sources(ssh)
    run(
        ssh,
        "export DEBIAN_FRONTEND=noninteractive; "
        "apt-get update -y && "
        "apt-get install -y curl ca-certificates gnupg lsb-release "
        "apt-transport-https "
        "nginx sqlite3 ufw xz-utils",
        timeout=900,
    )

    # Node 20 official binary (NodeSource no longer supports buster cleanly)
    run(
        ssh,
        "if ! command -v node >/dev/null || ! node -v | grep -qE 'v20|v22'; then "
        "cd /tmp && "
        "curl -fsSLO https://nodejs.org/dist/v20.20.2/node-v20.20.2-linux-x64.tar.xz && "
        "tar -xJf node-v20.20.2-linux-x64.tar.xz -C /usr/local --strip-components=1 && "
        "ln -sfn /usr/local/bin/node /usr/bin/node && "
        "ln -sfn /usr/local/bin/npm /usr/bin/npm && "
        "ln -sfn /usr/local/bin/npx /usr/bin/npx; fi",
        timeout=300,
    )

    # Docker (get.docker.com fails on buster due to missing docker-model-plugin)
    run(
        ssh,
        "if ! command -v docker >/dev/null; then "
        "install -m 0755 -d /etc/apt/keyrings && "
        "curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && "
        "chmod a+r /etc/apt/keyrings/docker.asc && "
        'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] '
        'https://download.docker.com/linux/debian buster stable" '
        "> /etc/apt/sources.list.d/docker.list && "
        "apt-get update -y && "
        "DEBIAN_FRONTEND=noninteractive apt-get install -y "
        "docker-ce docker-ce-cli containerd.io "
        "docker-compose-plugin docker-buildx-plugin; fi",
        timeout=900,
    )
    run(ssh, "systemctl enable --now docker", check=False)

    # certbot (buster package is fine for webroot mode)
    run(
        ssh,
        "export DEBIAN_FRONTEND=noninteractive; "
        "apt-get install -y certbot",
        timeout=600,
        check=False,
    )

    run(ssh, "node -v && npm -v && docker -v && nginx -v")


def copy_db_from_old(seoul: paramiko.SSHClient):
    print("\n=== copy DB from old server ===")
    old = connect(OLD_HOST)
    # Prefer WAL checkpoint via node/better-sqlite3 if available; else copy db+wal+shm
    run(
        old,
        "cd /opt/hez/apps/server && "
        "node -e \"const Database=require('better-sqlite3'); "
        "const db=new Database('data/hez.db'); "
        "db.pragma('wal_checkpoint(FULL)'); db.close();\" "
        "&& cp -f data/hez.db /tmp/hez-export.db || cp -f data/hez.db /tmp/hez-export.db",
        check=False,
    )
    run(old, "ls -la /opt/hez/apps/server/data/ /tmp/hez-export.db", check=False)
    db = sftp_get_bytes(old, "/tmp/hez-export.db")
    # also pull wal/shm if still present (uncheckpointed)
    extras = {}
    for name in ("hez.db-wal", "hez.db-shm"):
        try:
            extras[name] = sftp_get_bytes(old, f"/opt/hez/apps/server/data/{name}")
        except OSError:
            pass
    old.close()
    print(f"db bytes {len(db)}; extras {list(extras)}")
    run(seoul, f"mkdir -p {REMOTE}/apps/server/data")
    sftp_put_bytes(seoul, db, f"{REMOTE}/apps/server/data/hez.db")
    for name, blob in extras.items():
        sftp_put_bytes(seoul, blob, f"{REMOTE}/apps/server/data/{name}")
    run(seoul, f"ls -la {REMOTE}/apps/server/data/")


def write_remote_file(ssh: paramiko.SSHClient, remote_path: str, content: str):
    sftp_put_bytes(ssh, content.encode("utf-8"), remote_path)


def main():
    payload = build_archive()
    ssh = connect(HOST)

    print("\n=== install packages ===")
    install_packages(ssh)

    print("\n=== upload code ===")
    remote_tar = "/tmp/hez-seoul.tgz"
    sftp_put_bytes(ssh, payload, remote_tar)
    run(ssh, f"mkdir -p {REMOTE} && tar -xzf {remote_tar} -C {REMOTE}")

    print("\n=== env / nginx http ===")
    run(ssh, f"mkdir -p {REMOTE}/apps/server/data /var/www/certbot")
    write_remote_file(ssh, f"{REMOTE}/apps/server/.env", ENV_FILE)
    write_remote_file(ssh, f"{REMOTE}/apps/server/.env.cloud", ENV_FILE)
    write_remote_file(ssh, "/etc/nginx/sites-available/hez", NGINX_HTTP_ONLY)
    run(
        ssh,
        "rm -f /etc/nginx/sites-enabled/default; "
        "ln -sfn /etc/nginx/sites-available/hez /etc/nginx/sites-enabled/hez; "
        "nginx -t && systemctl enable nginx && systemctl restart nginx",
    )

    copy_db_from_old(ssh)

    print("\n=== npm build (inside node:20 container; host glibc is too old) ===")
    run(ssh, f"rm -rf {REMOTE}/node_modules {REMOTE}/apps/*/node_modules", check=False)
    run(ssh, "docker pull node:20-bookworm && docker pull node:20-bookworm-slim", timeout=600)
    run(
        ssh,
        f"docker run --rm -v {REMOTE}:/app -w /app node:20-bookworm bash -lc "
        f"'apt-get update -qq && "
        f"DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 make g++ >/dev/null && "
        f"npm install && "
        f"npm run build --workspace=@hez/server && "
        f"npm run build --workspace=@hez/web'",
        timeout=1200,
    )

    print("\n=== firewall ===")
    run(
        ssh,
        "ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; "
        "ufw allow 7880/tcp; ufw allow 7881/tcp; ufw allow 7882/udp; "
        "yes | ufw enable || true; ufw status",
        check=False,
    )

    print("\n=== livekit + api containers ===")
    run(
        ssh,
        f"cd {REMOTE} && docker compose -f docker-compose.cloud.yml pull && "
        f"docker compose -f docker-compose.cloud.yml up -d",
        timeout=600,
    )
    run(
        ssh,
        f"cd {REMOTE} && docker compose -f docker-compose.app.yml up -d --force-recreate",
        timeout=300,
    )
    time.sleep(2)
    run(ssh, "curl -sS http://127.0.0.1:3001/api/health", check=False)

    print("\n=== certbot ===")
    run(
        ssh,
        f"certbot certonly --webroot -w /var/www/certbot "
        f"-d {DOMAIN} --non-interactive --agree-tos "
        f"--register-unsafely-without-email --keep-until-expiring",
        timeout=300,
    )
    write_remote_file(ssh, "/etc/nginx/sites-available/hez", NGINX_CONF)
    run(ssh, "nginx -t && systemctl reload nginx")

    # cert renew hook
    run(
        ssh,
        "mkdir -p /etc/letsencrypt/renewal-hooks/deploy && "
        "printf '%s\\n' '#!/bin/sh' 'systemctl reload nginx' "
        "> /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh && "
        "chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh",
        check=False,
    )

    time.sleep(1)
    print("\n=== verify ===")
    run(ssh, "curl -sS http://127.0.0.1:3001/api/health", check=False)
    run(ssh, f"curl -sS -o /dev/null -w '%{{http_code}}\\n' https://{DOMAIN}/", check=False)
    run(ssh, f"curl -sS https://{DOMAIN}/api/health", check=False)
    run(ssh, "docker ps --format 'table {{.Names}}\\t{{.Status}}'", check=False)
    run(ssh, "ss -tlnp | head -40", check=False)

    ssh.close()
    print(f"\nDEPLOY OK — https://{DOMAIN}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
        sys.exit(1)
