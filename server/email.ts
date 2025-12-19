import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Event, EventRegistration } from '@shared/schema';
import { FAU_EMAIL, KINDERGARTEN_ADDRESS } from '@shared/constants';
import * as Sentry from '@sentry/node';

// Create email transporter (shared across all email functions)
function createEmailTransporter(): Transporter | null {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('Email credentials not configured, skipping email send');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// Format location text with address for emails
function formatLocationForEmail(location: string, customLocation?: string): string {
  // Use custom location if "Annet" is selected and customLocation exists
  if (location === 'Annet' && customLocation) {
    return customLocation;
  }

  // Add addresses for standard locations
  const locationMap: Record<string, string> = {
    'Småbarnsfløyen': `Småbarnsfløyen: ${KINDERGARTEN_ADDRESS}`,
    'Storbarnsfløyen': `Storbarnsfløyen: ${KINDERGARTEN_ADDRESS}`,
    'Møterom': `Møterom: ${KINDERGARTEN_ADDRESS}`,
    'Ute': `Ute: ${KINDERGARTEN_ADDRESS}`,
    'Barnehagen': `Barnehagen: ${KINDERGARTEN_ADDRESS}`,
    'Grupperom': `Grupperom: ${KINDERGARTEN_ADDRESS}`,
  };

  return locationMap[location] || location;
}

interface EmailParams {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  isAnonymous?: boolean;
}

interface EventConfirmationParams {
  registration: EventRegistration;
  event: Event;
  language?: 'no' | 'en';
}

interface EventCancellationParams {
  registration: EventRegistration;
  event: Event;
  language?: 'no' | 'en';
}

interface EventReminderParams {
  registration: EventRegistration;
  event: Event;
  language?: 'no' | 'en';
}

export async function sendContactEmail(params: EmailParams): Promise<boolean> {
  const transporter = createEmailTransporter();
  if (!transporter) return false;

  try {

    const subjectMap: Record<string, string> = {
      general: 'Generell Henvendelse',
      anonymous: 'Anonym Henvendelse',
      events: 'Forslag til Arrangement',
      feedback: 'Tilbakemeldinger',
      join: 'Bli med i FAU',
      other: 'Annet'
    };

    const subjectText = subjectMap[params.subject] || params.subject;
    
    let emailContent = `Ny henvendelse fra FAU Erdal Barnehage kontaktskjema\n\n`;
    emailContent += `Emne: ${subjectText}\n\n`;
    
    if (params.isAnonymous) {
      emailContent += `ANONYM HENVENDELSE - Ingen kontaktinformasjon tilgjengelig\n\n`;
    } else {
      emailContent += `Kontaktinformasjon:\n`;
      emailContent += `Navn: ${params.name}\n`;
      emailContent += `E-post: ${params.email}\n`;
      if (params.phone) {
        emailContent += `Telefon: ${params.phone}\n`;
      }
      emailContent += `\n`;
    }
    
    emailContent += `Melding:\n${params.message}\n\n`;
    emailContent += `---\nSendt fra FAU Erdal Barnehage nettside`;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: FAU_EMAIL,
      subject: `FAU Kontakt: ${subjectText}`,
      text: emailContent,
      replyTo: params.isAnonymous ? undefined : params.email,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { email_type: 'contact' },
      extra: { subject: params.subject, isAnonymous: params.isAnonymous }
    });
    return false;
  }
}

const emailTemplates = {
  no: {
    greeting: (name: string) => `Hei ${name}`,
    thankYou: (eventTitle: string) => `Takk for at du har meldt deg på ${eventTitle}!`,
    date: 'Dato:',
    time: 'Tid:',
    location: 'Sted:',
    cancellation: 'Dersom du plutselig ikke har anledning til å delta allikevel håper vi at du sender oss ett svar på denne eposten hvor du gir beskjed om at du ikke kan komme allikevel.',
    signature: 'Mvh\nFAU Erdal Barnehage',
    subject: (eventTitle: string) => `Påmeldingsbekreftelse: ${eventTitle}`
  },
  en: {
    greeting: (name: string) => `Hi ${name}`,
    thankYou: (eventTitle: string) => `Thank you for registering for ${eventTitle}!`,
    date: 'Date:',
    time: 'Time:',
    location: 'Location:',
    cancellation: 'If you suddenly cannot attend, please reply to this email to let us know that you cannot come after all.',
    signature: 'Best regards\nFAU Erdal Barnehage',
    subject: (eventTitle: string) => `Registration confirmation: ${eventTitle}`
  }
};

export async function sendEventConfirmationEmail(params: EventConfirmationParams): Promise<boolean> {
  const transporter = createEmailTransporter();
  if (!transporter) return false;

  try {

    const { registration, event, language = 'no' } = params;
    const template = emailTemplates[language];
    
    // Format event date and time
    const locale = language === 'no' ? 'no-NO' : 'en-US';
    const eventDate = new Date(event.date).toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    let emailContent = `${template.greeting(registration.name)}\n\n`;
    emailContent += `${template.thankYou(event.title)}\n\n`;
    
    // Event info
    emailContent += `${event.title}\n`;
    emailContent += `${template.date} ${eventDate}\n`;
    emailContent += `${template.time} ${event.time}\n`;
    if (event.location) {
      const locationText = formatLocationForEmail(event.location, event.customLocation);
      emailContent += `${template.location} ${locationText}\n`;
    }
    if (event.description) {
      emailContent += `\n${event.description}\n`;
    }
    emailContent += `\n`;
    
    emailContent += `${template.cancellation}\n\n`;
    emailContent += template.signature;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: registration.email,
      subject: template.subject(event.title),
      text: emailContent,
      replyTo: FAU_EMAIL,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { email_type: 'event_confirmation' },
      extra: { eventId: event.id, eventTitle: event.title }
    });
    return false;
  }
}

export async function sendEventCancellationEmail(params: EventCancellationParams): Promise<boolean> {
  const transporter = createEmailTransporter();
  if (!transporter) return false;

  try {

    const { registration, event, language = 'no' } = params;
    const template = emailTemplates[language];

    const eventDate = new Date(event.date).toLocaleDateString(language === 'no' ? 'no-NO' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const subject = language === 'no' 
      ? `AVLYST: ${event.title}`
      : `CANCELLED: ${event.title}`;

    let emailContent = `${template.greeting(registration.name)}!\n\n`;
    
    if (language === 'no') {
      emailContent += `Vi må dessverre informere deg om at følgende arrangement er avlyst:\n\n`;
    } else {
      emailContent += `We regret to inform you that the following event has been cancelled:\n\n`;
    }
    
    emailContent += `${event.title}\n`;
    emailContent += `${template.date} ${eventDate}\n`;
    emailContent += `${template.time} ${event.time}\n`;

    const locationText = formatLocationForEmail(event.location, event.customLocation);
    emailContent += `${template.location} ${locationText}\n\n`;
    
    if (language === 'no') {
      emailContent += `Vi beklager eventuelle ulemper dette måtte medføre.\n\n`;
      emailContent += `For spørsmål, vennligst kontakt oss på ${FAU_EMAIL}\n\n`;
    } else {
      emailContent += `We apologize for any inconvenience this may cause.\n\n`;
      emailContent += `For questions, please contact us at ${FAU_EMAIL}\n\n`;
    }
    
    emailContent += template.signature;

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: registration.email,
      subject,
      text: emailContent,
      replyTo: FAU_EMAIL,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { email_type: 'event_cancellation' },
      extra: { eventId: event.id, eventTitle: event.title }
    });
    return false;
  }
}

export async function sendEventReminderEmail(params: EventReminderParams): Promise<boolean> {
  const transporter = createEmailTransporter();
  if (!transporter) return false;

  try {

    const { registration, event, language = 'no' } = params;
    
    const eventDate = new Date(event.date).toLocaleDateString(language === 'no' ? 'no-NO' : 'en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const subject = language === 'no' 
      ? `Påminnelse: ${event.title} i morgen`
      : `Reminder: ${event.title} tomorrow`;

    let emailContent = '';
    
    if (language === 'no') {
      emailContent += `Hei ${registration.name},\n\n`;
      emailContent += `Dette er en påminnelse om at du er påmeldt til følgende arrangement i morgen:\n\n`;
      emailContent += `Arrangement: ${event.title}\n`;
      emailContent += `Dato: ${eventDate}\n`;
      emailContent += `Tid: ${event.time}\n`;

      const locationText = formatLocationForEmail(event.location, event.customLocation);
      emailContent += `Sted: ${locationText}\n\n`;
      emailContent += `Vi gleder oss til å se deg!\n\n`;
      emailContent += `Hvis du ikke kan delta, vennligst gi oss beskjed så snart som mulig.\n\n`;
      emailContent += `Med vennlig hilsen,\nFAU Erdal Barnehage\n${FAU_EMAIL}`;
    } else {
      emailContent += `Hello ${registration.name},\n\n`;
      emailContent += `This is a reminder that you are registered for the following event tomorrow:\n\n`;
      emailContent += `Event: ${event.title}\n`;
      emailContent += `Date: ${eventDate}\n`;
      emailContent += `Time: ${event.time}\n`;

      const locationText = formatLocationForEmail(event.location, event.customLocation);
      emailContent += `Location: ${locationText}\n\n`;
      emailContent += `We look forward to seeing you!\n\n`;
      emailContent += `If you cannot attend, please let us know as soon as possible.\n\n`;
      emailContent += `Best regards,\nFAU Erdal Kindergarten\n${FAU_EMAIL}`;
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: registration.email,
      subject,
      text: emailContent,
      replyTo: FAU_EMAIL,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { email_type: 'event_reminder' },
      extra: { eventId: event.id, eventTitle: event.title }
    });
    return false;
  }
}