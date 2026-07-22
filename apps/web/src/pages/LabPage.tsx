import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { clearRoomChat, loadRoomChat, saveRoomChat } from "../chatHistory";
import BrandMark from "../components/BrandMark";
import CallAudioControls from "../components/CallAudioControls";
import MobileRoomTabs, {
  mobilePanelClass,
  type RoomMobilePanel,
} from "../components/MobileRoomTabs";
import PeerField from "../components/PeerField";
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

type HistoryRoom = {
  code: string;
  name: string;
  hostName: string;
  participantCount?: number;
};

const BUBBLE_COLORS = [
  "from-[#3dd6b8] to-[#149882]",
  "from-[#5b9fd4] to-[#2f6f9e]",
  "from-[#e0b35a] to-[#b8842d]",
  "from-[#d46a7a] to-[#a8334f]",
  "from-[#8b7cf0] to-[#5c4fc7]",
  "from-[#7ec8a3] to-[#3f8f6d]",
];

const FAKE_HISTORY: HistoryRoom[] = [
  { code: "DEMO01", name: "午后闲聊", hostName: "Alice", participantCount: 4 },
  { code: "DEMO02", name: "项目同步", hostName: "Bob", participantCount: 2 },
  { code: "LAB777", name: "本地联调房", hostName: "Carol", participantCount: 0 },
];

const FAKE_PEERS: Peer[] = [
  { identity: "me", name: "你", isSpeaking: false, isMuted: false, isLocal: true },
  { identity: "alice", name: "Alice", isSpeaking: true, isMuted: false, isLocal: false },
  { identity: "bob", name: "Bob", isSpeaking: false, isMuted: true, isLocal: false },
  { identity: "carol", name: "Carol", isSpeaking: false, isMuted: false, isLocal: false },
];

/** Isolate Lab chat keys from real RoomPage history. */
function labChatKey(code: string) {
  return `LAB:${code.toUpperCase()}`;
}

function seedMessages(roomName: string): ChatMessage[] {
  const now = Date.now();
  return [
    {
      id: "sys-1",
      identity: "system",
      name: "系统",
      text: `这是本地 Lab「${roomName}」· 不连 LiveKit`,
      at: now - 60_000,
      isLocal: false,
    },
    {
      id: "1",
      identity: "alice",
      name: "Alice",
      text: "先看一下气泡和历史侧栏布局",
      at: now - 40_000,
      isLocal: false,
    },
    {
      id: "2",
      identity: "me",
      name: "你",
      text: "关闭接听 / 听筒也能点",
      at: now - 20_000,
      isLocal: true,
    },
  ];
}

function loadLabChat(code: string, roomName: string): ChatMessage[] {
  const existing = loadRoomChat(labChatKey(code));
  if (existing.length > 0) return existing;
  const seeded = seedMessages(roomName);
  saveRoomChat(labChatKey(code), seeded);
  return seeded;
}

function colorFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return BUBBLE_COLORS[hash % BUBBLE_COLORS.length];
}

function initialOf(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

/**
 * UI-only local lab: no LiveKit / API required.
 * Default canvas for UI changes — keep in sync with RoomPage, then promote.
 */
export default function LabPage() {
  const [status, setStatus] = useState("通话中（模拟）");
  const [peers, setPeers] = useState<Peer[]>(FAKE_PEERS);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [ended, setEnded] = useState(false);
  const [activeCode, setActiveCode] = useState("DEMO01");
  const [history, setHistory] = useState(FAKE_HISTORY);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      return loadLabChat("DEMO01", "午后闲聊");
    } catch {
      return seedMessages("午后闲聊");
    }
  });
  const [draft, setDraft] = useState("");
  const [mobilePanel, setMobilePanel] = useState<RoomMobilePanel>("call");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatRoomRef = useRef("DEMO01");
  const speakTimer = useRef<number | null>(null);

  const roomName = useMemo(
    () => history.find((r) => r.code === activeCode)?.name || "模拟房间",
    [history, activeCode],
  );
  const speakingCount = useMemo(() => peers.filter((p) => p.isSpeaking).length, [peers]);

  // Per-room independent local chat (same behavior as RoomPage)
  useEffect(() => {
    chatRoomRef.current = activeCode;
    const name =
      history.find((r) => r.code === activeCode)?.name ||
      FAKE_HISTORY.find((r) => r.code === activeCode)?.name ||
      activeCode;
    try {
      setMessages(loadLabChat(activeCode, name));
    } catch {
      setMessages(seedMessages(name));
    }
    setDraft("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when room code changes
  }, [activeCode]);

  useEffect(() => {
    try {
      saveRoomChat(labChatKey(chatRoomRef.current), messages);
    } catch {
      // ignore persistence errors
    }
  }, [messages]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (ended) return;
    speakTimer.current = window.setInterval(() => {
      setPeers((prev) =>
        prev.map((p) => {
          if (p.isLocal || p.isMuted) return { ...p, isSpeaking: false };
          return { ...p, isSpeaking: Math.random() > 0.65 };
        }),
      );
    }, 1200);
    return () => {
      if (speakTimer.current) window.clearInterval(speakTimer.current);
    };
  }, [ended]);

  // Lab: periodically simulate a remote member re-entering (cue sound)
  useEffect(() => {
    if (ended) return;
    const id = window.setInterval(() => {
      playJoinSound();
      setMessages((prev) => [
        ...prev.slice(-299),
        {
          id: `sys-join-${Date.now()}`,
          identity: "system",
          name: "系统",
          text: "有成员进入语音房间（模拟）",
          at: Date.now(),
          isLocal: false,
        },
      ]);
    }, 28_000);
    return () => window.clearInterval(id);
  }, [ended]);

  function switchRoom(code: string) {
    if (code === activeCode && !ended) return;
    setActiveCode(code);
    setEnded(false);
    setStatus("通话中（模拟）");
    setPeers(FAKE_PEERS.map((p) => (p.isLocal ? { ...p, isMuted: muted } : p)));
    setMobilePanel("call");
    playJoinSound();
  }

  function forgetRoom(code: string) {
    clearRoomChat(labChatKey(code));
    setHistory((prev) => {
      const next = prev.filter((r) => r.code !== code);
      if (code === activeCode && next.length > 0) {
        setActiveCode(next[0].code);
      }
      return next;
    });
  }

  function hangUp() {
    setEnded(true);
    setStatus("已关闭接听（模拟）");
    setPeers([]);
    setMessages((prev) => [
      ...prev.slice(-299),
      {
        id: `sys-end-${Date.now()}`,
        identity: "system",
        name: "系统",
        text: "你已关闭接听（假数据，未真正断线）",
        at: Date.now(),
        isLocal: false,
      },
    ]);
  }

  function rejoin() {
    setEnded(false);
    setStatus("通话中（模拟）");
    setPeers(FAKE_PEERS.map((p) => (p.isLocal ? { ...p, isMuted: muted } : p)));
    playJoinSound();
    setMessages((prev) => [
      ...prev.slice(-299),
      {
        id: `sys-rejoin-${Date.now()}`,
        identity: "system",
        name: "系统",
        text: `你已重新进入「${roomName}」`,
        at: Date.now(),
        isLocal: false,
      },
    ]);
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || ended) return;
    unlockNotifySounds();
    const text = draft.trim();
    const roomAtSend = activeCode;
    setDraft("");
    setMessages((prev) => [
      ...prev.slice(-299),
      {
        id: `local-${Date.now()}`,
        identity: "me",
        name: "你",
        text,
        at: Date.now(),
        isLocal: true,
      },
    ]);
    window.setTimeout(() => {
      if (chatRoomRef.current !== roomAtSend) return;
      playMessageSound();
      setMessages((prev) => [
        ...prev.slice(-299),
        {
          id: `bot-${Date.now()}`,
          identity: "alice",
          name: "Alice",
          text: `收到：「${text}」（自动回）`,
          at: Date.now(),
          isLocal: false,
        },
      ]);
    }, 500);
  }

  const panelShell =
    "min-h-0 flex-col overflow-hidden rounded-[24px] border border-white/10 lg:h-[70vh] lg:max-h-[70vh] lg:rounded-[28px]";
  const toolBtn =
    "rounded-full px-3.5 py-2.5 text-xs font-semibold transition sm:px-5 sm:py-3 sm:text-sm";

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6 md:py-5 lg:min-h-screen lg:h-auto lg:max-h-none lg:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(61,214,184,0.12),transparent_42%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-[1400px] shrink-0 items-center justify-between gap-2 px-1">
        <BrandMark />
        <div className="flex items-center gap-2 text-sm sm:gap-4">
          <span className="hidden rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-200 sm:inline">
            LAB · 默认改这里
          </span>
          <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] text-amber-200 sm:hidden">
            LAB
          </span>
          <Link to="/login" className="shrink-0 text-sand-100/60 hover:text-pulse-300">
            去登录
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto mt-3 w-full max-w-[1400px] shrink-0 lg:hidden">
        <MobileRoomTabs
          active={mobilePanel}
          onChange={setMobilePanel}
          chatBadge={ended ? null : peers.length}
        />
      </div>

      <main className="relative z-10 mx-auto mt-3 flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 lg:mt-5 lg:grid lg:h-auto lg:flex-none lg:grid-cols-[240px_minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-4">
        <aside
          className={`${mobilePanelClass(mobilePanel, "history")} ${panelShell} flex-1 bg-ink-900/50 backdrop-blur lg:flex-none`}
        >
          <div className="shrink-0 border-b border-white/8 px-4 py-3 sm:py-4">
            <h2 className="font-display text-lg text-sand-50">历史房间</h2>
            <p className="mt-1 text-xs text-sand-100/45">点击切换 · 各房聊天独立</p>
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
                      className={`group flex w-full items-start gap-2 rounded-2xl px-3 py-2.5 ${
                        active ? "bg-pulse-500/15 ring-1 ring-pulse-400/35" : "hover:bg-white/5"
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
                            {item.participantCount ?? 0}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-sand-100/40">{item.hostName}</div>
                      </button>
                      <button
                        type="button"
                        title="移除"
                        onClick={() => forgetRoom(item.code)}
                        className="mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-sand-100/40 transition hover:bg-white/10 hover:text-sand-100/70 lg:text-sand-100/25 lg:opacity-0 lg:group-hover:opacity-100"
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

        <section
          className={`${mobilePanelClass(mobilePanel, "call")} ${panelShell} flex-1 bg-ink-900/45 p-4 backdrop-blur sm:p-5 md:p-7 lg:flex-none`}
        >
          <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-pulse-300/80 sm:text-xs">
                {status}
              </p>
              <h1 className="mt-1 truncate font-display text-2xl text-sand-50 sm:mt-2 sm:text-3xl md:text-4xl">
                {roomName}
              </h1>
              <p className="mt-1 font-mono text-sm tracking-[0.24em] text-sand-100/50 sm:mt-2">
                {activeCode}
              </p>
            </div>
            <p className="shrink-0 text-xs text-sand-100/55 sm:text-sm">
              {ended ? "未接听" : `${peers.length} 人 · ${speakingCount} 人在说`}
            </p>
          </div>

          <div className="mt-3 hidden rounded-2xl border border-amber-400/20 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/80 sm:block sm:mt-4">
            UI 默认在 Lab 改。确认后再同步到{" "}
            <code className="text-amber-200">RoomPage</code>。打开{" "}
            <Link className="underline" to="/lab">
              /lab
            </Link>
          </div>

          <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center sm:mt-6 md:mt-8">
            {ended ? (
              <div className="relative text-center">
                <p className="font-display text-xl text-sand-50 sm:text-2xl">接听已关闭</p>
                <p className="mt-2 text-sm text-sand-100/50">可重新接听或切换历史房间</p>
              </div>
            ) : (
              <PeerField
                peers={peers}
                localDeafened={deafened}
                volumes={peerVolumes}
                onVolumeChange={(identity, value) =>
                  setPeerVolumes((prev) => ({ ...prev, [identity]: value }))
                }
              />
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-3">
            {ended ? (
              <button
                type="button"
                onClick={rejoin}
                className={`${toolBtn} bg-pulse-500 text-ink-950 hover:bg-pulse-400`}
              >
                重新接听
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    setPeers((prev) =>
                      prev.map((p) => (p.isLocal ? { ...p, isMuted: next } : p)),
                    );
                  }}
                  className={`${toolBtn} ${
                    muted ? "bg-sand-100 text-ink-950" : "bg-pulse-500 text-ink-950 hover:bg-pulse-400"
                  }`}
                >
                  {muted ? "取消静音" : "静音"}
                </button>
                <CallAudioControls
                  noiseReduction={noiseReduction}
                  onToggleNoise={() => setNoiseReduction((v) => !v)}
                />
                <button
                  type="button"
                  onClick={() => setDeafened((v) => !v)}
                  className={`${toolBtn} ${
                    deafened
                      ? "bg-sand-100 text-ink-950"
                      : "border border-white/15 text-sand-100/85 hover:border-pulse-400/40"
                  }`}
                >
                  {deafened ? "开启听筒" : "关闭听筒"}
                </button>
                <button
                  type="button"
                  onClick={hangUp}
                  className={`${toolBtn} bg-red-500/90 text-white hover:bg-red-400`}
                >
                  挂断
                </button>
              </>
            )}
          </div>
        </section>

        <section
          className={`${mobilePanelClass(mobilePanel, "chat")} ${panelShell} flex-1 bg-[#0a1520]/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)] lg:flex-none`}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3 sm:px-5 sm:py-4">
            <div>
              <h2 className="font-display text-lg text-sand-50 sm:text-xl">群聊</h2>
              <p className="mt-1 hidden text-xs text-sand-100/45 sm:block">
                本房间本地记录 · 切换互不干扰
              </p>
            </div>
            <span className="rounded-full bg-pulse-500/15 px-3 py-1 text-xs text-pulse-300">
              {ended ? "已离线" : `${peers.length} 在线`}
            </span>
          </div>

          <div className="hez-scroll min-h-0 flex-1 space-y-4 px-3 py-4 sm:px-4 sm:py-5">
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
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-semibold text-ink-950 sm:h-9 sm:w-9 ${colorFor(msg.identity)}`}
                  >
                    {initialOf(msg.name)}
                  </div>
                  <div className={`flex max-w-[80%] flex-col sm:max-w-[75%] ${msg.isLocal ? "items-end" : "items-start"}`}>
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
            className="shrink-0 border-t border-white/8 bg-[#071018]/80 px-3 py-3 backdrop-blur sm:px-4"
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
                placeholder={ended ? "已关闭接听" : "Lab 假聊天… Enter 发送"}
                disabled={ended}
                className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-sand-50 outline-none transition placeholder:text-sand-100/30 focus:border-pulse-400/50 disabled:opacity-50 sm:min-h-[52px]"
              />
              <button
                type="submit"
                disabled={ended || !draft.trim()}
                className="rounded-2xl bg-pulse-500 px-3.5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400 disabled:opacity-40 sm:px-4"
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
