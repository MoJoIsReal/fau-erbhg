import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      // Get all contact messages (admin only)
      const messages = await sql`
        SELECT id, name, email, phone, subject, message, is_anonymous, created_at
        FROM contact_messages 
        ORDER BY created_at DESC
      `;

      return res.status(200).json(messages);
    }

    if (req.method === 'POST') {
      const { name, email, phone, subject, message, isAnonymous = false } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
      }

      if (!isAnonymous && (!name || !email)) {
        return res.status(400).json({ error: 'Name and email are required for non-anonymous messages' });
      }

      // Send email notification
      try {
        const emailResponse = await fetch(`${req.headers.origin || 'http://localhost:5000'}/api/secure-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'contact',
            data: {
              name,
              email,
              phone,
              subject,
              message,
              isAnonymous
            }
          })
        });
        
        if (!emailResponse.ok) {
          console.warn('Failed to send notification email');
        }
      } catch (emailError) {
        console.warn('Email service unavailable:', emailError.message);
      }

      return res.status(201).json({
        success: true,
        message: 'Message sent successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Contact API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}