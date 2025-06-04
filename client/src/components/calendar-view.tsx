import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDate } from '@/lib/i18n';
import type { Event } from '@shared/schema';

interface CalendarViewProps {
  events: Event[];
  onEventClick: (event: Event) => void;
}

export default function CalendarView({ events, onEventClick }: CalendarViewProps) {
  const { language } = useLanguage();
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1; // Make Monday = 0
  };

  const getEventsForDate = (date: Date) => {
    // Create date string in local timezone to avoid timezone offset issues
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    return events.filter(event => event.date === dateString);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const renderCalendarGrid = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const today = new Date();
    
    const weekDays = language === 'no' 
      ? ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const days = [];

    // Week day headers
    weekDays.forEach(day => {
      days.push(
        <div key={day} className="p-2 text-center text-sm font-medium text-neutral-600 border-b">
          {day}
        </div>
      );
    });

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2 min-h-[80px] border-b border-r"></div>);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const dayEvents = getEventsForDate(date);
      const isToday = 
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

      days.push(
        <div key={day} className="p-1 min-h-[80px] border-b border-r relative">
          <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary font-bold' : 'text-neutral-900'}`}>
            {day}
          </div>
          <div className="space-y-1">
            {dayEvents.slice(0, 2).map((event, index) => (
              <button
                key={event.id}
                onClick={() => onEventClick(event)}
                className={`w-full text-xs p-1 rounded text-left truncate relative ${
                  event.status === 'cancelled' 
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 line-through' 
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                {event.title}
                {event.status === 'cancelled' && (
                  <span className="absolute top-0 right-0 text-[8px] text-red-600 font-bold">
                    ✕
                  </span>
                )}
              </button>
            ))}
            {dayEvents.length > 2 && (
              <div className="text-xs text-neutral-500">
                +{dayEvents.length - 2} {language === 'no' ? 'mer' : 'more'}
              </div>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  const getMonthYearText = () => {
    const options: Intl.DateTimeFormatOptions = { 
      month: 'long', 
      year: 'numeric' 
    };
    const locale = language === 'no' ? 'no-NO' : 'en-US';
    return currentDate.toLocaleDateString(locale, options);
  };

  return (
    <Card>
      <CardContent className="p-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <CalendarIcon className="h-5 w-5" />
            <span>{getMonthYearText()}</span>
          </h3>
          <Button variant="ghost" size="sm" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-l border-t">
          {renderCalendarGrid()}
        </div>

        {/* Legend */}
        <div className="mt-4 text-xs text-neutral-600 flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded bg-primary/10"></div>
            <span>{language === 'no' ? 'Arrangement' : 'Event'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded border-2 border-primary"></div>
            <span>{language === 'no' ? 'I dag' : 'Today'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}