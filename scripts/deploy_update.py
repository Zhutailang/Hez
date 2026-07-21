"""Deploy latest Hez web+server to cloud (no HEZ_DEMO)."""
import io
import os
import sys
import tarfile
import time
from pathlib import Path

import paramiko

HOST = "1.94.102.147"
USER = "root"
PASSWORD = "liwei0.123"
ROOT = Path(r"D:\GitHub\Hez")
REMOTE = "/opt/hez"

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


def run(ssh, cmd, timeout=600, check=True):
    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    text = (out + "\n" + err)[-5000:].encode("ascii", "replace").decode("ascii")
    if text.strip():
        print(text)
    print("exit", code)
    if check and code != 0:
        raise RuntimeError(cmd)
    return code, out


def main():
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

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=22, username=USER, password=PASSWORD, timeout=30)
    sftp = ssh.open_sftp()
    remote_tar = "/tmp/hez-update.tgz"
    with sftp.file(remote_tar, "wb") as rf:
        rf.write(payload)
    sftp.close()

    run(ssh, f"mkdir -p {REMOTE} && tar -xzf {remote_tar} -C {REMOTE}")
    # Keep existing production .env if present
    run(
        ssh,
        f"test -f {REMOTE}/apps/server/.env || "
        f"(test -f {REMOTE}/apps/server/.env.cloud && cp {REMOTE}/apps/server/.env.cloud {REMOTE}/apps/server/.env) || true",
        check=False,
    )
    # Ensure demo mode is OFF in production
    run(
        ssh,
        f"grep -q '^HEZ_DEMO=' {REMOTE}/apps/server/.env 2>/dev/null && "
        f"sed -i 's/^HEZ_DEMO=.*/HEZ_DEMO=0/' {REMOTE}/apps/server/.env || "
        f"echo 'HEZ_DEMO=0' >> {REMOTE}/apps/server/.env",
        check=False,
    )

    run(ssh, f"cd {REMOTE} && npm install", timeout=600)
    run(ssh, f"cd {REMOTE} && npm run build --workspace=@hez/server", timeout=180)
    run(ssh, f"cd {REMOTE} && npm run build --workspace=@hez/web", timeout=300)
    run(ssh, "systemctl restart hez-api && sleep 1 && systemctl is-active hez-api")
    run(ssh, "nginx -t && systemctl reload nginx", check=False)

    time.sleep(1)
    run(ssh, "curl -sS http://127.0.0.1:3001/api/health", check=False)
    run(ssh, "curl -sS -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:8080/", check=False)
    run(ssh, "curl -sS -o /dev/null -w '%{http_code}\\n' https://hez.zhutairo.top/ || true", check=False)

    # Confirm new assets exist
    run(ssh, f"ls -la {REMOTE}/apps/web/dist/assets | head -20", check=False)
    run(ssh, f"test -f {REMOTE}/apps/web/src/components/PeerField.tsx && echo PeerField_OK", check=False)

    ssh.close()
    print("\nDEPLOY OK — production updated (demo features now in formal Room/Lobby UI)")
    print("Open: https://hez.zhutairo.top")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR:", type(e).__name__, e)
        sys.exit(1)
