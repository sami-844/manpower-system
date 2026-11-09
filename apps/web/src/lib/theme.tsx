/**
 * Light / dark / system theme. A tiny replacement for next-themes, which injects a <script>
 * from inside React (a dev error on every page under React 19). The first paint is set by the
 * inline snippet in index.html, which reads the same storage key.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: string) => void;
}
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(stored);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const on = () => setSystemDark(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((t: string) => {
    const next: Theme = t === "dark" || t === "system" ? t : "light";
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable: theme lasts for this tab only */
    }
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme must be used inside <ThemeProvider>");
  return t;
}
