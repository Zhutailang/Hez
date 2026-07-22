import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "ssh2";
import { getLivekitEndpoints } from "./settings.js";

const execFileAsync = promisify(execFile);

const LOCAL_DIR = process.env.HEZ_LK_LOCAL_DIR || "/opt/hez";
const CN_HOST = process.env.HEZ_LK_CN_HOST || "1.94.102.147";
const CN_USER = process.env.HEZ_LK_CN_USER || "root";
const CN_PASSWORD = process.env.HEZ_LK_CN_PASSWORD || "";
const CN_DIR = process.env.HEZ_LK_CN_DIR || "/opt/hez";
const COMPOSE_FILE = "docker-compose.cloud.yml";

export type LivekitControlResult = {
  activeId: string | null;
  started: string[];
  stopped: string[];
  skipped: string[];
  errors: string[];
};

function shellQuote(path: string): string {
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

async function localCompose(action: "up" | "stop"): Promise<string> {
  const args =
    action === "up"
      ? ["compose", "-f", COMPOSE_FILE, "up", "-d"]
      : ["compose", "-f", COMPOSE_FILE, "stop"];
  const { stdout, stderr } = await execFileAsync("docker", args, {
    cwd: LOCAL_DIR,
    timeout: 120_000,
    maxBuffer: 2_000_000,
  });
  return `${stdout || ""}${stderr || ""}`.trim();
}

function remoteCompose(action: "up" | "stop"): Promise<string> {
  if (!CN_PASSWORD) {
    return Promise.reject(
      new Error("未配置 HEZ_LK_CN_PASSWORD，无法远程控制国内 LiveKit"),
    );
  }

  const remoteCmd =
    action === "up"
      ? `cd ${shellQuote(CN_DIR)} && docker compose -f ${COMPOSE_FILE} up -d`
      : `cd ${shellQuote(CN_DIR)} && docker compose -f ${COMPOSE_FILE} stop`;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        conn.end();
        reject(new Error(`SSH 超时: ${CN_HOST}`));
      }
    }, 120_000);

    conn
      .on("ready", () => {
        conn.exec(remoteCmd, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            settled = true;
            conn.end();
            reject(err);
            return;
          }
          let out = "";
          stream
            .on("close", (code: number) => {
              clearTimeout(timer);
              settled = true;
              conn.end();
              if (code !== 0) {
                reject(new Error(`国内节点 docker 退出码 ${code}: ${out.slice(-800)}`));
              } else {
                resolve(out.trim());
              }
            })
            .on("data", (d: Buffer) => {
              out += d.toString("utf8");
            });
          stream.stderr.on("data", (d: Buffer) => {
            out += d.toString("utf8");
          });
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect({
        host: CN_HOST,
        port: 22,
        username: CN_USER,
        password: CN_PASSWORD,
        readyTimeout: 30_000,
      });
  });
}

async function startNode(id: "cn" | "seoul"): Promise<void> {
  if (id === "seoul") await localCompose("up");
  else await remoteCompose("up");
}

async function stopNode(id: "cn" | "seoul"): Promise<void> {
  if (id === "seoul") await localCompose("stop");
  else await remoteCompose("stop");
}

/**
 * Start the LiveKit matching the selected URL; stop the other builtin node.
 * Custom endpoints: stop both builtins (cannot auto-manage custom hosts).
 */
export async function applyLivekitNodeSelection(
  livekitUrl: string,
): Promise<LivekitControlResult> {
  const result: LivekitControlResult = {
    activeId: null,
    started: [],
    stopped: [],
    skipped: [],
    errors: [],
  };

  const endpoints = getLivekitEndpoints();
  const matched = endpoints.find(
    (e) => e.url.toLowerCase() === livekitUrl.trim().toLowerCase(),
  );
  const activeId = matched?.id ?? null;
  result.activeId = activeId;

  const wantCn = activeId === "cn";
  const wantSeoul = activeId === "seoul";

  for (const id of ["cn", "seoul"] as const) {
    const shouldRun = id === "cn" ? wantCn : wantSeoul;
    try {
      if (shouldRun) {
        console.log(`[hez] LiveKit control: starting ${id}`);
        await startNode(id);
        result.started.push(id);
      } else {
        console.log(`[hez] LiveKit control: stopping ${id}`);
        await stopNode(id);
        result.stopped.push(id);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[hez] LiveKit control failed (${id}):`, msg);
      result.errors.push(`${id}: ${msg}`);
    }
  }

  if (!wantCn && !wantSeoul) {
    result.skipped.push("custom-endpoint-no-remote-lifecycle");
  }

  return result;
}
