import { storage } from '../../../server/storage.js';
import { insertEventRegistrationSchema } from '../../../shared/schema.js';
import { sendEventConfirmationEmail } from '../../../server/email.js';

export default async function handler(req, res) {
  const { id } = req.query;
  const eventId = parseInt(id);

  try {
    if (req.method === 'GET') {
      const registrations = await storage.getEventRegistrations(eventId);
      return res.status(200).json(registrations);
    }
    
    if (req.method === 'POST') {
      const validatedData = insertEventRegistrationSchema.parse({
        ...req.body,
        eventId
      });
      
      const registration = await storage.createEventRegistration(validatedData);
      const event = await storage.getEvent(eventId);
      
      // Send confirmation email
      if (event) {
        await sendEventConfirmationEmail({
          registration,
          event,
          language: req.body.language || 'no'
        });
      }
      
      return res.status(201).json(registration);
    }
    
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Event registrations API error:', error);
    return res.status(500).json({ message: 'Intern serverfeil' });
  }
}