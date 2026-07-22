import {
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type Participant,
  type RemoteAudioTrack,
  type RemoteParticipant,
} from "livekit-client";
import { FormEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Room as ApiRoom } from "../api";
import { useAuth } from "../auth";
import BrandMark from "../components/BrandMark";
import CallAudioControls from "../components/CallAudioControls";
import PeerField from "../components/PeerField";
import { loadRoomChat, saveRoomChat } from "../chatHistory";
import {
  getRoomHistory,
  rememberRoom,
  removeHistoryRoom,
  type HistoryRoom,
} from "../roomHistory";
import { playJoinSound, playMessageSound, unlockNotifySounds } from "../notifySounds";

type Peer = {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isLocal: boolean;
};

type ChatMessage = {
  id: string;
  identity: string;
  name: string;
  text: string;
  at: number;
  isLocal: boolean;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const BUBBLE_COLORS = [
  "from-[#3dd6b8] to-[#149882]",
  "from-[#5b9fd4] to-[#2f6f9e]",
  "from-[#e0b35a] to-[#b8842d]",
  "from-[#d46a7a] to-[#a8334f]",
  "from-[#8b7cf0] to-[#5c4fc7]",
  "from-[#7ec8a3] to-[#3f8f6d]",
];

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return BUBBLE_COLORS[hash % BUBBLE_COLORS.length];
}

function initialOf(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function explainError(err: unknown): { title: string; hint: string } {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : "";
  const lower = message.toLowerCase();

  if (
    lower.includes("getusermedia") ||
    lower.includes("mediadevices") ||
    (lower.includes("undefined") && lower.includes("reading"))
  ) {
    return {
      title: "当前页面无法使用麦克风 API",
      hint: "请用系统 Chrome/Edge 打开 https://hez.zhutairo.top，或本地 http://localhost:5173。不要用内置预览。",
    };
  }

  if (
    name === "NotFoundError" ||
    lower.includes("requested device not found") ||
    lower.includes("device not found") ||
    lower.includes("no device")
  ) {
    return {
      title: "未检测到麦克风",
      hint: "已可先静音待在房间。检查系统麦克风与浏览器权限后，再点「取消静音」。",
    };
  }

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    lower.includes("permission denied") ||
    lower.includes("notallowed")
  ) {
    return {
      title: "麦克风权限被拒绝",
      hint: "请在浏览器地址栏允许麦克风，然后点「取消静音」重试。",
    };
  }

  if (
    lower.includes("websocket") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("signal connection")
  ) {
    return {
      title: message,
      hint: "无法连上 LiveKit 信令。请到「服务器设置」确认所选节点已启动；若刚切换请稍等几秒再进房。",
    };
  }

  if (
    lower.includes("negotiation") ||
    lower.includes("pc connection") ||
    /\bice\b/.test(lower) ||
    lower.includes("ice failed") ||
    lower.includes("connection failed")
  ) {
    return {
      title: message,
      hint: "WebRTC 媒体失败。请确认所选 LiveKit 节点在线，并已放行 UDP/TCP 媒体端口。",
    };
  }

  return {
    title: message || "无法进入房间",
    hint: "请确认 API 与所选 LiveKit 节点都在运行后重试。",
  };
}

function mergeHistory(apiRooms: ApiRoom[], local: HistoryRoom[]): HistoryRoom[] {
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
      visitedAt: prev?.visitedAt ?? (r.createdAt ? Date.parse(r.createdAt) : 0),
    });
  }
  return [...map.values()].sort((a, b) => b.visitedAt - a.visitedAt);
}

export default function RoomPage() {
  const { code = "" } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState("正在连接…");
  const [roomName, setRoomName] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<{ title: string; hint: string } | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    code ? loadRoomChat(code) : [],
  );
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<HistoryRoom[]>(() => getRoomHistory());
  const roomRef = useRef<Room | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);
  const endingRef = useRef(false);
  const deafenedRef = useRef(false);
  const peerVolumesRef = useRef<Record<string, number>>({});
  const noiseReductionRef = useRef(true);
  const chatRoomRef = useRef(code.toUpperCase());
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});

  const speakingCount = useMemo(() => peers.filter((p) => p.isSpeaking).length, [peers]);
  const activeCode = code.toUpperCase();

  // Switch room → load that room's local chat (independent history)
  useEffect(() => {
    chatRoomRef.current = activeCode;
    setMessages(loadRoomChat(activeCode));
    setDraft("");
  }, [activeCode]);

  // Persist whenever messages change, keyed by the room they belong to
  useEffect(() => {
    const roomCode = chatRoomRef.current;
    if (!roomCode) return;
    saveRoomChat(roomCode, messages);
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const refresh = () => {
      api
        .listRooms(token)
        .then((res) => {
          if (!cancelled) setHistory(mergeHistory(res.rooms, getRoomHistory()));
          return api.getRoomParticipantCounts(token);
        })
        .then((res) => {
          if (!cancelled) setParticipantCounts(res.counts);
        })
        .catch(() => {
          if (!cancelled) setHistory(getRoomHistory());
        });
    };

    refresh();
    const timer = window.setInterval(refresh, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, activeCode]);

  useEffect(() => {
    if (!token || !code || ended) return;
    let cancelled = false;
    endingRef.current = false;

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

    const pushChat = (msg: ChatMessage) => {
      setMessages((prev) => {
        // Ignore late packets from a previous room after switch
        if (chatRoomRef.current !== code.toUpperCase()) return prev;
        return [...prev.slice(-299), msg];
      });
    };

    const levelFor = (identity: string) => {
      if (deafenedRef.current) return 0;
      const pct = peerVolumesRef.current[identity];
      return (pct ?? 100) / 100;
    };

    const attachRemoteAudio = (track: RemoteAudioTrack, identity: string) => {
      const host = audioHostRef.current;
      if (!host) return;
      // Avoid duplicate <audio> for the same track sid
      const sid = track.sid || track.mediaStreamTrack?.id || "";
      if (sid && host.querySelector(`[data-lk-sid="${sid}"]`)) return;

      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      el.setAttribute("playsinline", "true");
      if (sid) el.dataset.lkSid = sid;
      el.style.display = "none";
      host.appendChild(el);
      track.setVolume(levelFor(identity));
      void el.play().catch(() => {
        setAudioBlocked(true);
      });
    };

    const detachRemoteAudio = (track: RemoteAudioTrack) => {
      track.detach().forEach((el) => el.remove());
    };

    const attachAllRemoteAudio = (lkRoom: Room) => {
      lkRoom.remoteParticipants.forEach((p) => {
        p.audioTrackPublications.forEach((pub) => {
          if (pub.track && pub.track.kind === Track.Kind.Audio) {
            attachRemoteAudio(pub.track as RemoteAudioTrack, p.identity);
          }
        });
      });
    };

    const unlockAudio = async (lkRoom: Room) => {
      try {
        await lkRoom.startAudio();
        unlockNotifySounds();
        setAudioBlocked(false);
      } catch {
        setAudioBlocked(true);
      }
    };

    const applyAllRemoteVolumes = (lkRoom: Room) => {
      lkRoom.remoteParticipants.forEach((p) => {
        p.setVolume(levelFor(p.identity));
      });
    };

    const micCaptureOptions = () => ({
      echoCancellation: true,
      noiseSuppression: noiseReductionRef.current,
      autoGainControl: true,
    });

    (async () => {
      try {
        setError(null);
        setEnded(false);
        setDeafened(false);
        deafenedRef.current = false;
        setAudioBlocked(false);
        setPeers([]);
        setRoom(null);
        setStatus("正在连接…");
        // Keep this room's local chat; do not wipe on reconnect

        if (!window.isSecureContext || !navigator.mediaDevices) {
          throw new Error("Cannot read properties of undefined (reading 'getUserMedia')");
        }

        const creds = await api.getToken(token, code.toUpperCase());
        if (cancelled) return;
        setRoomName(creds.room.name);
        rememberRoom(creds.room);
        setHistory(mergeHistory([], getRoomHistory()));
        setStatus("正在加入语音通道…");

        const lkRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: micCaptureOptions(),
        });
        roomRef.current = lkRoom;

        const refresh = () => {
          if (!cancelled) syncPeers(lkRoom);
        };
        lkRoom.on(RoomEvent.ParticipantConnected, (participant) => {
          refresh();
          if (!endingRef.current) {
            playJoinSound();
            pushChat({
              id: `sys-join-${Date.now()}`,
              identity: "system",
              name: "系统",
              text: `${participant.name || participant.identity} 进入了语音房间`,
              at: Date.now(),
              isLocal: false,
            });
          }
        });
        lkRoom.on(RoomEvent.ParticipantDisconnected, refresh);
        lkRoom.on(RoomEvent.ActiveSpeakersChanged, refresh);
        lkRoom.on(RoomEvent.TrackMuted, refresh);
        lkRoom.on(RoomEvent.TrackUnmuted, refresh);
        lkRoom.on(RoomEvent.LocalTrackPublished, refresh);
        lkRoom.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          refresh();
          if (track.kind === Track.Kind.Audio && !endingRef.current) {
            attachRemoteAudio(track as RemoteAudioTrack, participant.identity);
          }
        });
        lkRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
          refresh();
          if (track.kind === Track.Kind.Audio) {
            detachRemoteAudio(track as RemoteAudioTrack);
          }
        });
        lkRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          setAudioBlocked(!lkRoom.canPlaybackAudio);
        });
        lkRoom.on(
          RoomEvent.DataReceived,
          (payload: Uint8Array, participant?: RemoteParticipant) => {
            try {
              const raw = JSON.parse(textDecoder.decode(payload)) as {
                type?: string;
                text?: string;
                name?: string;
                at?: number;
              };
              if (raw.type !== "chat" || !raw.text?.trim()) return;
              playMessageSound();
              pushChat({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                identity: participant?.identity || "remote",
                name: raw.name || participant?.name || "成员",
                text: raw.text.trim(),
                at: raw.at || Date.now(),
                isLocal: false,
              });
            } catch {
              // ignore non-chat payloads
            }
          },
        );

        await lkRoom.connect(creds.url, creds.token, {
          autoSubscribe: true,
          peerConnectionTimeout: 20_000,
        });
        if (cancelled) {
          await lkRoom.disconnect();
          return;
        }

        setRoom(lkRoom);
        setStatus("通话中");
        syncPeers(lkRoom);
        attachAllRemoteAudio(lkRoom);
        applyAllRemoteVolumes(lkRoom);
        await unlockAudio(lkRoom);
        pushChat({
          id: `sys-${Date.now()}`,
          identity: "system",
          name: "系统",
          text: `你已进入「${creds.room.name}」`,
          at: Date.now(),
          isLocal: false,
        });

        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const hasMic = devices.some((d) => d.kind === "audioinput");
          if (!hasMic) {
            setMuted(true);
            setError({
              title: "未检测到麦克风",
              hint: "已静音进入。检查设备后可点「取消静音」。",
            });
          } else {
            await lkRoom.localParticipant.setMicrophoneEnabled(true, micCaptureOptions());
            setMuted(false);
            // Mic permission gesture often unlocks remote audio autoplay too
            await unlockAudio(lkRoom);
            syncPeers(lkRoom);
          }
        } catch (micErr) {
          setMuted(true);
          setError(explainError(micErr));
        }
      } catch (err) {
        if (cancelled) return;
        setError(explainError(err));
        setStatus("连接失败");
      }
    })();

    return () => {
      cancelled = true;
      const current = roomRef.current;
      roomRef.current = null;
      audioHostRef.current?.replaceChildren();
      current?.disconnect();
    };
    // deafened is applied via toggle, not reconnect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, code, ended]);

  async function toggleMute() {
    if (!room || ended) return;
    unlockNotifySounds();
    const next = !muted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!next, {
        echoCancellation: true,
        noiseSuppression: noiseReductionRef.current,
        autoGainControl: true,
      });
      setMuted(next);
      setError(null);
      if (!next) {
        try {
          await room.startAudio();
          setAudioBlocked(false);
        } catch {
          setAudioBlocked(true);
        }
      }
    } catch (err) {
      setError(explainError(err));
    }
  }

  async function toggleNoiseReduction() {
    if (!room || ended) return;
    const next = !noiseReduction;
    noiseReductionRef.current = next;
    setNoiseReduction(next);
    if (muted) return;
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track = pub?.track as LocalAudioTrack | undefined;
      if (track?.restartTrack) {
        await track.restartTrack({
          echoCancellation: true,
          noiseSuppression: next,
          autoGainControl: true,
        });
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(true, {
          echoCancellation: true,
          noiseSuppression: next,
          autoGainControl: true,
        });
      }
      setError(null);
    } catch (err) {
      setError(explainError(err));
    }
  }

  function setPeerVolume(identity: string, value: number) {
    peerVolumesRef.current = { ...peerVolumesRef.current, [identity]: value };
    setPeerVolumes(peerVolumesRef.current);
    if (!room || ended) return;
    const level = deafenedRef.current ? 0 : value / 100;
    const participant = room.remoteParticipants.get(identity);
    participant?.setVolume(level);
  }

  async function enableSpeakers() {
    if (!room) return;
    unlockNotifySounds();
    try {
      await room.startAudio();
      setAudioBlocked(false);
      setError(null);
    } catch {
      setAudioBlocked(true);
      setError({
        title: "浏览器拦截了声音播放",
        hint: "请再点一次「开启声音」，或先与页面交互后再试。",
      });
    }
  }

  function toggleDeafen() {
    if (!room || ended) return;
    unlockNotifySounds();
    const next = !deafened;
    deafenedRef.current = next;
    setDeafened(next);
    room.remoteParticipants.forEach((p) => {
      const pct = peerVolumesRef.current[p.identity] ?? 100;
      p.setVolume(next ? 0 : pct / 100);
    });
  }

  async function hangUp() {
    endingRef.current = true;
    const current = roomRef.current ?? room;
    roomRef.current = null;
    setRoom(null);
    try {
      await current?.localParticipant.setMicrophoneEnabled(false);
    } catch {
      // ignore
    }
    await current?.disconnect();
    setPeers([]);
    setEnded(true);
    setStatus("已关闭接听");
    setMessages((prev) => [
      ...prev.slice(-299),
      {
        id: `sys-end-${Date.now()}`,
        identity: "system",
        name: "系统",
        text: "你已关闭接听，已离开语音通道",
        at: Date.now(),
        isLocal: false,
      },
    ]);
  }

  function rejoin() {
    setEnded(false);
    setStatus("正在连接…");
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!room || !draft.trim() || ended) return;
    unlockNotifySounds();
    const text = draft.trim();
    const payload = {
      type: "chat",
      text,
      name: user?.displayName || room.localParticipant.name || "我",
      at: Date.now(),
    };

    setDraft("");
    setMessages((prev) => [
      ...prev.slice(-299),
      {
        id: `local-${payload.at}`,
        identity: room.localParticipant.identity,
        name: payload.name,
        text,
        at: payload.at,
        isLocal: true,
      },
    ]);

    try {
      await room.localParticipant.publishData(textEncoder.encode(JSON.stringify(payload)), {
        reliable: true,
      });
    } catch {
      setError({
        title: "消息发送失败",
        hint: "语音通道未就绪时无法发聊天。稍后再试。",
      });
    }
  }

  function switchRoom(nextCode: string) {
    const target = nextCode.toUpperCase();
    if (target === activeCode && !ended) return;
    void (async () => {
      endingRef.current = true;
      const current = roomRef.current;
      roomRef.current = null;
      await current?.disconnect();
      setEnded(false);
      navigate(`/room/${target}`);
    })();
  }

  function forgetRoom(e: MouseEvent, roomCode: string) {
    e.stopPropagation();
    removeHistoryRoom(roomCode);
    setHistory((prev) => prev.filter((r) => r.code !== roomCode.toUpperCase()));
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-3 py-5 md:px-6 md:py-6">
      {/* Hidden host for LiveKit remote <audio> elements */}
      <div ref={audioHostRef} className="sr-only" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(61,214,184,0.12),transparent_42%)]" />

      <header className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-1">
        <BrandMark />
        <Link to="/" className="text-sm text-sand-100/60 hover:text-pulse-300">
          返回大厅
        </Link>
      </header>

      <main className="relative z-10 mx-auto mt-5 grid max-w-[1400px] gap-4 lg:grid-cols-[240px_minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start">
        <aside className="flex h-[70vh] max-h-[70vh] min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/10 bg-ink-900/50 backdrop-blur">
          <div className="shrink-0 border-b border-white/8 px-4 py-4">
            <h2 className="font-display text-lg text-sand-50">历史房间</h2>
            <p className="mt-1 text-xs text-sand-100/45">点击切换，可移除记录</p>
          </div>
          <ul className="hez-scroll min-h-0 flex-1 space-y-1 px-2 py-3">
            {history.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-sand-100/40">暂无历史房间</li>
            ) : (
              history.map((item) => {
                const active = item.code === activeCode;
                return (
                  <li key={item.code}>
                    <div
                      className={`group flex w-full items-start gap-2 rounded-2xl px-3 py-2.5 text-left transition ${
                        active
                          ? "bg-pulse-500/15 ring-1 ring-pulse-400/35"
                          : "hover:bg-white/5"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => switchRoom(item.code)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium text-sand-50">{item.name}</div>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="font-mono text-[11px] tracking-[0.18em] text-pulse-300/80">
                            {item.code}
                          </span>
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-sand-100/50">
                            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor" className="opacity-70">
                              <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 14s-1 0-1-1 1-4 7-4 7 3 7 4-1 1-1 1H2Z" />
                            </svg>
                            {active && !ended
                              ? peers.length
                              : (participantCounts[item.code] ??
                                participantCounts[item.code.toUpperCase()] ??
                                0)}
                          </span>
                        </div>
                        {item.hostName ? (
                          <div className="mt-1 truncate text-[11px] text-sand-100/40">
                            {item.hostName}
                          </div>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        title="从历史中移除"
                        onClick={(e) => forgetRoom(e, item.code)}
                        className="mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-sand-100/25 opacity-0 transition hover:bg-white/10 hover:text-sand-100/70 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </aside>

        <section className="flex h-[70vh] max-h-[70vh] min-h-0 flex-col rounded-[28px] border border-white/10 bg-ink-900/45 p-5 backdrop-blur md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-pulse-300/80">{status}</p>
              <h1 className="mt-2 font-display text-3xl text-sand-50 md:text-4xl">
                {roomName || "语音房间"}
              </h1>
              <p className="mt-2 font-mono tracking-[0.24em] text-sand-100/50">{activeCode}</p>
            </div>
            <p className="text-sm text-sand-100/55">
              {ended ? "未接听" : `${peers.length} 人 · ${speakingCount} 人在说`}
            </p>
          </div>

          {error ? (
            <div className="mt-5 rounded-2xl border border-amber-400/25 bg-amber-950/25 px-4 py-3 text-amber-100">
              <p className="text-sm font-medium">{error.title}</p>
              <p className="mt-1 text-xs text-amber-100/70">{error.hint}</p>
            </div>
          ) : null}

          {audioBlocked && !ended ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pulse-400/30 bg-pulse-500/10 px-4 py-3">
              <p className="text-sm text-sand-50">浏览器拦截了声音，点一下开启扬声器</p>
              <button
                type="button"
                onClick={() => void enableSpeakers()}
                className="rounded-full bg-pulse-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400"
              >
                开启声音
              </button>
            </div>
          ) : null}

          <div className="relative mt-8 flex flex-1 items-center justify-center">
            {ended ? (
              <div className="relative text-center">
                <p className="font-display text-2xl text-sand-50">接听已关闭</p>
                <p className="mt-2 text-sm text-sand-100/50">语音通道已断开，可重新接听或切换历史房间</p>
              </div>
            ) : (
              <PeerField
                peers={peers}
                localDeafened={deafened}
                volumes={peerVolumes}
                onVolumeChange={setPeerVolume}
              />
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {ended ? (
              <>
                <button
                  type="button"
                  onClick={rejoin}
                  className="rounded-full bg-pulse-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400"
                >
                  重新接听
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-sand-100/80 transition hover:border-pulse-400/40 hover:text-pulse-300"
                >
                  返回大厅
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={!room}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-40 ${
                    muted
                      ? "bg-sand-100 text-ink-950"
                      : "bg-pulse-500 text-ink-950 hover:bg-pulse-400"
                  }`}
                >
                  {muted ? "取消静音" : "静音"}
                </button>
                <CallAudioControls
                  noiseReduction={noiseReduction}
                  onToggleNoise={() => void toggleNoiseReduction()}
                  disabled={!room}
                />
                <button
                  type="button"
                  onClick={toggleDeafen}
                  disabled={!room}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-40 ${
                    deafened
                      ? "bg-sand-100 text-ink-950"
                      : "border border-white/15 text-sand-100/85 hover:border-pulse-400/40"
                  }`}
                >
                  {deafened ? "开启听筒" : "关闭听筒"}
                </button>
                <button
                  type="button"
                  onClick={() => void hangUp()}
                  className="rounded-full bg-red-500/90 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400"
                >
                  关闭接听
                </button>
              </>
            )}
          </div>
        </section>

        <section className="flex h-[70vh] max-h-[70vh] min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1520]/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-sand-50">群聊</h2>
              <p className="mt-1 text-xs text-sand-100/45">本房间本地记录 · 切换互不干扰</p>
            </div>
            <span className="rounded-full bg-pulse-500/15 px-3 py-1 text-xs text-pulse-300">
              {ended ? "已离线" : `${peers.length} 在线`}
            </span>
          </div>

          <div className="hez-scroll min-h-0 flex-1 space-y-4 px-4 py-5">
            {messages.map((msg) => {
              if (msg.identity === "system") {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <span className="rounded-full bg-white/5 px-3 py-1 text-[11px] text-sand-100/45">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex items-end gap-2 ${msg.isLocal ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-semibold text-ink-950 ${colorFor(msg.identity)}`}
                  >
                    {initialOf(msg.name)}
                  </div>
                  <div className={`max-w-[75%] ${msg.isLocal ? "items-end" : "items-start"} flex flex-col`}>
                    <span className={`mb-1 text-[11px] text-sand-100/40 ${msg.isLocal ? "text-right" : ""}`}>
                      {msg.name}
                    </span>
                    <div
                      className={`relative rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                        msg.isLocal
                          ? "rounded-br-md bg-pulse-500 text-ink-950"
                          : "rounded-bl-md bg-[#173041] text-sand-50"
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={sendChat}
            className="shrink-0 border-t border-white/8 bg-[#071018]/80 px-4 py-3 backdrop-blur"
          >
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat(e as unknown as FormEvent);
                  }
                }}
                rows={2}
                placeholder={
                  ended
                    ? "已关闭接听，无法发送"
                    : room
                      ? "说点什么… Enter 发送"
                      : "连接中，稍候再发消息"
                }
                disabled={!room || ended}
                className="max-h-28 min-h-[52px] flex-1 resize-none rounded-2xl border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-sand-50 outline-none transition placeholder:text-sand-100/30 focus:border-pulse-400/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!room || ended || !draft.trim()}
                className="rounded-2xl bg-pulse-500 px-4 py-3 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-40"
              >
                发送
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
