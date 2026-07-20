export default function AudioWave({ active }: { active: boolean }) {
  return (
    <div className="flex h-8 items-end gap-1">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-1 rounded-full bg-pulse-400 origin-bottom ${
            active ? "animate-wave" : "opacity-35"
          }`}
          style={{
            height: active ? `${10 + (i % 3) * 6}px` : 8,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}
