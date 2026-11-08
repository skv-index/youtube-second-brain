import { create } from "zustand";

interface ThemeState {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  toggle: () => void;
  hydrate: () => void;
}

function apply(theme: "dark" | "light"): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: "dark",
  setTheme: (theme) => {
    localStorage.setItem("ysb-theme", theme);
    apply(theme);
    set({ theme });
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
  hydrate: () => {
    const stored = localStorage.getItem("ysb-theme");
    const theme = stored === "light" ? "light" : "dark";
    // Deep dark is the home base; light is an explicit escape hatch.
    if (theme === "light") {
      apply("light");
      set({ theme });
    } else {
      apply("dark");
    }
  },
}));
