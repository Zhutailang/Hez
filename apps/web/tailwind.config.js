/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#071018",
          900: "#0b1622",
          800: "#122233",
          700: "#1a3144",
        },
        pulse: {
          300: "#7ee8d4",
          400: "#3dd6b8",
          500: "#1fbfa2",
          600: "#149882",
        },
        sand: {
          50: "#f4f1ea",
          100: "#e8e2d4",
          200: "#d4cbb5",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 40px rgba(61, 214, 184, 0.18)",
      },
      keyframes: {
        wave: {
          "0%, 100%": { transform: "scaleY(0.35)" },
          "50%": { transform: "scaleY(1)" },
        },
        drift: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        wave: "wave 1.1s ease-in-out infinite",
        drift: "drift 6s ease-in-out infinite",
        fadeUp: "fadeUp 0.55s ease-out both",
      },
    },
  },
  plugins: [],
};
