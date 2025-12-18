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

  // Require authentication - only admins can run migrations
  const user = parseAuthToken(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const sql = getDb();

    // Add missing columns to event_registrations table
    await sql`
      DO $$
      BEGIN
        -- Add attendee_count column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'event_registrations' AND column_name = 'attendee_count'
        ) THEN
          ALTER TABLE event_registrations ADD COLUMN attendee_count integer DEFAULT 1 NOT NULL;

          -- Populate attendee_count from existing num_adults + num_children
          UPDATE event_registrations
          SET attendee_count = COALESCE(num_adults, 1) + COALESCE(num_children, 0);
        END IF;

        -- Add language column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'event_registrations' AND column_name = 'language'
        ) THEN
          ALTER TABLE event_registrations ADD COLUMN language text DEFAULT 'no';
        END IF;

        -- Add registered_at column if it doesn't exist
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'event_registrations' AND column_name = 'registered_at'
        ) THEN
          ALTER TABLE event_registrations ADD COLUMN registered_at timestamp DEFAULT now() NOT NULL;
        END IF;
      END $$;
    `;

    return res.status(200).json({
      success: true,
      message: 'Database migration completed successfully',
      details: 'Added attendee_count, language, and registered_at columns to event_registrations table'
    });

  } catch (error) {
    return handleError(res, error);
  }
}
