import nodemailer from 'nodemailer';

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
    // Check for Gmail app password
    if (!process.env.GMAIL_APP_PASSWORD) {
      return res.status(500).json({ 
        error: 'Gmail configuration missing',
        setup_instructions: 'Create Gmail app password in Google Account settings'
      });
    }

    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: 'fauerdalbarnehage@gmail.com',
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const { type, data } = req.body;

    if (type === 'contact') {
      const { name, email, phone, subject, message, isAnonymous } = data;

      const mailOptions = {
        from: 'fauerdalbarnehage@gmail.com',
        to: 'fauerdalbarnehage@gmail.com',
        subject: `Contact Form: ${subject}`,
        html: `
          <h2>New Contact Message</h2>
          <p><strong>From:</strong> ${isAnonymous ? 'Anonymous' : `${name} (${email})`}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <p><em>Sent from FAU Erdal Barnehage website</em></p>
        `
      };

      await transporter.sendMail(mailOptions);

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

      const mailOptions = {
        from: 'fauerdalbarnehage@gmail.com',
        to: registration.email,
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

      await transporter.sendMail(mailOptions);

      return res.status(200).json({
        success: true,
        message: 'Confirmation email sent'
      });
    }

    return res.status(400).json({ error: 'Invalid email type' });

  } catch (error) {
    console.error('Gmail email error:', error);
    return res.status(500).json({ 
      error: 'Email sending failed',
      details: error.message 
    });
  }
}