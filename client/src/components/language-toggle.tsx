import { Button } from "@/components/ui/button";
import { Languages } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/i18n";

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'no' ? 'en' : 'no');
  };

  const getCurrentLanguageLabel = () => {
    return language === 'no' ? 'NO' : 'EN';
  };

  const getNextLanguageLabel = () => {
    return language === 'no' ? 'English' : 'Norsk';
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="flex items-center space-x-2 text-neutral-600 hover:text-primary"
      title={`Switch to ${getNextLanguageLabel()}`}
    >
      <Languages className="h-4 w-4" />
      <span className="font-medium">{getCurrentLanguageLabel()}</span>
    </Button>
  );
}