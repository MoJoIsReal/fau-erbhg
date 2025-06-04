import { storage } from '../../server/storage.js';
import { insertContactMessageSchema } from '../../shared/schema.js';
import { sendContactEmail } from '../../server/email.js';
import { securityHeaders, validateInput, sanitizeInput } from '../middleware/security.js';

export default async function handler(req, res) {
  securityHeaders(res);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Input validation
    const validation = validateInput(req.body, ['name', 'email', 'subject', 'message']);
    if (!validation.valid) {
      return res.status(400).json({ message: `${validation.field} er påkrevd` });
    }

    // Sanitize inputs
    const sanitizedData = {
      ...req.body,
      name: sanitizeInput(req.body.name),
      email: sanitizeInput(req.body.email),
      subject: sanitizeInput(req.body.subject),
      message: sanitizeInput(req.body.message),
      phone: req.body.phone ? sanitizeInput(req.body.phone) : null
    };

    const validatedData = insertContactMessageSchema.parse(sanitizedData);
    
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