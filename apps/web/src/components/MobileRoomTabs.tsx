export type RoomMobilePanel = "history" | "call" | "chat";

type Props = {
  active: RoomMobilePanel;
  onChange: (panel: RoomMobilePanel) => void;
  /** Optional badge on 群聊 tab (e.g. online count or unread). */
  chatBadge?: string | number | null;
};

const TABS: { id: RoomMobilePanel; label: string }[] = [
  { id: "history", label: "房间" },
  { id: "call", label: "通话" },
  { id: "chat", label: "群聊" },
];

/** Bottom/top tab strip for Lab/Room on < lg viewports. Hidden on desktop. */
export default function MobileRoomTabs({ active, onChange, chatBadge }: Props) {
  return (
    <nav
      className="relative z-10 mx-auto flex w-full max-w-[1400px] shrink-0 gap-1 rounded-2xl border border-white/10 bg-ink-900/70 p-1 backdrop-blur lg:hidden"
      aria-label="房间面板"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-medium transition ${
              selected
                ? "bg-pulse-500/20 text-pulse-300"
                : "text-sand-100/50 hover:text-sand-100/80"
            }`}
          >
            {tab.label}
            {tab.id === "chat" && chatBadge != null && chatBadge !== "" ? (
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-sand-100/60">
                {chatBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Visibility helpers: one panel on mobile, all three on lg+. */
export function mobilePanelClass(active: RoomMobilePanel, panel: RoomMobilePanel): string {
  return active === panel ? "flex" : "hidden lg:flex";
}
