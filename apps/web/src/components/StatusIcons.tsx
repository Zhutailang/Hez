type IconProps = {
  className?: string;
};

/** Handset / earpiece icon for listening state. */
export function HeadsetIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 11a7 7 0 0 1 14 0" />
      <path d="M5 11v4a2 2 0 0 0 2 2h1v-6H7a2 2 0 0 0-2 2Z" />
      <path d="M19 11v4a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2Z" />
      <path d="M15 19h-2a2 2 0 0 1-2-2v-1" />
    </svg>
  );
}

/** Crossed microphone for mute. */
export function MicOffIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <path d="M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-1" />
      <path d="M19 11v1a7 7 0 0 1-.11 1.23" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

type BadgeProps = {
  listening?: boolean;
  muted?: boolean;
};

/**
 * Avatar status indicators rendered *inside* the rounded-square card.
 * Positioned in the middle row between the initial letter and the volume slider.
 */
export function AvatarStatusBadges({ listening = true, muted }: BadgeProps) {
  return (
    <>
      {/* Status row — headset + mute, centered horizontally */}
      <span className="flex items-center gap-1">
        <span
          title={listening ? "接听中" : "听筒已关"}
          className={`relative grid h-4 w-4 place-items-center rounded-full ${
            listening
              ? "bg-pulse-400/90 text-ink-950"
              : "bg-ink-950/80 text-sand-100/55"
          }`}
        >
          <HeadsetIcon className="h-2.5 w-2.5" />
          {!listening ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="block h-[1px] w-2.5 rotate-[-40deg] rounded bg-red-400" />
            </span>
          ) : null}
        </span>

        {muted ? (
          <span
            title="已静音"
            className="grid h-4 w-4 place-items-center rounded-full bg-ink-950/80 text-red-300"
          >
            <MicOffIcon className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </span>
    </>
  );
}
