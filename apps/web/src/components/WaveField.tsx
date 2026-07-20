export default function WaveField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-20 top-24 h-72 w-72 animate-drift rounded-full bg-pulse-500/10 blur-3xl" />
      <div
        className="absolute right-0 top-40 h-80 w-80 animate-drift rounded-full bg-sky-500/10 blur-3xl"
        style={{ animationDelay: "1.5s" }}
      />
      <svg
        className="absolute bottom-0 left-0 w-full opacity-40"
        viewBox="0 0 1440 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0 140 C 180 80, 300 200, 480 140 C 660 80, 780 40, 960 100 C 1140 160, 1260 120, 1440 80 L1440 220 L0 220 Z"
          fill="url(#hezWave)"
        />
        <defs>
          <linearGradient id="hezWave" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#3dd6b8" stopOpacity="0.35" />
            <stop offset="1" stopColor="#1a3144" stopOpacity="0.1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
