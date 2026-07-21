const KEY = "hez.chatByRoom";
const MAX_PER_ROOM = 300;
const MAX_ROOMS = 40;

export type StoredChatMessage = {
  id: string;
  identity: string;
  name: string;
  text: string;
  at: number;
  isLocal: boolean;
};

type Store = Record<string, StoredChatMessage[]>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  try {
    const codes = Object.keys(store);
    if (codes.length > MAX_ROOMS) {
      const ranked = codes
        .map((code) => {
          const list = store[code] || [];
          const lastAt = list.length ? list[list.length - 1].at : 0;
          return { code, lastAt };
        })
        .sort((a, b) => b.lastAt - a.lastAt);
      const keep = new Set(ranked.slice(0, MAX_ROOMS).map((r) => r.code));
      for (const code of codes) {
        if (!keep.has(code)) delete store[code];
      }
    }
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota / private mode — ignore persistence failures
  }
}

function normalize(list: unknown): StoredChatMessage[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (m): m is StoredChatMessage =>
        !!m &&
        typeof m === "object" &&
        typeof (m as StoredChatMessage).id === "string" &&
        typeof (m as StoredChatMessage).text === "string",
    )
    .map((m) => ({
      id: m.id,
      identity: String(m.identity || "unknown"),
      name: String(m.name || "成员"),
      text: String(m.text),
      at: typeof m.at === "number" ? m.at : Date.now(),
      isLocal: Boolean(m.isLocal),
    }));
}

/** Load chat history for a room code (local only). */
export function loadRoomChat(code: string): StoredChatMessage[] {
  try {
    return normalize(readStore()[code.toUpperCase()]);
  } catch {
    return [];
  }
}

/** Persist chat history for a room code. */
export function saveRoomChat(code: string, messages: StoredChatMessage[]) {
  try {
    const key = code.toUpperCase();
    const store = readStore();
    store[key] = normalize(messages).slice(-MAX_PER_ROOM);
    writeStore(store);
  } catch {
    // ignore
  }
}

/** Remove one room's local chat. */
export function clearRoomChat(code: string) {
  try {
    const store = readStore();
    delete store[code.toUpperCase()];
    writeStore(store);
  } catch {
    // ignore
  }
}
