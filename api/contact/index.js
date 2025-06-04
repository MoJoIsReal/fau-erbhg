import { storage } from '../../server/storage.js';
import { insertContactMessageSchema } from '../../shared/schema.js';
import { sendContactEmail } from '../../server/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const validatedData = insertContactMessageSchema.parse(req.body);
    
    // Save to database
    const message = await storage.createContactMessage(validatedData);
    
    // Send email notification
    await sendContactEmail({
      name: validatedData.name,
      email: validatedData.email,
      phone: validatedData.phone || '',
      subject: validatedData.subject,
      message: validatedData.message,
      isAnonymous: validatedData.isAnonymous || false
    });
    
    res.status(201).json({ 
      message: 'Melding sendt vellykket',
      id: message.id 
    });
  } catch (error) {
    console.error('Contact API error:', error);
    res.status(500).json({ message: 'Intern serverfeil' });
  }
}