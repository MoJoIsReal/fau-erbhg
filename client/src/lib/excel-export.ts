import type { Event, EventRegistration } from '@shared/schema';
import { formatDate } from './i18n';

export function exportAttendeesToExcel(event: Event, registrations: EventRegistration[], language: 'no' | 'en') {
  // Create CSV content that Excel can open
  const headers = language === 'no' 
    ? ['Navn', 'E-post', 'Telefon', 'Antall deltakere', 'Kommentarer']
    : ['Name', 'Email', 'Phone', 'Attendee Count', 'Comments'];
  
  const csvContent = [
    // Event information header
    [language === 'no' ? 'Arrangement:' : 'Event:', event.title],
    [language === 'no' ? 'Dato:' : 'Date:', formatDate(event.date, language)],
    [language === 'no' ? 'Tid:' : 'Time:', event.time],
    [language === 'no' ? 'Sted:' : 'Location:', event.location],
    [''], // Empty row
    [language === 'no' ? 'Påmeldingsliste:' : 'Registration List:'],
    headers,
    ...registrations.map(reg => [
      reg.name,
      reg.email,
      reg.phone || '',
      reg.attendeeCount?.toString() || '1',
      reg.comments || ''
    ]),
    [''], // Empty row
    [language === 'no' ? 'Totalt antall deltakere:' : 'Total attendees:', 
     registrations.reduce((sum, reg) => sum + (reg.attendeeCount || 1), 0).toString()],
    [language === 'no' ? 'Antall påmeldinger:' : 'Number of registrations:', 
     registrations.length.toString()]
  ];

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