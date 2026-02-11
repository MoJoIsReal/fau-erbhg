import type { Event, EventRegistration } from '@shared/schema';
import { formatDate } from './i18n';

export function exportAttendeesToExcel(event: Event, registrations: EventRegistration[], language: 'no' | 'en') {
  const isFotoEvent = event.type === 'foto';

  let csvContent: string[][];

  if (isFotoEvent) {
    // Foto event: list sorted by time slot with parent, child, and contact info
    const headers = language === 'no'
      ? ['Tidspunkt', 'Fornavn barn', 'Foresatt', 'E-post', 'Telefon']
      : ['Time slot', 'Child first name', 'Parent/Guardian', 'Email', 'Phone'];

    // Build flat list of all children with their time slots
    const [hours, minutes] = event.time.split(':').map(Number);
    let totalChildrenBefore = 0;
    const rows: string[][] = [];

    for (const reg of registrations) {
      let childrenNames: string[] = [];
      try {
        if (reg.childrenNames) childrenNames = JSON.parse(reg.childrenNames);
      } catch {}

      const childCount = reg.attendeeCount || 1;
      for (let i = 0; i < childCount; i++) {
        const slotMinutes = (totalChildrenBefore + i) * 10;
        const slotDate = new Date(2000, 0, 1, hours, minutes + slotMinutes);
        const slotTime = `${slotDate.getHours().toString().padStart(2, '0')}:${slotDate.getMinutes().toString().padStart(2, '0')}`;
        rows.push([
          slotTime,
          childrenNames[i] || `Barn ${i + 1}`,
          reg.name,
          reg.email,
          reg.phone || '',
        ]);
      }
      totalChildrenBefore += childCount;
    }

    csvContent = [
      [language === 'no' ? 'Arrangement:' : 'Event:', event.title],
      [language === 'no' ? 'Dato:' : 'Date:', formatDate(event.date, language)],
      [language === 'no' ? 'Starttid:' : 'Start time:', event.time],
      [language === 'no' ? 'Sted:' : 'Location:', event.location],
      [''],
      [language === 'no' ? 'Fotograferingsliste:' : 'Photography schedule:'],
      headers,
      ...rows,
      [''],
      [language === 'no' ? 'Totalt antall barn:' : 'Total children:',
       totalChildrenBefore.toString()],
      [language === 'no' ? 'Antall foresatte:' : 'Number of parents:',
       registrations.length.toString()],
    ];
  } else {
    // Standard event export
    const headers = language === 'no'
      ? ['Navn', 'E-post', 'Telefon', 'Antall deltakere', 'Kommentarer']
      : ['Name', 'Email', 'Phone', 'Attendee Count', 'Comments'];

    csvContent = [
      [language === 'no' ? 'Arrangement:' : 'Event:', event.title],
      [language === 'no' ? 'Dato:' : 'Date:', formatDate(event.date, language)],
      [language === 'no' ? 'Tid:' : 'Time:', event.time],
      [language === 'no' ? 'Sted:' : 'Location:', event.location],
      [''],
      [language === 'no' ? 'Påmeldingsliste:' : 'Registration List:'],
      headers,
      ...registrations.map(reg => [
        reg.name,
        reg.email,
        reg.phone || '',
        reg.attendeeCount?.toString() || '1',
        reg.comments || ''
      ]),
      [''],
      [language === 'no' ? 'Totalt antall deltakere:' : 'Total attendees:',
       registrations.reduce((sum, reg) => sum + (reg.attendeeCount || 1), 0).toString()],
      [language === 'no' ? 'Antall påmeldinger:' : 'Number of registrations:',
       registrations.length.toString()]
    ];
  }

  // Convert to CSV format
  const csv = csvContent
    .map(row => row.map(cell => {
      const cellStr = cell?.toString() || '';
      return '"' + cellStr.replace(/"/g, '""') + '"';
    }).join(','))
    .join('\n');

  // Add BOM for proper UTF-8 encoding in Excel
  const bom = '\uFEFF';
  const csvWithBom = bom + csv;

  // Create and download file
  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const filename = event.title.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '_') + '_' + event.date + '.csv';
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
}

export function exportAttendeesToTSV(event: Event, registrations: EventRegistration[], language: 'no' | 'en') {
  // Create tab-separated values that Excel can import
  const headers = language === 'no' 
    ? ['Navn', 'E-post', 'Telefon', 'Antall deltakere', 'Kommentarer']
    : ['Name', 'Email', 'Phone', 'Attendee Count', 'Comments'];
  
  const tsvContent = [
    // Event information header
    `${language === 'no' ? 'Arrangement:' : 'Event:'}\t${event.title}`,
    `${language === 'no' ? 'Dato:' : 'Date:'}\t${formatDate(event.date, language)}`,
    `${language === 'no' ? 'Tid:' : 'Time:'}\t${event.time}`,
    `${language === 'no' ? 'Sted:' : 'Location:'}\t${event.location}`,
    '', // Empty row
    `${language === 'no' ? 'Påmeldingsliste:' : 'Registration List:'}`,
    headers.join('\t'),
    ...registrations.map(reg => [
      reg.name,
      reg.email,
      reg.phone || '',
      reg.attendeeCount?.toString() || '1',
      reg.comments || ''
    ].join('\t')),
    '', // Empty row
    `${language === 'no' ? 'Totalt antall deltakere:' : 'Total attendees:'}\t${registrations.reduce((sum, reg) => sum + (reg.attendeeCount || 1), 0)}`,
    `${language === 'no' ? 'Antall påmeldinger:' : 'Number of registrations:'}\t${registrations.length}`
  ].join('\n');

  // Add BOM for proper UTF-8 encoding
  const bom = '\uFEFF';
  const tsvWithBom = bom + tsvContent;

  // Create and download file
  const blob = new Blob([tsvWithBom], { type: 'text/tab-separated-values;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    const filename = `${event.title.replace(/[^a-zA-Z0-9æøåÆØÅ]/g, '_')}_${event.date}.tsv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
}