import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Room } from "../api";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";
import {
  getRoomHistory,
  rememberRoom,
  removeHistoryRoom,
  type HistoryRoom,
} from "../roomHistory";

function mergeRooms(apiRooms: Room[], local: HistoryRoom[]): HistoryRoom[] {
  const map = new Map<string, HistoryRoom>();
  for (const r of local) {
    map.set(r.code.toUpperCase(), r);
  }
  for (const r of apiRooms) {
    const code = r.code.toUpperCase();
    const prev = map.get(code);
    map.set(code, {
      code,
      name: r.name,
      hostName: r.hostName,
      visitedAt: prev?.visitedAt ?? (r.createdAt ? Date.parse(r.createdAt) : Date.now()),
    });
  }
  return [...map.values()].sort((a, b) => b.visitedAt - a.visitedAt);
}

export default function LobbyPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [apiRooms, setApiRooms] = useState<Room[]>([]);
  const [localTick, setLocalTick] = useState(0);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});

  const rooms = useMemo(
    () => mergeRooms(apiRooms, getRoomHistory()),
    // localTick forces refresh after remove
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiRooms, localTick],
  );

  useEffect(() => {
    if (!token) return;
    api
      .listRooms(token)
      .then((res) => {
        setApiRooms(res.rooms);
        // Fetch participant counts for all rooms
        return api.getRoomParticipantCounts(token);
      })
      .then((res) => setParticipantCounts(res.counts))
      .catch(() => undefined);
  }, [token]);

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    try {
      const res = await api.createRoom(token, roomName.trim() || `${user?.displayName} 的房间`);
      rememberRoom({ ...res.room, hostName: user?.displayName });
      navigate(`/room/${res.room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setPending(false);
    }
  }

  async function joinRoom(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setPending(true);
    setError("");
    try {
      const res = await api.getRoom(token, code);
      rememberRoom(res.room);
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失败");
    } finally {
      setPending(false);
    }
  }

  function forget(code: string) {
    removeHistoryRoom(code);
    setLocalTick((n) => n + 1);
  }

  return (
    <div className="min-h-screen px-6 py-8 md:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <BrandMark />
        <div className="flex items-center gap-4 text-sm">
          <span className="text-sand-100/65">{user?.displayName}</span>
          {user?.role === "admin" ? (
            <Link
              to="/admin"
              className="rounded-lg border border-pulse-400/35 px-3 py-1.5 text-pulse-300 transition hover:bg-pulse-500/10"
            >
              服务器设置
            </Link>
          ) : null}
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sand-100/80 transition hover:border-pulse-400/40 hover:text-pulse-300"
          >
            退出
          </button>
        </div>
      </header>

      <main className="mx-auto mt-14 max-w-5xl animate-fadeUp">
        {!window.isSecureContext ? (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
            当前不是安全上下文，麦克风不可用。请改用{" "}
            <a className="underline" href="https://hez.zhutairo.top">
              https://hez.zhutairo.top
            </a>
            ，或本地 http://localhost:5173
          </div>
        ) : null}
        <h1 className="font-display text-4xl font-semibold tracking-tight text-sand-50 md:text-5xl">
          开始一场通话
        </h1>
        <p className="mt-3 max-w-xl text-sand-100/65">
          创建房间并分享房间码，或输入房间码直接加入。多人语音由自建 LiveKit 转发。
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <form
            onSubmit={createRoom}
            className="rounded-3xl border border-white/10 bg-ink-900/55 p-6 backdrop-blur"
          >
            <h2 className="font-display text-xl text-sand-50">创建房间</h2>
            <input
              className="mt-5 w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-3 outline-none focus:border-pulse-400/60"
              placeholder="房间名称"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-5 w-full rounded-xl bg-pulse-500 py-3 font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-60"
            >
              创建并进入
            </button>
          </form>

          <form
            onSubmit={joinRoom}
            className="rounded-3xl border border-white/10 bg-ink-900/55 p-6 backdrop-blur"
          >
            <h2 className="font-display text-xl text-sand-50">加入房间</h2>
            <input
              className="mt-5 w-full rounded-xl border border-white/10 bg-ink-950/70 px-4 py-3 uppercase tracking-[0.25em] outline-none focus:border-pulse-400/60"
              placeholder="房间码"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              maxLength={8}
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-5 w-full rounded-xl border border-pulse-400/40 py-3 font-semibold text-pulse-300 transition hover:bg-pulse-500/10 disabled:opacity-60"
            >
              加入通话
            </button>
          </form>
        </div>

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

        <section className="mt-12">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-sm uppercase tracking-[0.2em] text-sand-100/45">历史房间</h2>
            <p className="text-xs text-sand-100/35">本地记录 + 服务端最近房间</p>
          </div>
          <ul className="hez-scroll mt-4 max-h-[40vh] space-y-3 overflow-y-auto pr-1">
            {rooms.length === 0 ? (
              <li className="text-sand-100/50">还没有房间，先创建一个吧。</li>
            ) : (
              rooms.map((room) => (
                <li key={room.code}>
                  <div className="group flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/room/${room.code}`)}
                      className="flex min-w-0 flex-1 items-center justify-between rounded-2xl border border-white/8 bg-ink-900/40 px-5 py-4 text-left transition hover:border-pulse-400/35"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sand-50">{room.name}</div>
                        <div className="mt-1 truncate text-sm text-sand-100/50">
                          {room.hostName ? `主持 · ${room.hostName}` : "历史访问"}
                        </div>
                      </div>
                      <div className="ml-3 flex shrink-0 flex-col items-end gap-1.5">
                        <span className="font-mono tracking-[0.2em] text-pulse-300">
                          {room.code}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-sand-100/55">
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
                            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z" />
                          </svg>
                          {participantCounts[room.code] ?? 0}
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      title="从本地历史移除"
                      onClick={() => forget(room.code)}
                      className="rounded-2xl border border-white/8 px-3 text-sand-100/30 transition hover:border-white/20 hover:text-sand-100/70"
                    >
                      ×
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
