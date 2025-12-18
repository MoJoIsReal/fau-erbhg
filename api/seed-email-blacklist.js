import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken
} from './_shared/middleware.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication - only admins can seed the blacklist
  const user = parseAuthToken(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const sql = getDb();

    // Create table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS email_domain_blacklist (
        id serial PRIMARY KEY NOT NULL,
        domain text NOT NULL UNIQUE,
        category text NOT NULL,
        action text NOT NULL,
        suggested_fix text,
        description text,
        created_at timestamp DEFAULT now() NOT NULL
      )
    `;

    // Category A - RFC-Reserved / Guaranteed Invalid
    const categoryA = [
      { domain: 'example.com', description: 'RFC-reserved' },
      { domain: 'example.net', description: 'RFC-reserved' },
      { domain: 'example.org', description: 'RFC-reserved' },
      { domain: 'test', description: 'RFC-reserved' },
      { domain: 'test.com', description: 'RFC-reserved' },
      { domain: 'test.net', description: 'RFC-reserved' },
      { domain: 'test.org', description: 'RFC-reserved' },
      { domain: 'invalid', description: 'RFC-reserved' },
      { domain: 'invalid.com', description: 'RFC-reserved' },
      { domain: 'invalid.net', description: 'RFC-reserved' },
      { domain: 'invalid.org', description: 'RFC-reserved' },
      { domain: 'localhost', description: 'RFC-reserved' },
      { domain: 'localhost.localdomain', description: 'RFC-reserved' }
    ];

    // Category B - Placeholder / Dummy Domains (Common in Norway)
    const categoryB = [
      { domain: 'fake.no', description: 'Placeholder' },
      { domain: 'fake.com', description: 'Placeholder' },
      { domain: 'test.no', description: 'Placeholder' },
      { domain: 'testing.no', description: 'Placeholder' },
      { domain: 'demo.no', description: 'Placeholder' },
      { domain: 'dummy.no', description: 'Placeholder' },
      { domain: 'sample.no', description: 'Placeholder' },
      { domain: 'domain.no', description: 'Placeholder' },
      { domain: 'mittdomene.no', description: 'Placeholder' },
      { domain: 'dittdomene.no', description: 'Placeholder' },
      { domain: 'firma.no', description: 'Placeholder' },
      { domain: 'selskap.no', description: 'Placeholder' },
      { domain: 'bedrift.no', description: 'Placeholder' },
      { domain: 'navn.no', description: 'Placeholder' },
      { domain: 'epost.no', description: 'Placeholder' },
      { domain: 'mail.no', description: 'Placeholder' },
      { domain: 'email.no', description: 'Placeholder' },
      { domain: 'noreply.no', description: 'Placeholder' },
      { domain: 'no-reply.no', description: 'Placeholder' },
      { domain: 'donotreply.no', description: 'Placeholder' },
      { domain: 'do-not-reply.no', description: 'Placeholder' }
    ];

    // Category C - "Looks Real but Almost Always Fake"
    const categoryC = [
      { domain: 'nei.no', description: 'Common fake' },
      { domain: 'nei.com', description: 'Common fake' },
      { domain: 'abc.no', description: 'Common fake' },
      { domain: 'xyz.no', description: 'Common fake' },
      { domain: 'asdf.no', description: 'Common fake' },
      { domain: 'qwerty.no', description: 'Common fake' },
      { domain: 'foo.no', description: 'Common fake' },
      { domain: 'bar.no', description: 'Common fake' },
      { domain: 'internet.no', description: 'Common fake' },
      { domain: 'web.no', description: 'Common fake' },
      { domain: 'online.no', description: 'Common fake' },
      { domain: 'epost.com', description: 'Common fake' },
      { domain: 'email.com', description: 'Common fake' },
      { domain: 'domain.com', description: 'Common fake' },
      { domain: 'company.com', description: 'Common fake' },
      { domain: 'business.com', description: 'Common fake' }
    ];

    // Category D - Internal / Non-Deliverable Domains
    const categoryD = [
      { domain: 'local', description: 'Invalid internal' },
      { domain: 'localdomain', description: 'Invalid internal' },
      { domain: 'internal', description: 'Invalid internal' },
      { domain: 'intranet', description: 'Invalid internal' },
      { domain: 'corp', description: 'Invalid internal' },
      { domain: 'lan', description: 'Invalid internal' }
    ];

    // Category F - Provider Typos (Norway-specific)
    const categoryF = [
      { domain: 'gmail.no', description: 'Provider typo', suggestedFix: 'gmail.com' },
      { domain: 'outlook.no', description: 'Provider typo', suggestedFix: 'outlook.com' },
      { domain: 'hotmail.no', description: 'Provider typo', suggestedFix: 'hotmail.com' },
      { domain: 'icloud.no', description: 'Provider typo', suggestedFix: 'icloud.com' },
      { domain: 'yahoo.no', description: 'Provider typo', suggestedFix: 'yahoo.com' },
      { domain: 'live.no', description: 'Provider typo', suggestedFix: 'live.com' }
    ];

    let inserted = 0;
    let skipped = 0;

    // Insert Category A, B, C, D (hard block)
    for (const item of [...categoryA, ...categoryB, ...categoryC, ...categoryD]) {
      try {
        await sql`
          INSERT INTO email_domain_blacklist (domain, category, action, description)
          VALUES (
            ${item.domain},
            ${item.domain.includes('example') || item.domain.includes('test') || item.domain === 'invalid' || item.domain === 'localhost' ? 'A' :
               item.description === 'Placeholder' ? 'B' :
               item.description === 'Common fake' ? 'C' : 'D'},
            'block',
            ${item.description}
          )
          ON CONFLICT (domain) DO NOTHING
        `;
        inserted++;
      } catch (e) {
        skipped++;
      }
    }

    // Insert Category F (suggest correction)
    for (const item of categoryF) {
      try {
        await sql`
          INSERT INTO email_domain_blacklist (domain, category, action, suggested_fix, description)
          VALUES (
            ${item.domain},
            'F',
            'suggest',
            ${item.suggestedFix},
            ${item.description}
          )
          ON CONFLICT (domain) DO NOTHING
        `;
        inserted++;
      } catch (e) {
        skipped++;
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Email domain blacklist seeded successfully',
      details: {
        inserted,
        skipped,
        total: categoryA.length + categoryB.length + categoryC.length + categoryD.length + categoryF.length,
        categories: {
          A: categoryA.length,
          B: categoryB.length,
          C: categoryC.length,
          D: categoryD.length,
          F: categoryF.length
        }
      }
    });

  } catch (error) {
    return handleError(res, error);
  }
}
