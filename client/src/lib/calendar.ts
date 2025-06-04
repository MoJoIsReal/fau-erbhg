import type { Event } from '@shared/schema';

export interface CalendarEvent {
  title: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
}

export function createCalendarEvent(event: Event): CalendarEvent {
  // Parse the date string (YYYY-MM-DD format)
  const [year, month, day] = event.date.split('-').map(Number);
  const [hours, minutes] = event.time.split(':').map(Number);
  
  // Create date with proper timezone handling
  const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  
  // Default to 2 hour duration if not specified
  const endDate = new Date(startDate);
  endDate.setHours(startDate.getHours() + 2);

  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startDate,
    endDate
  };
}

export function generateICSFile(calendarEvent: CalendarEvent): string {
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const escapeText = (text: string): string => {
    return text.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FAU Erdal Barnehage//Event Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@fau-erdal-barnehage.no`,
    `DTSTART:${formatDate(calendarEvent.startDate)}`,
    `DTEND:${formatDate(calendarEvent.endDate)}`,
    `SUMMARY:${escapeText(calendarEvent.title)}`,
    `DESCRIPTION:${escapeText(calendarEvent.description)}`,
    `LOCATION:${escapeText(calendarEvent.location)}`,
    `DTSTAMP:${formatDate(new Date())}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
}

export function downloadICSFile(calendarEvent: CalendarEvent, filename?: string): void {
  const icsContent = generateICSFile(calendarEvent);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || `${calendarEvent.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(link.href);
}

export function generateGoogleCalendarUrl(calendarEvent: CalendarEvent): string {
  const formatGoogleDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: calendarEvent.title,
    dates: `${formatGoogleDate(calendarEvent.startDate)}/${formatGoogleDate(calendarEvent.endDate)}`,
    details: calendarEvent.description,
    location: calendarEvent.location,
    sf: 'true',
    output: 'xml'
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateOutlookCalendarUrl(calendarEvent: CalendarEvent): string {
  const formatOutlookDate = (date: Date): string => {
    return date.toISOString();
  };

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: calendarEvent.title,
    startdt: formatOutlookDate(calendarEvent.startDate),
    enddt: formatOutlookDate(calendarEvent.endDate),
    body: calendarEvent.description,
    location: calendarEvent.location
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function generateAppleCalendarUrl(calendarEvent: CalendarEvent): string {
  // Apple Calendar uses the same ICS format but can be opened with webcal:// protocol
  const icsContent = generateICSFile(calendarEvent);
  const dataUri = `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
  return dataUri;
}