import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarStatusBadges } from "./StatusIcons";

export type FieldPeer = {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isLocal: boolean;
};

type Layout = {
  identity: string;
  /** Percent 0–100 */
  x: number;
  /** Percent 0–100 */
  y: number;
  size: number;
  z: number;
};

const BUBBLE_COLORS = [
  "from-[#3dd6b8] to-[#149882]",
  "from-[#5b9fd4] to-[#2f6f9e]",
  "from-[#e0b35a] to-[#b8842d]",
  "from-[#d46a7a] to-[#a8334f]",
  "from-[#8b7cf0] to-[#5c4fc7]",
  "from-[#7ec8a3] to-[#3f8f6d]",
];

const GAP = 16;

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return hash;
}

function colorFor(id: string) {
  return BUBBLE_COLORS[hashId(id) % BUBBLE_COLORS.length];
}

/** Grid column count for a given peer count. */
function gridCols(total: number): number {
  if (total <= 1) return 1;
  if (total <= 4) return 2;
  if (total <= 9) return 3;
  return Math.ceil(Math.sqrt(total));
}

/**
 * Compute card size that fits `total` peers into the container.
 * Targets a square-ish grid; scales down for many peers.
 */
function cardSize(containerW: number, containerH: number, total: number): number {
  // y = 1.2x baseline, max = 2y, min = 0.5y
  const BASE_SIZE = 120; // 1.2x previous 100px standard
  if (total <= 0) return BASE_SIZE;

  const cols = gridCols(total);
  const rows = Math.ceil(total / cols);

  // Available space per cell
  const cellW = (containerW - GAP * (cols + 1)) / cols;
  const cellH = (containerH - GAP * (rows + 1)) / rows;

  // Card = smaller dimension of cell, scaled up 1.2x
  const raw = Math.min(cellW, cellH) * 1.2;
  // Clamp: min = 0.5y, max = 2y
  return Math.max(BASE_SIZE * 0.5, Math.min(BASE_SIZE * 2, Math.floor(raw)));
}

/**
 * Grid layout: even → square grid, odd → staggered (honeycomb).
 * Centroid is always at canvas center.
 */
function packLayouts(
  peers: FieldPeer[],
  containerW: number,
  containerH: number,
): Layout[] {
  const n = peers.length;
  if (n === 0) return [];

  const ordered = [...peers].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.identity.localeCompare(b.identity);
  });

  const size = cardSize(containerW, containerH, n);
  const step = size + GAP;
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  const isOdd = n % 2 === 1;

  // Place in grid (relative to origin)
  const rel: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Actual columns in this row (last row may be shorter)
    const colsInRow = row === rows - 1 ? n - row * cols : cols;

    // Center this row horizontally
    const rowOffsetX = (cols - colsInRow) * step * 0.5;

    // Stagger: odd peer count → odd rows shift right by half-step
    const stagger = isOdd && row % 2 === 1 ? step * 0.5 : 0;

    rel.push({
      x: col * step + rowOffsetX + stagger,
      y: row * step,
    });
  }

  // Compute centroid
  let sumX = 0;
  let sumY = 0;
  for (const p of rel) {
    sumX += p.x;
    sumY += p.y;
  }
  const centX = sumX / n;
  const centY = sumY / n;

  // Shift centroid to canvas center
  const cx = containerW / 2;
  const cy = containerH / 2;
  const half = size / 2;

  const abs = rel.map((p) => ({
    x: p.x - centX + cx,
    y: p.y - centY + cy,
  }));

  // Clamp to bounds
  const clamped = abs.map((p) => ({
    x: Math.min(containerW - half - 2, Math.max(half + 2, p.x)),
    y: Math.min(containerH - half - 2, Math.max(half + 2, p.y)),
  }));

  // Re-center after clamping
  let reSumX = 0;
  let reSumY = 0;
  for (const p of clamped) {
    reSumX += p.x;
    reSumY += p.y;
  }
  let shiftX = cx - reSumX / n;
  let shiftY = cy - reSumY / n;
  if (!clamped.every((p) => p.x + shiftX > half + 2 && p.x + shiftX < containerW - half - 2))
    shiftX = 0;
  if (!clamped.every((p) => p.y + shiftY > half + 2 && p.y + shiftY < containerH - half - 2))
    shiftY = 0;

  return ordered.map((peer, i) => ({
    identity: peer.identity,
    x: ((clamped[i].x + shiftX) / containerW) * 100,
    y: ((clamped[i].y + shiftY) / containerH) * 100,
    size,
    z: 20 + (n - i),
  }));
}

type Props = {
  peers: FieldPeer[];
  localDeafened?: boolean;
  emptyText?: string;
  volumes?: Record<string, number>;
  onVolumeChange?: (identity: string, volume: number) => void;
};

/** Responsive peer field with grid packing. */
export default function PeerField({
  peers,
  localDeafened = false,
  emptyText = "等待成员加入…",
  volumes,
  onVolumeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 440, h: 340 });

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) setDims({ w: width, h: height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const memberKey = peers
    .map((p) => p.identity)
    .sort()
    .join("|");

  const layouts = useMemo(
    () => packLayouts(peers, dims.w, dims.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberKey, dims.w, dims.h],
  );
  const byId = useMemo(() => new Map(layouts.map((l) => [l.identity, l])), [layouts]);

  if (peers.length === 0) {
    return (
      <div
        ref={containerRef}
        className="relative flex min-h-[180px] w-full flex-1 items-center justify-center"
      >
        <p className="text-sand-100/45">{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative min-h-[180px] w-full flex-1"
    >
      {/* Soft background glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pulse-500/10 blur-3xl sm:h-64 sm:w-64 md:h-80 md:w-80" />

      {peers.map((peer) => {
        const layout = byId.get(peer.identity);
        if (!layout) return null;
        const fontSize = Math.max(10, Math.round(layout.size * 0.14));
        return (
          <div
            key={peer.identity}
            className="absolute transition-all duration-700 ease-out"
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              zIndex: peer.isSpeaking ? 90 : layout.z,
              transform: "translate(-50%, -50%)",
            }}
            title={peer.name}
          >
            {/* Rounded-square card */}
            <div
              className={`relative flex flex-col items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-br font-semibold text-ink-950 shadow-[0_8px_28px_rgba(0,0,0,0.4)] ring-2 transition duration-300 ${
                peer.isSpeaking && !peer.isMuted
                  ? "scale-[1.06] ring-pulse-300 shadow-glow"
                  : "ring-white/20"
              } ${colorFor(peer.identity)}`}
              style={{
                width: layout.size,
                height: layout.size,
                fontSize,
                padding: "5px 3px",
              }}
            >
              {/* "我" badge */}
              {peer.isLocal ? (
                <span className="absolute right-0.5 top-0.5 z-10 rounded-full bg-pulse-400 px-1.5 py-0.5 text-[9px] font-bold leading-none text-ink-950">
                  我
                </span>
              ) : null}

              {/* Name — center, truncated at card edge */}
              <span className="mt-1 w-full truncate px-1 text-center leading-tight">
                {peer.name}
              </span>

              {/* Status badges */}
              <AvatarStatusBadges
                listening={peer.isLocal ? !localDeafened : true}
                muted={peer.isMuted}
              />

              {/* Per-peer volume slider (remote only) */}
              {!peer.isLocal && onVolumeChange ? (
                <div
                  className="flex w-full items-center gap-0.5 px-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volumes?.[peer.identity] ?? 100}
                    onChange={(e) => onVolumeChange(peer.identity, Number(e.target.value))}
                    className="hez-volume hez-volume-xs flex-1"
                    aria-label={`${peer.name} 音量`}
                  />
                  <span className="w-4 text-right text-[8px] tabular-nums text-ink-950/60">
                    {volumes?.[peer.identity] ?? 100}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
