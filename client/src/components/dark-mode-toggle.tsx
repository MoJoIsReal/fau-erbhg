import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DarkModeToggle() {
  const { theme, setTheme } = useTheme();
  const { language } = useLanguage();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark
        ? (language === 'no' ? 'Bytt til lyst modus' : 'Switch to light mode')
        : (language === 'no' ? 'Bytt til mørkt modus' : 'Switch to dark mode')
      }
      title={isDark
        ? (language === 'no' ? 'Lyst modus' : 'Light mode')
        : (language === 'no' ? 'Mørkt modus' : 'Dark mode')
      }
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
