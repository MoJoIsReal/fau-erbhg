import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Calendar, Download, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { createCalendarEvent, downloadICSFile, generateGoogleCalendarUrl, generateOutlookCalendarUrl, generateAppleCalendarUrl } from '@/lib/calendar';
import type { Event } from '@shared/schema';

interface AddToCalendarProps {
  event: Event;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export default function AddToCalendar({ event, variant = 'outline', size = 'sm' }: AddToCalendarProps) {
  const { t, language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const calendarEvent = createCalendarEvent(event);

  const handleGoogleCalendar = () => {
    const url = generateGoogleCalendarUrl(calendarEvent);
    window.open(url, '_blank');
    setIsOpen(false);
  };

  const handleOutlookCalendar = () => {
    const url = generateOutlookCalendarUrl(calendarEvent);
    window.open(url, '_blank');
    setIsOpen(false);
  };

  const handleAppleCalendar = () => {
    downloadICSFile(calendarEvent, `${event.title}_${event.date}`);
    setIsOpen(false);
  };

  const handleDownloadICS = () => {
    downloadICSFile(calendarEvent, `${event.title}_${event.date}`);
    setIsOpen(false);
  };

  const getButtonText = () => {
    return language === 'no' ? 'Legg til i kalender' : 'Add to calendar';
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="flex items-center space-x-2">
          <Calendar className="h-4 w-4" />
          <span>{getButtonText()}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleGoogleCalendar} className="flex items-center space-x-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Google Calendar</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem onClick={handleOutlookCalendar} className="flex items-center space-x-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 18h10v-2H7v2zM7 14h10v-2H7v2zM7 10h10V8H7v2zM7 6h10V4H7v2z" fill="#0078D4"/>
          </svg>
          <span>Outlook</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleAppleCalendar} className="flex items-center space-x-2">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" fill="#000"/>
          </svg>
          <span>Apple Calendar</span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={handleDownloadICS} className="flex items-center space-x-2">
          <Download className="h-4 w-4" />
          <span>{language === 'no' ? 'Last ned .ics fil' : 'Download .ics file'}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}