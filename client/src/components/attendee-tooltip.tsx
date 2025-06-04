import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/contexts/LanguageContext";
import type { EventRegistration } from "@shared/schema";

interface AttendeeTooltipProps {
  eventId: number;
  attendeeCount: number;
  maxAttendees?: number | null;
  className?: string;
}

export default function AttendeeTooltip({ 
  eventId, 
  attendeeCount, 
  maxAttendees,
  className = ""
}: AttendeeTooltipProps) {
  const { language } = useLanguage();

  const { data: registrations = [] } = useQuery<EventRegistration[]>({
    queryKey: ["/api/events", eventId, "registrations"],
    enabled: attendeeCount > 0,
  });

  const getTooltipContent = () => {
    if (attendeeCount === 0) {
      return language === 'no' ? 'Ingen påmeldte ennå' : 'No registrations yet';
    }

    if (attendeeCount > 10) {
      return language === 'no' 
        ? 'Mer enn 10 påmeldte. Bruk Excel-eksport for full liste.'
        : 'More than 10 attendees. Use Excel export for full list.';
    }

    const attendeeNames = registrations
      .map(reg => {
        const baseCount = reg.attendeeCount || 1;
        if (baseCount === 1) {
          return reg.name;
        }
        return `${reg.name} (+${baseCount - 1})`;
      })
      .join('\n');

    return attendeeNames || (language === 'no' ? 'Laster...' : 'Loading...');
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center text-accent cursor-help ${className}`}>
            <Users className="h-4 w-4 mr-1" />
            <span>
              {attendeeCount} {language === 'no' ? 'påmeldte' : 'attendees'}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="whitespace-pre-line text-sm">
            {getTooltipContent()}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}