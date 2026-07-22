import { nanoid } from "nanoid";
import { db } from "./db.js";

export type LivekitEndpoint = {
  id: string;
  label: string;
  url: string;
  /** Built-in presets cannot be deleted from the admin UI. */
  builtin?: boolean;
};

export type ServerSettings = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitEndpoints: LivekitEndpoint[];
};

const KEY_MAP = {
  livekitUrl: "livekit_url",
  livekitApiKey: "livekit_api_key",
  livekitApiSecret: "livekit_api_secret",
} as const;

const ENDPOINTS_KEY = "livekit_endpoints";

/** Two known deployments — always present in the selectable list. */
export const BUILTIN_LIVEKIT_ENDPOINTS: LivekitEndpoint[] = [
  {
    id: "cn",
    // Signaling via Seoul HTTPS proxy (/lk-cn → China LiveKit) to avoid self-signed IP WSS blocks.
    // Media ICE still uses China public IP from the LiveKit node.
    label: "国内",
    url: "wss://hez.zhutairo.top/lk-cn",
    builtin: true,
  },
  {
    id: "seoul",
    label: "首尔",
    url: "wss://hez.zhutairo.top",
    builtin: true,
  },
];

const DEFAULTS = {
  livekitUrl: process.env.LIVEKIT_URL || "wss://hez.zhutairo.top/lk-cn",
  livekitApiKey: process.env.LIVEKIT_API_KEY || "APIhezdevkey",
  livekitApiSecret:
    process.env.LIVEKIT_API_SECRET || "hez_dev_secret_change_me_in_production",
};

/** Old direct-IP URL that browsers often block from hez.zhutairo.top */
const LEGACY_CN_URL = "wss://1.94.102.147";
const PROXY_CN_URL = "wss://hez.zhutairo.top/lk-cn";

function getRaw(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function setRaw(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

export function getSetting(key: keyof typeof KEY_MAP): string {
  return getRaw(KEY_MAP[key]) || DEFAULTS[key];
}

function normalizeEndpoint(raw: unknown): LivekitEndpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = typeof e.id === "string" ? e.id : "";
  const label = typeof e.label === "string" ? e.label.trim() : "";
  const url = typeof e.url === "string" ? e.url.trim() : "";
  if (!id || !label || !/^wss?:\/\//i.test(url)) return null;
  return {
    id,
    label,
    url,
    builtin: Boolean(e.builtin),
  };
}

/** Merge stored custom endpoints with builtins (builtins win on same id). */
export function getLivekitEndpoints(): LivekitEndpoint[] {
  const raw = getRaw(ENDPOINTS_KEY);
  let custom: LivekitEndpoint[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        custom = parsed
          .map(normalizeEndpoint)
          .filter((e): e is LivekitEndpoint => Boolean(e) && !e!.builtin);
      }
    } catch {
      custom = [];
    }
  }

  const byId = new Map<string, LivekitEndpoint>();
  for (const e of BUILTIN_LIVEKIT_ENDPOINTS) byId.set(e.id, { ...e, builtin: true });
  for (const e of custom) {
    if (!byId.has(e.id)) byId.set(e.id, { ...e, builtin: false });
  }
  return [...byId.values()];
}

function saveCustomEndpoints(all: LivekitEndpoint[]) {
  const custom = all.filter((e) => !e.builtin).map(({ id, label, url }) => ({ id, label, url }));
  setRaw(ENDPOINTS_KEY, JSON.stringify(custom));
}

export function addLivekitEndpoint(input: { label: string; url: string }): LivekitEndpoint {
  const label = input.label.trim();
  const url = input.url.trim();
  if (!label) throw new Error("请填写接口名称");
  if (!/^wss?:\/\//i.test(url)) throw new Error("LiveKit URL 需以 ws:// 或 wss:// 开头");

  const endpoints = getLivekitEndpoints();
  if (endpoints.some((e) => e.url.toLowerCase() === url.toLowerCase())) {
    throw new Error("该 LiveKit 地址已在列表中");
  }

  const created: LivekitEndpoint = { id: nanoid(10), label, url, builtin: false };
  saveCustomEndpoints([...endpoints, created]);
  return created;
}

export function removeLivekitEndpoint(id: string) {
  const endpoints = getLivekitEndpoints();
  const target = endpoints.find((e) => e.id === id);
  if (!target) throw new Error("接口不存在");
  if (target.builtin) throw new Error("内置接口不可删除");

  const next = endpoints.filter((e) => e.id !== id);
  saveCustomEndpoints(next);

  // If removed endpoint was active, fall back to first builtin
  if (getSetting("livekitUrl").toLowerCase() === target.url.toLowerCase()) {
    setRaw(KEY_MAP.livekitUrl, BUILTIN_LIVEKIT_ENDPOINTS[0]!.url);
  }
}

export function getServerSettings(): ServerSettings {
  return {
    livekitUrl: getSetting("livekitUrl"),
    livekitApiKey: getSetting("livekitApiKey"),
    livekitApiSecret: getSetting("livekitApiSecret"),
    livekitEndpoints: getLivekitEndpoints(),
  };
}

export function setSetting(key: keyof typeof KEY_MAP, value: string) {
  setRaw(KEY_MAP[key], value);
}

export function updateServerSettings(
  patch: Partial<Pick<ServerSettings, "livekitUrl" | "livekitApiKey" | "livekitApiSecret">>,
) {
  if (patch.livekitUrl !== undefined) {
    const url = patch.livekitUrl.trim();
    const endpoints = getLivekitEndpoints();
    if (!endpoints.some((e) => e.url.toLowerCase() === url.toLowerCase())) {
      throw new Error("请从列表中选择 LiveKit 接口，或先添加自定义接口");
    }
    setSetting("livekitUrl", url);
  }
  if (patch.livekitApiKey !== undefined) setSetting("livekitApiKey", patch.livekitApiKey.trim());
  if (patch.livekitApiSecret !== undefined) {
    setSetting("livekitApiSecret", patch.livekitApiSecret.trim());
  }
}

export function adminSettingsPayload() {
  const s = getServerSettings();
  return {
    livekitUrl: s.livekitUrl,
    livekitApiKey: s.livekitApiKey,
    livekitApiSecretSet: Boolean(s.livekitApiSecret),
    livekitEndpoints: s.livekitEndpoints,
  };
}

/** Seed DB settings from env only when keys are missing (admin edits win afterwards). */
export function seedSettingsFromEnv() {
  for (const field of Object.keys(KEY_MAP) as (keyof typeof KEY_MAP)[]) {
    if (!getRaw(KEY_MAP[field])) {
      setSetting(field, DEFAULTS[field]);
    }
  }
  // Ensure endpoints key exists (empty custom list; builtins always merged in)
  if (!getRaw(ENDPOINTS_KEY)) {
    setRaw(ENDPOINTS_KEY, "[]");
  }

  // Migrate legacy direct-IP China URL → Seoul cert proxy path
  const currentUrl = getRaw(KEY_MAP.livekitUrl);
  if (currentUrl && currentUrl.toLowerCase() === LEGACY_CN_URL.toLowerCase()) {
    setSetting("livekitUrl", PROXY_CN_URL);
    console.log(`[hez] Migrated LiveKit URL ${LEGACY_CN_URL} → ${PROXY_CN_URL}`);
  }
}
