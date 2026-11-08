import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#0A0C10",
          900: "#0E1117",
          850: "#12161E",
          800: "#171C26",
          700: "#212836",
          600: "#2E3646",
        },
        paper: {
          50: "#F7F8FA",
          100: "#EEF0F4",
          200: "#DFE3EA",
          300: "#C6CCD6",
        },
        signal: {
          DEFAULT: "#FA5252",
          strong: "#F03E3E",
          soft: "rgba(250, 82, 82, 0.12)",
        },
        mint: { DEFAULT: "#38D39F", soft: "rgba(56, 211, 159, 0.12)" },
      },
      keyframes: {
        "rise": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "rise": "rise 0.5s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
