import { useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

/** The page ground in each theme, so the browser chrome matches it. */
const THEME_COLOR = { light: "#F9F6F1", dark: "#091A15" } as const;

/**
 * Light/dark switch.
 *
 * `resolvedTheme` rather than `theme`, because the default is now the system
 * preference: `theme` reads "system" until the user picks, which would have
 * left the button offering "switch to dark" while the page was already dark.
 */
export default function DarkModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useLanguage();
  const isDark = resolvedTheme === "dark";

  // theme-color cannot be expressed as a media query here: the theme is a
  // class the user can override, not the OS preference, so it is set from
  // whichever theme actually resolved.
  useEffect(() => {
    if (!resolvedTheme) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[isDark ? "dark" : "light"]);
  }, [resolvedTheme, isDark]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t.header.switchLightMode : t.header.switchDarkMode}
      title={isDark ? t.header.lightMode : t.header.darkMode}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
