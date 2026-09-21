import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Whether the dark theme is the one on screen.
 *
 * `resolvedTheme` alone would cost a frame of the light artwork: next-themes
 * reports `undefined` until it has mounted, so anything picked from it starts
 * out light and swaps. The `dark` class on `<html>` is already correct before
 * first paint — next-themes' own blocking script puts it there — so that is
 * what the first render reads, and `resolvedTheme` takes over from the moment
 * it knows, which is what keeps the toggle live.
 */
export function useIsDarkTheme(): boolean {
  const { resolvedTheme } = useTheme();
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    if (resolvedTheme) setIsDark(resolvedTheme === "dark");
  }, [resolvedTheme]);

  return isDark;
}
