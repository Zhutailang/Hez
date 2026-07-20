export type User = {
  id: string;
  username: string;
  displayName: string;
};

export type Room = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName?: string;
  createdAt?: string;
};

async function request<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data as T;
}

export const api = {
  register: (body: { username: string; displayName: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { username: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: (token: string) => request<{ user: User }>("/api/auth/me", {}, token),
  listRooms: (token: string) => request<{ rooms: Room[] }>("/api/rooms", {}, token),
  createRoom: (token: string, name: string) =>
    request<{ room: Room }>("/api/rooms", { method: "POST", body: JSON.stringify({ name }) }, token),
  getRoom: (token: string, code: string) =>
    request<{ room: Room }>(`/api/rooms/${code}`, {}, token),
  getToken: (token: string, code: string) =>
    request<{ token: string; url: string; room: Room }>(
      `/api/rooms/${code}/token`,
      { method: "POST" },
      token,
    ),
};
