import { Room, RoomEvent, Track, type Participant } from "livekit-client";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import AudioWave from "../components/AudioWave";
import BrandMark from "../components/BrandMark";

type Peer = {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isLocal: boolean;
};

export default function RoomPage() {
  const { code = "" } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("正在连接…");
  const [roomName, setRoomName] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [room, setRoom] = useState<Room | null>(null);

  const speakingCount = useMemo(() => peers.filter((p) => p.isSpeaking).length, [peers]);

  useEffect(() => {
    if (!token || !code) return;
    let active = true;
    let lkRoom: Room | null = null;

    const syncPeers = (current: Room) => {
      const list: Peer[] = [];
      const push = (p: Participant, isLocal: boolean) => {
        const mic = p.getTrackPublication(Track.Source.Microphone);
        list.push({
          identity: p.identity,
          name: p.name || p.identity,
          isSpeaking: p.isSpeaking,
          isMuted: !mic || mic.isMuted || !mic.track,
          isLocal,
        });
      };
      push(current.localParticipant, true);
      current.remoteParticipants.forEach((p) => push(p, false));
      setPeers(list);
    };

    (async () => {
      try {
        const creds = await api.getToken(token, code.toUpperCase());
        if (!active) return;
        setRoomName(creds.room.name);
        setStatus("正在加入语音通道…");

        lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const refresh = () => syncPeers(lkRoom!);
        lkRoom.on(RoomEvent.ParticipantConnected, refresh);
        lkRoom.on(RoomEvent.ParticipantDisconnected, refresh);
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, refresh);
        lkRoom.on(RoomEvent.TrackMuted, refresh);
        lkRoom.on(RoomEvent.TrackUnmuted, refresh);
        lkRoom.on(RoomEvent.LocalTrackPublished, refresh);
        lkRoom.on(RoomEvent.TrackSubscribed, refresh);

        await lkRoom.connect(creds.url, creds.token);
        await lkRoom.localParticipant.setMicrophoneEnabled(true);
        if (!active) {
          await lkRoom.disconnect();
          return;
        }
        setRoom(lkRoom);
        setStatus("通话中");
        syncPeers(lkRoom);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "无法进入房间");
        setStatus("连接失败");
      }
    })();

    return () => {
      active = false;
      lkRoom?.disconnect();
    };
  }, [token, code]);

  async function toggleMute() {
    if (!room) return;
    const next = !muted;
    await room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  async function leave() {
    await room?.disconnect();
    navigate("/");
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-6 py-8 md:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(61,214,184,0.12),transparent_45%)]" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between">
        <BrandMark />
        <Link to="/" className="text-sm text-sand-100/60 hover:text-pulse-300">
          返回大厅
        </Link>
      </header>

      <main className="relative z-10 mx-auto mt-12 max-w-5xl animate-fadeUp">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.22em] text-pulse-300/80">{status}</p>
            <h1 className="mt-2 font-display text-4xl text-sand-50 md:text-5xl">
              {roomName || "语音房间"}
            </h1>
            <p className="mt-3 font-mono tracking-[0.28em] text-sand-100/55">{code.toUpperCase()}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 px-4 py-3 text-sm text-sand-100/65">
            {peers.length} 人在线 · {speakingCount} 人正在说
          </div>
        </div>

        {error ? (
          <div className="mt-10 rounded-2xl border border-red-400/30 bg-red-950/30 p-6 text-red-200">
            {error}
            <p className="mt-2 text-sm text-red-200/70">
              请确认 LiveKit 已启动（docker compose up），且 API 密钥与 livekit.yaml 一致。
            </p>
          </div>
        ) : null}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {peers.map((peer) => (
            <article
              key={peer.identity}
              className={`rounded-3xl border p-5 transition ${
                peer.isSpeaking
                  ? "border-pulse-400/50 bg-pulse-500/10 shadow-glow"
                  : "border-white/10 bg-ink-900/45"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-sand-50">
                    {peer.name}
                    {peer.isLocal ? "（我）" : ""}
                  </h2>
                  <p className="mt-1 text-sm text-sand-100/50">
                    {peer.isMuted ? "已静音" : peer.isSpeaking ? "正在说话" : "在线"}
                  </p>
                </div>
                <AudioWave active={peer.isSpeaking && !peer.isMuted} />
              </div>
            </article>
          ))}
        </section>

        <div className="fixed bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-ink-950/80 px-3 py-3 shadow-glow backdrop-blur-md">
          <button
            type="button"
            onClick={toggleMute}
            className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
              muted
                ? "bg-sand-100 text-ink-950"
                : "bg-pulse-500 text-ink-950 hover:bg-pulse-400"
            }`}
          >
            {muted ? "取消静音" : "静音"}
          </button>
          <button
            type="button"
            onClick={leave}
            className="rounded-full bg-red-500/90 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400"
          >
            挂断
          </button>
        </div>
      </main>
    </div>
  );
}
