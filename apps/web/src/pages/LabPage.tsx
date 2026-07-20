import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import BrandMark from "../components/BrandMark";

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
  { code: "DEMO01", name: "午后闲聊", hostName: "Alice" },
  { code: "DEMO02", name: "项目同步", hostName: "Bob" },
  { code: "LAB777", name: "本地联调房", hostName: "Carol" },
];

const FAKE_PEERS: Peer[] = [
  { identity: "me", name: "你", isSpeaking: false, isMuted: false, isLocal: true },
  { identity: "alice", name: "Alice", isSpeaking: true, isMuted: false, isLocal: false },
  { identity: "bob", name: "Bob", isSpeaking: false, isMuted: true, isLocal: false },
  { identity: "carol", name: "Carol", isSpeaking: false, isMuted: false, isLocal: false },
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

/**
 * UI-only local lab: no LiveKit / API required.
 * Use this to verify layout, hang-up, history sidebar, and chat chrome.
 */
export default function LabPage() {
  const [status, setStatus] = useState("通话中（模拟）");
  const [peers, setPeers] = useState<Peer[]>(FAKE_PEERS);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [ended, setEnded] = useState(false);
  const [activeCode, setActiveCode] = useState("DEMO01");
  const [history, setHistory] = useState(FAKE_HISTORY);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      identity: "system",
      name: "系统",
      text: "这是本地 Lab 假数据页，不连 LiveKit",
      at: Date.now() - 60_000,
      isLocal: false,
    },
    {
      id: "1",
      identity: "alice",
      name: "Alice",
      text: "先看一下气泡和历史侧栏布局",
      at: Date.now() - 40_000,
      isLocal: false,
    },
    {
      id: "2",
      identity: "me",
      name: "你",
      text: "关闭接听 / 听筒也能点",
      at: Date.now() - 20_000,
      isLocal: true,
    },
  ]);
  const [draft, setDraft] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const speakTimer = useRef<number | null>(null);

  const roomName = useMemo(
    () => history.find((r) => r.code === activeCode)?.name || "模拟房间",
    [history, activeCode],
  );
  const speakingCount = useMemo(() => peers.filter((p) => p.isSpeaking).length, [peers]);

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

  function hangUp() {
    setEnded(true);
    setStatus("已关闭接听（模拟）");
    setPeers([]);
    setMessages((prev) => [
      ...prev,
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
    setPeers(
      FAKE_PEERS.map((p) =>
        p.isLocal ? { ...p, isMuted: muted } : p,
      ),
    );
  }

  function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || ended) return;
    const text = draft.trim();
    setDraft("");
    setMessages((prev) => [
      ...prev,
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
      setMessages((prev) => [
        ...prev,
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

  return (
    <div className="relative min-h-screen overflow-hidden px-3 py-5 md:px-6 md:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(61,214,184,0.12),transparent_42%)]" />

      <header className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-1">
        <BrandMark />
        <div className="flex items-center gap-4 text-sm">
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-200">
            LAB · 假数据
          </span>
          <Link to="/login" className="text-sand-100/60 hover:text-pulse-300">
            去登录
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto mt-5 grid max-w-[1400px] gap-4 lg:grid-cols-[240px_minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-stretch">
        <aside className="flex max-h-[78vh] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-ink-900/50 backdrop-blur">
          <div className="border-b border-white/8 px-4 py-4">
            <h2 className="font-display text-lg text-sand-50">历史房间</h2>
            <p className="mt-1 text-xs text-sand-100/45">本地假列表</p>
          </div>
          <ul className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
            {history.map((item) => {
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
                      onClick={() => {
                        setActiveCode(item.code);
                        setEnded(false);
                        setStatus("通话中（模拟）");
                        setPeers(FAKE_PEERS);
                        setMessages((prev) => [
                          ...prev,
                          {
                            id: `sys-sw-${Date.now()}`,
                            identity: "system",
                            name: "系统",
                            text: `已切换到「${item.name}」`,
                            at: Date.now(),
                            isLocal: false,
                          },
                        ]);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-sm font-medium text-sand-50">{item.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] tracking-[0.18em] text-pulse-300/80">
                        {item.code}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-sand-100/40">{item.hostName}</div>
                    </button>
                    <button
                      type="button"
                      title="移除"
                      onClick={() => setHistory((prev) => prev.filter((r) => r.code !== item.code))}
                      className="mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-sand-100/25 opacity-0 transition hover:bg-white/10 hover:text-sand-100/70 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-[28px] border border-white/10 bg-ink-900/45 p-5 backdrop-blur md:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-pulse-300/80">{status}</p>
              <h1 className="mt-2 font-display text-3xl text-sand-50 md:text-4xl">{roomName}</h1>
              <p className="mt-2 font-mono tracking-[0.24em] text-sand-100/50">{activeCode}</p>
            </div>
            <p className="text-sm text-sand-100/55">
              {ended ? "未接听" : `${peers.length} 人 · ${speakingCount} 人在说`}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-950/20 px-4 py-3 text-sm text-amber-100/80">
            纯前端 Lab：不请求 API、不连 LiveKit。真实联调请用{" "}
            <code className="text-amber-200">npm run demo</code> + 登录 alice / demo123。
          </div>

          <div className="relative mt-8 flex flex-1 items-center justify-center">
            <div className="pointer-events-none absolute h-56 w-56 rounded-full bg-pulse-500/10 blur-3xl md:h-72 md:w-72" />
            {ended ? (
              <div className="relative text-center">
                <p className="font-display text-2xl text-sand-50">接听已关闭</p>
                <p className="mt-2 text-sm text-sand-100/50">可重新接听或切换历史房间</p>
              </div>
            ) : (
              <div className="relative flex max-w-full flex-wrap items-end justify-center pl-4">
                {peers.map((peer, index) => (
                  <div
                    key={peer.identity}
                    className="relative -ml-4 first:ml-0"
                    style={{ zIndex: peers.length - index }}
                  >
                    <div
                      className={`relative grid h-[72px] w-[72px] place-items-center rounded-full bg-gradient-to-br text-xl font-semibold text-ink-950 shadow-[0_10px_30px_rgba(0,0,0,0.35)] ring-2 transition md:h-20 md:w-20 ${
                        peer.isSpeaking && !peer.isMuted
                          ? "scale-110 ring-pulse-300 shadow-glow"
                          : "ring-white/20"
                      } ${colorFor(peer.identity)}`}
                    >
                      {initialOf(peer.name)}
                      {peer.isMuted ? (
                        <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-ink-950 text-[10px] text-sand-100 ring-2 ring-ink-900">
                          静
                        </span>
                      ) : null}
                      {peer.isLocal ? (
                        <span className="absolute -left-1 -top-1 rounded-full bg-pulse-400 px-1.5 py-0.5 text-[10px] font-bold text-ink-950">
                          我
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 max-w-[72px] truncate text-center text-xs text-sand-100/70 md:max-w-20">
                      {peer.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {ended ? (
              <button
                type="button"
                onClick={rejoin}
                className="rounded-full bg-pulse-500 px-5 py-3 text-sm font-semibold text-ink-950 transition hover:bg-pulse-400"
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
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                    muted ? "bg-sand-100 text-ink-950" : "bg-pulse-500 text-ink-950 hover:bg-pulse-400"
                  }`}
                >
                  {muted ? "取消静音" : "静音"}
                </button>
                <button
                  type="button"
                  onClick={() => setDeafened((v) => !v)}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
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
                  className="rounded-full bg-red-500/90 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400"
                >
                  关闭接听
                </button>
              </>
            )}
          </div>
        </section>

        <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0a1520]/90 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
            <div>
              <h2 className="font-display text-xl text-sand-50">群聊</h2>
              <p className="mt-1 text-xs text-sand-100/45">假消息 · 本地回显</p>
            </div>
            <span className="rounded-full bg-pulse-500/15 px-3 py-1 text-xs text-pulse-300">
              {ended ? "已离线" : `${peers.length} 在线`}
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
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
                  <div className={`flex max-w-[75%] flex-col ${msg.isLocal ? "items-end" : "items-start"}`}>
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
            className="border-t border-white/8 bg-[#071018]/80 px-4 py-3 backdrop-blur"
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
                className="max-h-28 min-h-[52px] flex-1 resize-none rounded-2xl border border-white/10 bg-ink-950/70 px-3 py-2.5 text-sm text-sand-50 outline-none transition placeholder:text-sand-100/30 focus:border-pulse-400/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={ended || !draft.trim()}
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
