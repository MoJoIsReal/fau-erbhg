import { getDb } from '../_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
} from '../_shared/middleware.js';

function isAuthorizedCron(req) {
  if (!process.env.CRON_SECRET) {
    return process.env.NODE_ENV !== 'production';
  }
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = getDb();
    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

    const oldContactMessages = await sql`
      SELECT COUNT(*)::int AS count
      FROM contact_messages
      WHERE created_at::timestamptz < NOW() - INTERVAL '12 months'
    `;

    const oldRegistrations = await sql`
      SELECT COUNT(*)::int AS count
      FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      WHERE e.date::date < CURRENT_DATE - INTERVAL '6 months'
    `;

    if (dryRun) {
      return res.status(200).json({
        success: true,
        dryRun: true,
        contactMessages: oldContactMessages[0]?.count || 0,
        eventRegistrations: oldRegistrations[0]?.count || 0,
      });
    }

    const deletedContactMessages = await sql`
      DELETE FROM contact_messages
      WHERE created_at::timestamptz < NOW() - INTERVAL '12 months'
      RETURNING id
    `;

    const deletedRegistrations = await sql`
      DELETE FROM event_registrations r
      USING events e
      WHERE e.id = r.event_id
        AND e.date::date < CURRENT_DATE - INTERVAL '6 months'
      RETURNING r.id
    `;

    return res.status(200).json({
      success: true,
      contactMessagesDeleted: deletedContactMessages.length,
      eventRegistrationsDeleted: deletedRegistrations.length,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
