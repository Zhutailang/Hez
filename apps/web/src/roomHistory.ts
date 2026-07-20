import type { Room } from "./api";

const KEY = "hez.roomHistory";
const MAX = 30;

export type HistoryRoom = {
  code: string;
  name: string;
  hostName?: string;
  visitedAt: number;
};

function read(): HistoryRoom[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryRoom[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: HistoryRoom[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function getRoomHistory(): HistoryRoom[] {
  return read().sort((a, b) => b.visitedAt - a.visitedAt);
}

export function rememberRoom(room: Pick<Room, "code" | "name"> & { hostName?: string }) {
  const code = room.code.toUpperCase();
  const next = read().filter((r) => r.code !== code);
  next.unshift({
    code,
    name: room.name,
    hostName: room.hostName,
    visitedAt: Date.now(),
  });
  write(next);
}

export function removeHistoryRoom(code: string) {
  write(read().filter((r) => r.code !== code.toUpperCase()));
}
