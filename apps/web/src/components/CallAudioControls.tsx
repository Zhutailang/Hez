type Props = {
  noiseReduction: boolean;
  onToggleNoise: () => void;
  disabled?: boolean;
};

/** Mic noise-suppression toggle for Lab / Room toolbar. */
export default function CallAudioControls({
  noiseReduction,
  onToggleNoise,
  disabled = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={onToggleNoise}
      disabled={disabled}
      className={`rounded-full px-3.5 py-2.5 text-xs font-semibold transition disabled:opacity-40 sm:px-5 sm:py-3 sm:text-sm ${
        noiseReduction
          ? "bg-pulse-500 text-ink-950 hover:bg-pulse-400"
          : "border border-white/15 text-sand-100/85 hover:border-pulse-400/40"
      }`}
      title={noiseReduction ? "已开启麦克风降噪" : "已关闭麦克风降噪"}
    >
      {noiseReduction ? "降噪开" : "降噪关"}
    </button>
  );
}
