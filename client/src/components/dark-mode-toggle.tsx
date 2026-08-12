import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DarkModeToggle() {
  const { theme, setTheme } = useTheme();
  const { language, t } = useLanguage();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark
        ? (t.header.switchLightMode)
        : (t.header.switchDarkMode)
      }
      title={isDark
        ? (t.header.lightMode)
        : (t.header.darkMode)
      }
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
