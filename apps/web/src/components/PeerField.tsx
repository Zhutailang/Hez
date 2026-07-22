import { useMemo } from "react";
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
  x: number;
  y: number;
  size: number;
  rotate: number;
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

/** Field coordinate space used for collision (px). */
const FIELD_W = 440;
const FIELD_H = 340;
const GAP = 14;

function hashId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return hash;
}

function colorFor(id: string) {
  return BUBBLE_COLORS[hashId(id) % BUBBLE_COLORS.length];
}

function initialOf(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function sizeFor(identity: string, total: number) {
  const h = hashId(identity);
  // Slightly smaller as group grows so the cluster stays centered
  const base = total <= 1 ? 96 : total <= 3 ? 78 : total <= 6 ? 68 : 58;
  const jitter = h % 18;
  return base + jitter - 6;
}

function pct(xPx: number, yPx: number) {
  return {
    x: (xPx / FIELD_W) * 100,
    y: (yPx / FIELD_H) * 100,
  };
}

function overlaps(
  a: { xPx: number; yPx: number; size: number },
  b: { xPx: number; yPx: number; size: number },
) {
  const need = a.size / 2 + b.size / 2 + GAP;
  const dx = a.xPx - b.xPx;
  const dy = a.yPx - b.yPx;
  return dx * dx + dy * dy < need * need;
}

function clamp(xPx: number, yPx: number, size: number) {
  const half = size / 2 + 10;
  return {
    xPx: Math.min(FIELD_W - half, Math.max(half, xPx)),
    yPx: Math.min(FIELD_H - half - 36, Math.max(half, yPx)),
  };
}

/**
 * Cell-division radial layout:
 * 1 → center; 2 → split L/R; 3+ → rings around center like mitosis.
 */
function packLayouts(peers: FieldPeer[]): Layout[] {
  const n = peers.length;
  if (n === 0) return [];

  // Stable order: local first (nucleus), then others by identity
  const ordered = [...peers].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
    return a.identity.localeCompare(b.identity);
  });

  const cx = FIELD_W / 2;
  const cy = FIELD_H / 2;
  const placed: { identity: string; xPx: number; yPx: number; size: number; rotate: number; z: number }[] =
    [];

  // Target radius grows with count (cell expands)
  const ringRadius = (countOnRing: number, ringIndex: number) => {
    const avgSize = sizeFor(ordered[0].identity, n);
    return avgSize * 0.55 + ringIndex * (avgSize * 0.95 + GAP) + Math.max(0, countOnRing - 4) * 4;
  };

  for (let i = 0; i < ordered.length; i += 1) {
    const peer = ordered[i];
    const size = sizeFor(peer.identity, n);
    const h = hashId(peer.identity);
    const rotate = ((h % 11) - 5) * 0.45;
    const z = 20 + (n - i);

    let xPx = cx;
    let yPx = cy;

    if (n === 1) {
      // Single cell — dead center
      xPx = cx;
      yPx = cy;
    } else if (n === 2) {
      // Mitosis: split left / right of center
      const sep = size / 2 + sizeFor(ordered[1 - i]?.identity ?? peer.identity, n) / 2 + GAP + 8;
      xPx = i === 0 ? cx - sep / 2 : cx + sep / 2;
      yPx = cy + ((h % 9) - 4) * 0.8;
    } else if (n === 3) {
      // Triangle around center
      const r = ringRadius(3, 0);
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3 + ((h % 7) - 3) * 0.02;
      xPx = cx + Math.cos(angle) * r;
      yPx = cy + Math.sin(angle) * r * 0.92;
    } else {
      // 4+: nucleus + expanding rings (cell colony)
      const hasNucleus = n >= 5;
      if (hasNucleus && i === 0) {
        const nudge = ((h % 5) - 2) * 2;
        xPx = cx + nudge;
        yPx = cy + nudge * 0.6;
      } else {
        const orbitIndex = hasNucleus ? i - 1 : i;
        const orbitTotal = hasNucleus ? n - 1 : n;
        const ring0Cap = Math.min(6, orbitTotal);
        let ring: number;
        let indexInRing: number;
        let ringCap: number;
        if (orbitIndex < ring0Cap) {
          ring = 0;
          indexInRing = orbitIndex;
          ringCap = ring0Cap;
        } else {
          const after = orbitIndex - ring0Cap;
          ring = 1 + Math.floor(after / 8);
          indexInRing = after % 8;
          const left = orbitTotal - ring0Cap - (ring - 1) * 8;
          ringCap = Math.min(8, Math.max(1, left));
        }

        const r = ringRadius(ringCap, ring);
        const baseAngle = -Math.PI / 2 + ring * 0.35;
        const angle =
          baseAngle + (indexInRing * 2 * Math.PI) / ringCap + ((h % 9) - 4) * 0.015;
        xPx = cx + Math.cos(angle) * r;
        yPx = cy + Math.sin(angle) * r * 0.9;
      }
    }

    const c0 = clamp(xPx, yPx, size);
    xPx = c0.xPx;
    yPx = c0.yPx;

    // Resolve residual overlaps by pushing along radial axis (keeps center feel)
    for (let iter = 0; iter < 20; iter += 1) {
      let moved = false;
      for (const other of placed) {
        const me = { xPx, yPx, size };
        if (!overlaps(me, other)) continue;
        const dx = xPx - other.xPx;
        const dy = yPx - other.yPx;
        const dist = Math.hypot(dx, dy) || 0.01;
        const need = size / 2 + other.size / 2 + GAP;
        // Prefer push away from center (cell division outward)
        const fromCx = xPx - cx;
        const fromCy = yPx - cy;
        const radial = Math.hypot(fromCx, fromCy);
        let pushX: number;
        let pushY: number;
        if (radial > 4) {
          const scale = (need - dist + 2) / radial;
          pushX = fromCx * scale;
          pushY = fromCy * scale;
        } else {
          const scale = (need - dist) / dist;
          pushX = dx * scale;
          pushY = dy * scale;
        }
        xPx += pushX;
        yPx += pushY;
        const c = clamp(xPx, yPx, size);
        xPx = c.xPx;
        yPx = c.yPx;
        moved = true;
      }
      if (!moved) break;
    }

    placed.push({ identity: peer.identity, xPx, yPx, size, rotate, z });
  }

  return placed.map((p) => {
    const { x, y } = pct(p.xPx, p.yPx);
    return {
      identity: p.identity,
      x,
      y,
      size: p.size,
      rotate: p.rotate,
      z: p.z,
    };
  });
}

type Props = {
  peers: FieldPeer[];
  localDeafened?: boolean;
  emptyText?: string;
  /** Per-remote-peer output volume 0–100. Local peer is ignored. */
  volumes?: Record<string, number>;
  onVolumeChange?: (identity: string, volume: number) => void;
};

/** Center-radial peer field: 1 in middle, more split outward like cell division. */
export default function PeerField({
  peers,
  localDeafened = false,
  emptyText = "等待成员加入…",
  volumes,
  onVolumeChange,
}: Props) {
  // Recompute only when membership (ids) change — speaking/mute shouldn't reshuffle
  const memberKey = peers
    .map((p) => p.identity)
    .sort()
    .join("|");
  const layouts = useMemo(
    () => packLayouts(peers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memberKey],
  );
  const byId = useMemo(() => new Map(layouts.map((l) => [l.identity, l])), [layouts]);

  if (peers.length === 0) {
    return (
      <div className="relative flex min-h-[220px] w-full flex-1 items-center justify-center sm:min-h-[280px] md:min-h-[340px] lg:min-h-[400px]">
        <p className="text-sand-100/45">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-[220px] w-full flex-1 sm:min-h-[280px] md:min-h-[340px] lg:min-h-[400px]">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pulse-500/10 blur-3xl sm:h-64 sm:w-64 md:h-80 md:w-80" />
      {/* Soft radial guide rings */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.04]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[68%] w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.03]" />

      {peers.map((peer) => {
        const layout = byId.get(peer.identity);
        if (!layout) return null;
        const fontSize = Math.max(16, Math.round(layout.size * 0.28));
        return (
          <div
            key={peer.identity}
            className="absolute transition-all duration-700 ease-out"
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              zIndex: peer.isSpeaking ? 90 : layout.z,
              transform: `translate(-50%, -50%) rotate(${layout.rotate}deg)`,
            }}
            title={peer.name}
          >
            <div
              className={`relative grid place-items-center rounded-full bg-gradient-to-br font-semibold text-ink-950 shadow-[0_12px_36px_rgba(0,0,0,0.4)] ring-2 transition duration-300 ${
                peer.isSpeaking && !peer.isMuted
                  ? "scale-110 ring-pulse-300 shadow-glow"
                  : "ring-white/20"
              } ${colorFor(peer.identity)}`}
              style={{
                width: layout.size,
                height: layout.size,
                fontSize,
              }}
            >
              {initialOf(peer.name)}
              <AvatarStatusBadges
                listening={peer.isLocal ? !localDeafened : true}
                muted={peer.isMuted}
                isLocal={peer.isLocal}
              />
            </div>
            <p
              className="mt-2 truncate text-center text-xs text-sand-100/70"
              style={{
                maxWidth: layout.size + 12,
                transform: `rotate(${-layout.rotate}deg)`,
              }}
            >
              {peer.name}
            </p>
            {!peer.isLocal && onVolumeChange ? (
              <div
                className="mt-1.5 flex flex-col items-center gap-0.5"
                style={{ transform: `rotate(${-layout.rotate}deg)` }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={volumes?.[peer.identity] ?? 100}
                  onChange={(e) => onVolumeChange(peer.identity, Number(e.target.value))}
                  className="hez-volume hez-volume-sm"
                  aria-label={`${peer.name} 音量`}
                  title={`音量 ${volumes?.[peer.identity] ?? 100}`}
                />
                <span className="text-[10px] tabular-nums text-sand-100/45">
                  {volumes?.[peer.identity] ?? 100}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
