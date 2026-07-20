export default function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const titleClass = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <div className="inline-flex items-center gap-3">
      <span className="relative grid h-10 w-10 place-items-center rounded-2xl bg-pulse-500/15 ring-1 ring-pulse-400/35">
        <span className="absolute inset-1 rounded-xl bg-gradient-to-br from-pulse-300/40 to-transparent" />
        <span className="relative h-3 w-3 rounded-full bg-pulse-400 shadow-[0_0_16px_rgba(61,214,184,0.8)]" />
      </span>
      <span className={`font-display font-semibold tracking-tight text-sand-50 ${titleClass}`}>
        Hez
      </span>
    </div>
  );
}
