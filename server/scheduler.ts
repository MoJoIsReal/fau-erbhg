import { storage } from './storage';
import { sendEventReminderEmail } from './email';
import * as Sentry from '@sentry/node';

class ReminderScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private sentReminders = new Set<string>();

  start() {
    // Check every hour for events that need reminders
    this.intervalId = setInterval(() => {
      this.checkForReminders();
    }, 60 * 60 * 1000); // 1 hour

    // Also check immediately when starting
    this.checkForReminders();
    Sentry.addBreadcrumb({
      category: 'scheduler',
      message: 'Event reminder scheduler started',
      level: 'info'
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      Sentry.addBreadcrumb({
        category: 'scheduler',
        message: 'Event reminder scheduler stopped',
        level: 'info'
      });
    }
  }

  private async checkForReminders() {
    try {
      const events = await storage.getAllEvents();
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      for (const event of events) {
        // Skip cancelled events
        if (event.status === 'cancelled') continue;

        const eventDateTime = new Date(`${event.date}T${event.time}`);
        
        // Check if event is approximately 24 hours away (within 1 hour window)
        const timeDiff = eventDateTime.getTime() - now.getTime();
        const hoursUntilEvent = timeDiff / (1000 * 60 * 60);

        // Send reminder if event is between 23-25 hours away and we haven't sent it yet
        if (hoursUntilEvent >= 23 && hoursUntilEvent <= 25) {
          const reminderKey = `${event.id}-${event.date}`;
          
          if (!this.sentReminders.has(reminderKey)) {
            await this.sendRemindersForEvent(event);
            this.sentReminders.add(reminderKey);
          }
        }

        // Clean up old reminder keys (older than 3 days)
        if (timeDiff < -3 * 24 * 60 * 60 * 1000) {
          const oldReminderKey = `${event.id}-${event.date}`;
          this.sentReminders.delete(oldReminderKey);
        }
      }
    } catch (error) {
      Sentry.captureException(error, {
        tags: { scheduler: 'reminder_check' },
        extra: { context: 'Checking for event reminders' }
      });
    }
  }

  private async sendRemindersForEvent(event: any) {
    try {
      const registrations = await storage.getEventRegistrations(event.id);
      
      for (const registration of registrations) {
        // Determine language based on registration or default to Norwegian
        const language = registration.language || 'no';
        
        await sendEventReminderEmail({
          registration,
          event,
          language: language as 'no' | 'en'
        });
        
        // Add small delay between emails to avoid overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 1000));
      }


      Sentry.addBreadcrumb({
        category: 'scheduler',
        message: `Sent reminder emails for event: ${event.title}`,
        level: 'info',
        data: { recipientCount: registrations.length }
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { scheduler: 'send_reminders' },
        extra: { eventTitle: event.title, eventId: event.id }
      });
    }
  }
}

export const reminderScheduler = new ReminderScheduler();