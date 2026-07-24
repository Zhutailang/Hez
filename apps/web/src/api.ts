export type User = {
  id: string;
  username: string;
  displayName: string;
  role?: "user" | "admin";
  avatarUrl?: string | null;
};

export type LivekitEndpoint = {
  id: string;
  label: string;
  url: string;
  builtin?: boolean;
};

export type LivekitControlResult = {
  activeId: string | null;
  started: string[];
  stopped: string[];
  skipped: string[];
  errors: string[];
};

export type AdminSettings = {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecretSet: boolean;
  livekitEndpoints: LivekitEndpoint[];
};

export type Room = {
  id: string;
  code: string;
  name: string;
  hostId: string;
  hostName?: string;
  createdAt?: string;
  participantCount?: number;
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
  getRoomParticipantCounts: (token: string) =>
    request<{ counts: Record<string, number> }>("/api/rooms/participants", {}, token),
  getAdminSettings: (token: string) =>
    request<{ settings: AdminSettings }>("/api/admin/settings", {}, token),
  updateAdminSettings: (
    token: string,
    body: {
      livekitUrl?: string;
      livekitApiKey?: string;
      livekitApiSecret?: string;
      addEndpoint?: { label: string; url: string };
      removeEndpointId?: string;
    },
  ) =>
    request<{ settings: AdminSettings; livekitControl?: LivekitControlResult | null }>(
      "/api/admin/settings",
      { method: "PUT", body: JSON.stringify(body) },
      token,
    ),
  updateProfile: (token: string, body: { displayName: string }) =>
    request<{ user: User }>("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify(body),
    }, token),
  uploadAvatar: async (token: string, file: File) => {
    const form = new FormData();
    form.append("avatar", file);
    const res = await fetch("/api/auth/me/avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "上传失败");
    return data as { user: User };
  },
};
