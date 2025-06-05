import { neon } from '@neondatabase/serverless';
import sgMail from '@sendgrid/mail';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate environment variables
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const sql = neon(process.env.DATABASE_URL);

    const { type, data } = req.body;

    if (type === 'contact') {
      const { name, email, phone, subject, message, isAnonymous } = data;

      // Store contact message
      await sql`
        INSERT INTO contact_messages (name, email, phone, subject, message, is_anonymous)
        VALUES (${name || 'Anonymous'}, ${email || ''}, ${phone || ''}, ${subject}, ${message}, ${isAnonymous || false})
      `;

      // Send email notification
      const emailContent = {
        to: 'fauerdalbarnehage@gmail.com',
        from: 'fauerdalbarnehage@gmail.com',
        subject: `Contact Form: ${subject}`,
        html: `
          <h2>New Contact Message</h2>
          <p><strong>From:</strong> ${isAnonymous ? 'Anonymous' : `${name} (${email})`}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><em>Sent from FAU Erdal Barnehage website contact form</em></p>
        `
      };

      await sgMail.send(emailContent);

      return res.status(200).json({
        success: true,
        message: 'Contact message sent successfully'
      });
    }

    if (type === 'event_confirmation') {
      const { registration, event, language = 'no' } = data;

      const isNorwegian = language === 'no';
      const subject = isNorwegian 
        ? `Påmelding bekreftet: ${event.title}`
        : `Registration confirmed: ${event.title}`;

      const emailContent = {
        to: registration.email,
        from: 'fauerdalbarnehage@gmail.com',
        subject,
        html: isNorwegian ? `
          <h2>Påmelding bekreftet!</h2>
          <p>Hei ${registration.name},</p>
          <p>Din påmelding til følgende arrangement er bekreftet:</p>
          
          <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>${event.title}</h3>
            <p><strong>Dato:</strong> ${event.date}</p>
            <p><strong>Tid:</strong> ${event.time}</p>
            <p><strong>Sted:</strong> ${event.location}${event.custom_location ? ` - ${event.custom_location}` : ''}</p>
            ${event.description ? `<p><strong>Beskrivelse:</strong> ${event.description}</p>` : ''}
          </div>
          
          <p>Vi gleder oss til å se deg!</p>
          <p>Hvis du har spørsmål, kan du kontakte oss på fauerdalbarnehage@gmail.com</p>
          
          <hr>
          <p><em>FAU Erdal Barnehage</em></p>
        ` : `
          <h2>Registration Confirmed!</h2>
          <p>Hello ${registration.name},</p>
          <p>Your registration for the following event has been confirmed:</p>
          
          <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px;">
            <h3>${event.title}</h3>
            <p><strong>Date:</strong> ${event.date}</p>
            <p><strong>Time:</strong> ${event.time}</p>
            <p><strong>Location:</strong> ${event.location}${event.custom_location ? ` - ${event.custom_location}` : ''}</p>
            ${event.description ? `<p><strong>Description:</strong> ${event.description}</p>` : ''}
          </div>
          
          <p>We look forward to seeing you!</p>
          <p>If you have any questions, please contact us at fauerdalbarnehage@gmail.com</p>
          
          <hr>
          <p><em>FAU Erdal Barnehage</em></p>
        `
      };

      await sgMail.send(emailContent);

      return res.status(200).json({
        success: true,
        message: 'Confirmation email sent'
      });
    }

    return res.status(400).json({ error: 'Invalid email type' });

  } catch (error) {
    console.error('Email service error:', error);
    return res.status(500).json({ 
      error: 'Email sending failed',
      details: error.message 
    });
  }
}