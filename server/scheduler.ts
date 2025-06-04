import { storage } from './storage';
import { sendEventReminderEmail } from './email';

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
    console.log('Event reminder scheduler started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Event reminder scheduler stopped');
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
      console.error('Error checking for event reminders:', error);
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
      
      console.log(`Sent reminder emails for event: ${event.title} (${registrations.length} recipients)`);
    } catch (error) {
      console.error(`Error sending reminders for event ${event.title}:`, error);
    }
  }
}

export const reminderScheduler = new ReminderScheduler();