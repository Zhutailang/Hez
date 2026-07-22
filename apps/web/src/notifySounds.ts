/**
 * UI cue sounds as short WAV blobs (HTMLAudioElement).
 * Only: remote chat · peer join · peer leave. Unlock must stay truly silent
 * (iOS often ignores HTMLAudioElement.volume).
 */

const SAMPLE_RATE = 44100;

/** 50% of the previous cue levels. */
const VOL_MESSAGE = 0.325;
const VOL_JOIN = 0.35;
const VOL_LEAVE = 0.32;

let messageUrl: string | null = null;
let joinUrl: string | null = null;
let leaveUrl: string | null = null;
let silentUrl: string | null = null;
let unlocked = false;
let listenersBound = false;

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
}

function encodeWav(samples: Float32Array): string {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function synth(
  notes: { freq: number; start: number; dur: number; gain: number }[],
  totalDur: number,
): string {
  const n = Math.ceil(SAMPLE_RATE * totalDur);
  const samples = new Float32Array(n);
  for (const note of notes) {
    const start = Math.floor(note.start * SAMPLE_RATE);
    const len = Math.floor(note.dur * SAMPLE_RATE);
    for (let i = 0; i < len; i += 1) {
      const idx = start + i;
      if (idx >= n) break;
      const t = i / SAMPLE_RATE;
      const env =
        Math.min(1, i / (0.012 * SAMPLE_RATE)) *
        Math.min(1, (len - i) / (0.04 * SAMPLE_RATE));
      samples[idx] += Math.sin(2 * Math.PI * note.freq * t) * note.gain * env;
    }
  }
  for (let i = 0; i < n; i += 1) {
    samples[i] = Math.tanh(samples[i] * 1.2);
  }
  return encodeWav(samples);
}

function ensureUrls() {
  if (!silentUrl) {
    // All-zero buffer — safe unlock on iOS where .volume is ignored.
    silentUrl = encodeWav(new Float32Array(Math.ceil(SAMPLE_RATE * 0.04)));
  }
  if (!messageUrl) {
    // Soft double-blip — remote chat
    messageUrl = synth(
      [
        { freq: 988, start: 0, dur: 0.09, gain: 0.55 },
        { freq: 1319, start: 0.1, dur: 0.12, gain: 0.5 },
      ],
      0.28,
    );
  }
  if (!joinUrl) {
    // Rising chime — someone enters
    joinUrl = synth(
      [
        { freq: 523, start: 0, dur: 0.14, gain: 0.5 },
        { freq: 659, start: 0.12, dur: 0.14, gain: 0.48 },
        { freq: 784, start: 0.24, dur: 0.2, gain: 0.45 },
      ],
      0.5,
    );
  }
  if (!leaveUrl) {
    // Falling soft tone — someone leaves (distinct from join)
    leaveUrl = synth(
      [
        { freq: 659, start: 0, dur: 0.12, gain: 0.42 },
        { freq: 440, start: 0.11, dur: 0.18, gain: 0.38 },
      ],
      0.36,
    );
  }
}

function playUrl(url: string, volume: number) {
  ensureUrls();
  bindUnlockListeners();
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  void audio.play().then(() => {
    unlocked = true;
  }).catch(() => {
    // Blocked until a real user gesture unlocks audio
  });
}

function unbindUnlockListeners() {
  if (!listenersBound || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", onUserGestureUnlock);
  window.removeEventListener("keydown", onUserGestureUnlock);
  window.removeEventListener("touchstart", onUserGestureUnlock);
  listenersBound = false;
}

function onUserGestureUnlock() {
  unlockNotifySounds();
}

/**
 * Silently unlock autoplay after a user gesture.
 * Does NOT play a cue sound — only a zero-sample WAV.
 */
export function unlockNotifySounds() {
  ensureUrls();
  if (unlocked) {
    unbindUnlockListeners();
    return;
  }
  const audio = new Audio(silentUrl!);
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      unlocked = true;
      unbindUnlockListeners();
    })
    .catch(() => {
      // keep listeners until a gesture succeeds
    });
}

function bindUnlockListeners() {
  if (listenersBound || unlocked || typeof window === "undefined") return;
  listenersBound = true;
  window.addEventListener("pointerdown", onUserGestureUnlock, { passive: true });
  window.addEventListener("keydown", onUserGestureUnlock, { passive: true });
  window.addEventListener("touchstart", onUserGestureUnlock, { passive: true });
}

if (typeof window !== "undefined") {
  bindUnlockListeners();
}

/** Soft double-blip when a remote chat message arrives. */
export function playMessageSound() {
  ensureUrls();
  playUrl(messageUrl!, VOL_MESSAGE);
}

/** Rising chime when someone joins the voice room. */
export function playJoinSound() {
  ensureUrls();
  playUrl(joinUrl!, VOL_JOIN);
}

/** Falling tone when someone leaves the voice room. */
export function playLeaveSound() {
  ensureUrls();
  playUrl(leaveUrl!, VOL_LEAVE);
}
