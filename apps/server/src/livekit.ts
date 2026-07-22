import https from "node:https";
import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import { getLivekitEndpoints, getServerSettings } from "./settings.js";

const CN_HOST = process.env.HEZ_LK_CN_HOST || "1.94.102.147";

/** @deprecated prefer getLivekitUrl() — kept for log compatibility at boot */
export function getLivekitUrl(): string {
  return getServerSettings().livekitUrl;
}

/**
 * HTTP(S) base for LiveKit Room Service (/twirp).
 *
 * Client WSS URLs are not usable for Room Service:
 * - Seoul public wss:// only proxies /rtc, not /twirp → use loopback :17880
 * - CN path proxy /lk-cn hits CN :443 which only allows /rtc (POST /twirp → 405)
 *   → use https://CN:7880 (full reverse proxy to LiveKit, self-signed cert)
 */
export function getLivekitApiBase(): string {
  const override = process.env.LIVEKIT_API_URL?.trim();
  if (override) {
    return stripTrailingSlash(override.replace(/^ws/i, "http"));
  }

  const clientUrl = getLivekitUrl().trim();
  const matched = getLivekitEndpoints().find(
    (e) => e.url.toLowerCase() === clientUrl.toLowerCase(),
  );

  if (matched?.id === "seoul") {
    return stripTrailingSlash(process.env.HEZ_LK_SEOUL_API || "http://127.0.0.1:17880");
  }
  if (matched?.id === "cn") {
    return stripTrailingSlash(process.env.HEZ_LK_CN_API || `https://${CN_HOST}:7880`);
  }

  // Local / custom: ws://host:port → http://host:port
  try {
    const u = new URL(clientUrl.replace(/^ws/i, "http"));
    return `${u.protocol}//${u.host}`;
  } catch {
    return stripTrailingSlash(clientUrl.replace(/^ws/i, "http"));
  }
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/$/, "");
}

/** CN :7880 uses a self-signed cert; allow override via HEZ_LK_API_INSECURE=1 */
function needsInsecureTls(base: string): boolean {
  if (process.env.HEZ_LK_API_INSECURE === "1") return true;
  try {
    const u = new URL(base);
    return u.protocol === "https:" && u.hostname === CN_HOST;
  } catch {
    return false;
  }
}

type ListRoomsJson = {
  rooms?: Array<{ name?: string; num_participants?: number; numParticipants?: number }>;
};

async function twirpFetch<T>(method: string, body: object, grant: VideoGrant): Promise<T> {
  const { livekitApiKey, livekitApiSecret } = getServerSettings();
  const base = getLivekitApiBase();
  if (!base || !livekitApiKey || !livekitApiSecret) {
    throw new Error("LiveKit API base or credentials missing");
  }

  const at = new AccessToken(livekitApiKey, livekitApiSecret, { ttl: "10m" });
  at.addGrant(grant);
  const jwt = await at.toJwt();

  const url = `${base}/twirp/livekit.RoomService/${method}`;
  const payload = JSON.stringify(body);
  const insecure = needsInsecureTls(base);

  // Use node:https for insecure CN certs — undici/global fetch rejects self-signed.
  if (insecure || url.startsWith("https:")) {
    return await new Promise<T>((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || 443,
          path: `${u.pathname}${u.search}`,
          method: "POST",
          headers: {
            "Content-Type": "application/json;charset=UTF-8",
            Authorization: `Bearer ${jwt}`,
            "Content-Length": Buffer.byteLength(payload),
          },
          agent: new https.Agent({ rejectUnauthorized: !insecure }),
          timeout: 10_000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            if ((res.statusCode ?? 500) >= 400) {
              reject(new Error(`LiveKit ${method} ${res.statusCode}: ${text.slice(0, 240)}`));
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`LiveKit ${method} timeout`));
      });
      req.write(payload);
      req.end();
    });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      Authorization: `Bearer ${jwt}`,
    },
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LiveKit ${method} ${res.status}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as T;
}

async function listLivekitRooms(
  names: string[],
): Promise<Array<{ name: string; numParticipants: number }>> {
  const data = await twirpFetch<ListRoomsJson>("ListRooms", { names }, { roomList: true });
  return (data.rooms ?? [])
    .filter((r): r is typeof r & { name: string } => Boolean(r.name))
    .map((r) => ({
      name: r.name,
      numParticipants: Number(r.num_participants ?? r.numParticipants ?? 0),
    }));
}

export async function createRoomToken(opts: {
  roomName: string;
  identity: string;
  displayName: string;
}): Promise<string> {
  const { livekitApiKey, livekitApiSecret } = getServerSettings();
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: opts.identity,
    name: opts.displayName,
    ttl: "2h",
  });

  token.addGrant({
    roomJoin: true,
    room: opts.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

/**
 * Get participant count for a LiveKit room.
 * Returns 0 if the room doesn't exist or has no participants.
 */
export async function getRoomParticipantCount(roomName: string): Promise<number> {
  try {
    const rooms = await listLivekitRooms([roomName]);
    return rooms[0]?.numParticipants ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get participant counts for multiple LiveKit rooms.
 * Uses a single ListRooms call (numParticipants).
 */
export async function getRoomParticipantCounts(
  roomNames: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  for (const name of roomNames) {
    map[name] = 0;
  }
  if (roomNames.length === 0) return map;

  const { livekitApiKey, livekitApiSecret } = getServerSettings();
  if (!getLivekitApiBase() || !livekitApiKey || !livekitApiSecret) {
    console.warn(
      `[hez] LiveKit API base/credentials missing; participant counts skipped (base=${getLivekitApiBase() || "(empty)"})`,
    );
    return map;
  }

  try {
    const rooms = await listLivekitRooms(roomNames);
    for (const room of rooms) {
      map[room.name] = room.numParticipants;
    }
  } catch (err) {
    console.warn(
      `[hez] LiveKit ListRooms failed (api=${getLivekitApiBase()}):`,
      err instanceof Error ? err.message : err,
    );
  }
  return map;
}
