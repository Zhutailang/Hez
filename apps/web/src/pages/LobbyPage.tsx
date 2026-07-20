import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Room } from "../api";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";

export default function LobbyPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .listRooms(token)
      .then((res) => setRooms(res.rooms))
      .catch(() => undefined);
  }, [token]);

  async function createRoom(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setPending(true);
    setError("");
    try {
      const res = await api.createRoom(token, roomName.trim() || `${user?.displayName} 的房间`);
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
      await api.getRoom(token, code);
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加入失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-8 md:px-10">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <BrandMark />
        <div className="flex items-center gap-4 text-sm">
          <span className="text-sand-100/65">{user?.displayName}</span>
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
          <h2 className="text-sm uppercase tracking-[0.2em] text-sand-100/45">最近房间</h2>
          <ul className="mt-4 space-y-3">
            {rooms.length === 0 ? (
              <li className="text-sand-100/50">还没有房间，先创建一个吧。</li>
            ) : (
              rooms.map((room) => (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/room/${room.code}`)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-ink-900/40 px-5 py-4 text-left transition hover:border-pulse-400/35"
                  >
                    <div>
                      <div className="font-medium text-sand-50">{room.name}</div>
                      <div className="mt-1 text-sm text-sand-100/50">
                        主持 · {room.hostName || "未知"}
                      </div>
                    </div>
                    <span className="font-mono tracking-[0.2em] text-pulse-300">{room.code}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
