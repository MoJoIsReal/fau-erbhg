import bcrypt from 'bcryptjs';
import { getDb } from './_shared/database.js';
import { sendEmail, isEmailConfigured } from './_shared/email.js';
import { publicBaseUrl } from './_shared/newsletter.js';
import { CONTACT_REPLY_MAX_LENGTH, contactReplyEmail } from './_shared/contact-emails.js';
import { reportProviderError } from './_shared/provider-errors.js';
import { generateTemporaryPassword } from './_shared/password-policy.js';
import {
  withApiHandler,
  requireCsrf,
  requireIntId,
  requireRole,
  sanitizeText,
  sanitizeHtml,
  sanitizeEmail,
  sanitizeNumber
} from './_shared/middleware.js';
import { ADMIN_ONLY, COUNCIL_ROLES, ROLES } from '../shared/constants.js';

// The DB is snake_case and the API contract is camelCase; AGENTS.md makes one
// map*(row) per resource the single definition of the wire shape. This handler
// had none, so its write paths returned raw `RETURNING *` rows. Five callers
// discard the body and never noticed; content.tsx feeds it straight into render
// state, where publishedDate/showOnHomepage/notifyNewsletter/newsletterSentAt
// all read undefined — and the next archive or homepage toggle sends that back,
// where `published_date = ${publishedDate || now}` silently reset the post's
// publish date to today.
function mapBlogPost(row) {
  if (!row) return row;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    status: row.status,
    category: row.category,
    publishedDate: row.published_date,
    author: row.author,
    showOnHomepage: row.show_on_homepage ?? false,
    notifyNewsletter: row.notify_newsletter ?? false,
    newsletterSentAt: row.newsletter_sent_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBoardMember(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapKindergartenInfo(row) {
  if (!row) return row;
  return {
    id: row.id,
    contactEmail: row.contact_email,
    address: row.address,
    openingHours: row.opening_hours,
    numberOfChildren: row.number_of_children,
    owner: row.owner,
    description: row.description,
    styrerName: row.styrer_name,
    styrerEmail: row.styrer_email,
    updatedAt: row.updated_at,
  };
}

function mapContactMessage(row) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    respondedBy: row.responded_by,
    responseMessage: row.response_message,
  };
}

function roleLabel(role) {
  if (role === ROLES.member) return 'FAU-Medlem';
  if (role === ROLES.staff) return 'Barnehageansatt';
  return role;
}

function roleDescription(role) {
  if (role === ROLES.member) {
    return 'Som FAU-Medlem kan du administrere innhold, meldinger, arrangementer, dokumenter og årskalenderen. Du har ikke tilgang til innstillinger eller brukeradministrasjon.';
  }
  if (role === ROLES.staff) {
    return 'Som Barnehageansatt kan du laste ned Excel-mal til årskalenderen, importere årskalender fra Excel og legge til eller redigere oppføringer manuelt i årskalenderen. Du har ikke tilgang til meldinger, innstillinger, arrangement-administrasjon eller innholdsredigering.';
  }
  return '';
}

// Handle FAU Board Members operations
async function handleBoardMembers(req, res, sql) {
  // GET - Public access to view board members
  if (req.method === 'GET') {
    // Rows that share a sort order — everything added before the settings
    // page could reorder the board — fall back to the roles' own hierarchy
    // rather than to insertion order, which had a Medlem listed under two
    // Vara simply because they joined later. An order set by dragging wins:
    // sort_order is compared first.
    const members = await sql`
      SELECT id, name, role, sort_order as "sortOrder"
      FROM fau_board_members
      ORDER BY sort_order ASC,
               CASE role
                 WHEN 'Leder' THEN 0
                 WHEN 'Medlem' THEN 1
                 WHEN 'Vara' THEN 2
                 ELSE 3
               END ASC,
               id ASC
    `;
    return res.status(200).json(members);
  }

  // All other methods require admin authentication
  const user = await requireRole(req, res, ADMIN_ONLY, sql);
  if (!user) return;

  // CSRF protection for state-changing requests
  if (!requireCsrf(req, res)) return;

  const now = new Date().toISOString();

  // POST - Create new board member
  if (req.method === 'POST') {
    const { name, role, sortOrder } = req.body;

    const sanitizedName = sanitizeText(name, 100);
    const sanitizedRole = sanitizeText(role, 100);
    const sanitizedSortOrder = sanitizeNumber(sortOrder, 0, 1000) || 0;

    if (!sanitizedName || !sanitizedRole) {
      return res.status(400).json({ error: 'Valid name and role are required' });
    }

    const result = await sql`
      INSERT INTO fau_board_members (name, role, sort_order, created_at, updated_at)
      VALUES (${sanitizedName}, ${sanitizedRole}, ${sanitizedSortOrder}, ${now}, ${now})
      RETURNING *
    `;

    return res.status(201).json(mapBoardMember(result[0]));
  }

  // PUT - Update existing board member
  if (req.method === 'PUT') {
    const id = requireIntId(req, res);
    if (!id) return;
    const { name, role, sortOrder } = req.body;

    const sanitizedName = sanitizeText(name, 100);
    const sanitizedRole = sanitizeText(role, 100);
    const sanitizedSortOrder = sanitizeNumber(sortOrder, 0, 1000) || 0;

    if (!sanitizedName || !sanitizedRole) {
      return res.status(400).json({ error: 'Valid name and role are required' });
    }

    const result = await sql`
      UPDATE fau_board_members
      SET name = ${sanitizedName},
          role = ${sanitizedRole},
          sort_order = ${sanitizedSortOrder},
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Board member not found' });
    }

    return res.status(200).json(mapBoardMember(result[0]));
  }

  // DELETE - Remove board member
  if (req.method === 'DELETE') {
    const id = requireIntId(req, res);
    if (!id) return;

    // RETURNING + a row check: this used to answer 200 "deleted successfully"
    // whether or not anything matched, so the UI showed a success toast for a
    // deletion that never happened.
    const deleted = await sql`
      DELETE FROM fau_board_members
      WHERE id = ${id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Board member not found' });
    }

    return res.status(200).json({ message: 'Board member deleted successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle Blog Posts operations
async function handleBlogPosts(req, res, sql) {
  // GET - Public access to view published blog posts
  if (req.method === 'GET') {
    const { includeArchived, category } = req.query;
    const sanitizedCategory = ['news', 'tips'].includes(category) ? category : null;
    // limit/offset are opt-in: omitting them keeps today's behavior (up to
    // 500 posts in one page) so callers like the homepage, which need the
    // full set to filter by showOnHomepage client-side, are unaffected.
    // Callers that do "load more" pagination (the public news page) pass
    // both explicitly.
    const limit = sanitizeNumber(req.query.limit, 1, 100) ?? 500;
    const offset = sanitizeNumber(req.query.offset, 0, Number.MAX_SAFE_INTEGER) ?? 0;
    // A single-post read, so a permalink does not have to download the whole
    // archive to render one article. Folded into this resource rather than a
    // new route: the Vercel Hobby plan caps the project at 12 functions.
    const postId = req.query.id != null ? sanitizeNumber(req.query.id, 1) : null;
    if (req.query.id != null && !postId) {
      return res.status(400).json({ error: 'Valid id query parameter required' });
    }

    let posts;
    if (includeArchived === 'true') {
      const adminUser = await requireRole(req, res, COUNCIL_ROLES, sql);
      if (!adminUser) return;

      // Admin view - show all posts
      posts = await sql`
        SELECT id, title, content, status, category, published_date as "publishedDate", author, show_on_homepage as "showOnHomepage", notify_newsletter as "notifyNewsletter", newsletter_sent_at as "newsletterSentAt", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
        FROM blog_posts
        WHERE (${sanitizedCategory}::text IS NULL OR category = ${sanitizedCategory})
        ORDER BY published_date DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      // Public view - only show published posts
      posts = await sql`
        SELECT id, title, content, category, published_date as "publishedDate", author, show_on_homepage as "showOnHomepage"
        FROM blog_posts
        WHERE status = 'published'
          AND (${postId}::int IS NULL OR id = ${postId})
          AND (${sanitizedCategory}::text IS NULL OR category = ${sanitizedCategory})
        ORDER BY published_date DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return res.status(200).json(posts);
  }

  // All other methods require a council member.
  const user = await requireRole(req, res, COUNCIL_ROLES, sql);
  if (!user) return;

  // CSRF protection for state-changing requests
  if (!requireCsrf(req, res)) return;

  const now = new Date().toISOString();

  // POST - Create new blog post
  if (req.method === 'POST') {
    const { title, content, publishedDate, author, category, notifyNewsletter } = req.body;

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedContent = sanitizeHtml(content, 50000);
    const sanitizedAuthor = author ? sanitizeText(author, 100) : null;
    const sanitizedCategory = ['news', 'tips'].includes(category) ? category : 'news';

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: 'Valid title and content are required' });
    }

    const pubDate = publishedDate || now;

    const result = await sql`
      INSERT INTO blog_posts (title, content, status, category, published_date, author, notify_newsletter, created_by, created_at, updated_at)
      VALUES (${sanitizedTitle}, ${sanitizedContent}, 'published', ${sanitizedCategory}, ${pubDate}, ${sanitizedAuthor}, ${notifyNewsletter === true}, ${user.username}, ${now}, ${now})
      RETURNING *
    `;

    return res.status(201).json(mapBlogPost(result[0]));
  }

  // PUT - Update existing blog post
  if (req.method === 'PUT') {
    const id = requireIntId(req, res);
    if (!id) return;
    const { title, content, status, publishedDate, author, showOnHomepage, category, notifyNewsletter } = req.body;

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedContent = sanitizeHtml(content, 50000);
    const sanitizedAuthor = author ? sanitizeText(author, 100) : null;
    const sanitizedStatus = ['published', 'archived'].includes(status) ? status : 'published';
    const sanitizedCategory = ['news', 'tips'].includes(category) ? category : 'news';

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: 'Valid title and content are required' });
    }

    const result = await sql`
      UPDATE blog_posts
      SET title = ${sanitizedTitle},
          content = ${sanitizedContent},
          status = ${sanitizedStatus},
          category = ${sanitizedCategory},
          published_date = ${publishedDate || now},
          author = ${sanitizedAuthor},
          show_on_homepage = ${showOnHomepage !== undefined ? showOnHomepage : true},
          notify_newsletter = COALESCE(${notifyNewsletter === undefined ? null : notifyNewsletter === true}::boolean, notify_newsletter),
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    return res.status(200).json(mapBlogPost(result[0]));
  }

  // DELETE - Remove blog post
  if (req.method === 'DELETE') {
    const id = requireIntId(req, res);
    if (!id) return;

    const deleted = await sql`
      DELETE FROM blog_posts
      WHERE id = ${id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    return res.status(200).json({ message: 'Blog post deleted successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle Kindergarten Info operations
async function handleKindergartenInfo(req, res, sql) {
  // GET - Public access to view kindergarten info
  if (req.method === 'GET') {
    const info = await sql`
      SELECT id, contact_email as "contactEmail", address, opening_hours as "openingHours",
             number_of_children as "numberOfChildren", owner, description,
             styrer_name as "styrerName", styrer_email as "styrerEmail", updated_at as "updatedAt"
      FROM kindergarten_info
      ORDER BY id DESC
      LIMIT 1
    `;

    if (info.length === 0) {
      return res.status(404).json({ error: 'Kindergarten info not found' });
    }

    return res.status(200).json(info[0]);
  }

  // All other methods require admin authentication
  const user = await requireRole(req, res, ADMIN_ONLY, sql);
  if (!user) return;

  // CSRF protection for state-changing requests
  if (!requireCsrf(req, res)) return;

  const now = new Date().toISOString();

  // PUT - Update kindergarten info
  if (req.method === 'PUT') {
    const { contactEmail, address, openingHours, numberOfChildren, owner, description, styrerName, styrerEmail } = req.body;

    const sanitizedContactEmail = sanitizeEmail(contactEmail);
    const sanitizedAddress = sanitizeText(address, 200);
    const sanitizedOpeningHours = sanitizeText(openingHours, 200);
    const sanitizedNumberOfChildren = sanitizeNumber(numberOfChildren, 0, 1000);
    const sanitizedOwner = sanitizeText(owner, 200);
    const sanitizedDescription = sanitizeText(description, 2000);
    const sanitizedStyrerName = styrerName ? sanitizeText(styrerName, 100) : null;
    const sanitizedStyrerEmail = styrerEmail ? sanitizeEmail(styrerEmail) : null;

    if (!sanitizedContactEmail || !sanitizedAddress || !sanitizedOpeningHours ||
        sanitizedNumberOfChildren === null || !sanitizedOwner || !sanitizedDescription) {
      return res.status(400).json({ error: 'All required fields must be valid' });
    }

    // Update the first (and only) row
    const result = await sql`
      UPDATE kindergarten_info
      SET contact_email = ${sanitizedContactEmail},
          address = ${sanitizedAddress},
          opening_hours = ${sanitizedOpeningHours},
          number_of_children = ${sanitizedNumberOfChildren},
          owner = ${sanitizedOwner},
          description = ${sanitizedDescription},
          styrer_name = ${sanitizedStyrerName},
          styrer_email = ${sanitizedStyrerEmail},
          updated_at = ${now}
      WHERE id = (SELECT id FROM kindergarten_info ORDER BY id LIMIT 1)
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Kindergarten info not found' });
    }

    return res.status(200).json(mapKindergartenInfo(result[0]));
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle Contact Messages operations
async function handleContactMessages(req, res, sql) {
  // Contact messages carry parent PII and sensitive concerns, so this stays a
  // council surface: FAU members are who the contact form addresses ("Kontakt
  // for foreldrerepresentantene"), and leaving one admin as the only person who
  // could answer meant inquiries waited on a single inbox. Staff stay out.
  const user = await requireRole(req, res, COUNCIL_ROLES, sql);
  if (!user) return;

  const now = new Date().toISOString();

  // GET - Fetch all contact messages
  if (req.method === 'GET') {
    const messages = await sql`
      SELECT id, name, email, phone, subject, message, status,
             created_at as "createdAt", responded_at as "respondedAt",
             responded_by as "respondedBy", response_message as "responseMessage"
      FROM contact_messages
      ORDER BY created_at DESC
    `;

    return res.status(200).json(messages);
  }

  // CSRF protection for state-changing requests
  if (!requireCsrf(req, res)) return;

  // PUT - Update message status
  if (req.method === 'PUT') {
    const id = requireIntId(req, res);
    if (!id) return;
    const { status } = req.body;

    if (!status || !['new', 'responded', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (new, responded, archived)' });
    }

    // Marking as responded stamps who did it; archiving or reopening only
    // moves the message between lists and must not erase a reply that was
    // actually sent.
    const result = status === 'responded'
      ? await sql`
          UPDATE contact_messages
          SET status = ${status},
              responded_at = ${now},
              responded_by = ${user.username}
          WHERE id = ${id}
          RETURNING *
        `
      : await sql`
          UPDATE contact_messages
          SET status = ${status}
          WHERE id = ${id}
          RETURNING *
        `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.status(200).json(mapContactMessage(result[0]));
  }

  // POST - Send an email reply to the person behind the inquiry
  if (req.method === 'POST') {
    const id = sanitizeNumber(req.query.id, 1);
    if (!id) {
      return res.status(400).json({ error: 'Valid id query parameter required' });
    }

    const reply = sanitizeText(req.body?.message, CONTACT_REPLY_MAX_LENGTH);
    if (!reply) {
      return res.status(400).json({ error: 'Reply message is required' });
    }

    const rows = await sql`
      SELECT id, name, email, subject, message, created_at as "createdAt"
      FROM contact_messages
      WHERE id = ${id}
    `;

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const original = rows[0];
    const recipient = sanitizeEmail(original.email);

    // Anonymous inquiries carry no address, so there is nobody to answer.
    if (!recipient) {
      return res.status(400).json({ error: 'This inquiry has no reply address' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({ error: 'Email is not configured' });
    }

    const { subject, text } = contactReplyEmail(original, reply);

    // Only mark the inquiry as answered once Gmail has accepted the message —
    // a silent failure here would leave the parent without a reply while the
    // list claims it was handled.
    try {
      await sendEmail({ to: recipient, subject, text });
    } catch (emailError) {
      reportProviderError('Failed to send contact reply', emailError);
      return res.status(502).json({ error: 'Could not send the reply email' });
    }

    const updated = await sql`
      UPDATE contact_messages
      SET status = 'responded',
          responded_at = ${now},
          responded_by = ${user.username},
          response_message = ${reply}
      WHERE id = ${id}
      RETURNING id, name, email, phone, subject, message, status,
                created_at as "createdAt", responded_at as "respondedAt",
                responded_by as "respondedBy", response_message as "responseMessage"
    `;

    return res.status(200).json(updated[0]);
  }

  // DELETE - Delete a contact message
  if (req.method === 'DELETE') {
    const id = requireIntId(req, res);
    if (!id) return;

    const deleted = await sql`
      DELETE FROM contact_messages
      WHERE id = ${id}
      RETURNING id
    `;

    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.status(200).json({ message: 'Contact message deleted successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle managed users (FAU members and kindergarten staff)
async function handleUsers(req, res, sql) {
  const user = await requireRole(req, res, ADMIN_ONLY, sql);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, username, name, role, created_at as "createdAt"
      FROM users
      WHERE role IN (${ROLES.member}, ${ROLES.staff})
      ORDER BY created_at DESC
    `;
    return res.status(200).json(rows);
  }

  if (!requireCsrf(req, res)) return;

  if (req.method === 'POST') {
    const username = sanitizeEmail(req.body?.username);
    const name = sanitizeText(req.body?.name, 120);
    const role = [ROLES.member, ROLES.staff].includes(req.body?.role) ? req.body.role : null;

    if (!username || !name || !role) {
      return res.status(400).json({ error: 'username, name and role are required' });
    }
    if (!isEmailConfigured()) {
      return res.status(500).json({ error: 'Email is not configured; cannot send login details' });
    }

    const existing = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Brukernavnet er allerede i bruk' });
    }

    const temporaryPassword = generateTemporaryPassword();
    const hashed = await bcrypt.hash(temporaryPassword, 10);
    const now = new Date().toISOString();
    const created = await sql`
      INSERT INTO users (username, password, name, role, must_change_password, password_changed_at, created_at)
      VALUES (${username}, ${hashed}, ${name}, ${role}, true, ${null}, ${now})
      RETURNING id, username, name, role
    `;

    try {
      await sendEmail({
        to: username,
        subject: 'Konto opprettet for FAU Erdal Barnehage',
        text: [
          `Hei ${name},`,
          '',
          `Det er opprettet en konto for deg på FAU Erdal Barnehage sin nettside.`,
          `Nettside: ${publicBaseUrl()}`,
          `Rolle: ${roleLabel(role)}`,
          '',
          roleDescription(role),
          '',
          `Brukernavn: ${username}`,
          `Midlertidig passord: ${temporaryPassword}`,
          '',
          'Du blir bedt om å endre passordet første gang du logger inn. Passord må også oppdateres minst én gang i året.',
          '',
          'Vennlig hilsen',
          'FAU Erdal Barnehage',
        ].join('\n'),
      });
    } catch (error) {
      await sql`DELETE FROM users WHERE id = ${created[0].id}`;
      throw error;
    }

    return res.status(201).json(created[0]);
  }

  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id);
    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'Valid id query parameter required' });
    }
    const deleted = await sql`
      DELETE FROM users WHERE id = ${id} AND role IN (${ROLES.member}, ${ROLES.staff}) RETURNING id
    `;
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle newsletter subscribers (admin view + removal)
async function handleNewsletterSubscribers(req, res, sql) {
  const user = await requireRole(req, res, ADMIN_ONLY, sql);
  if (!user) return;

  if (req.method === 'GET') {
    const subscribers = await sql`
      SELECT id, email, name, language, status,
             created_at as "createdAt", confirmed_at as "confirmedAt", unsubscribed_at as "unsubscribedAt"
      FROM newsletter_subscribers
      ORDER BY created_at DESC
    `;
    return res.status(200).json(subscribers);
  }

  if (!requireCsrf(req, res)) return;

  if (req.method === 'DELETE') {
    const id = parseInt(req.query.id, 10);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ error: 'Valid id query parameter required' });
    }
    const deleted = await sql`
      DELETE FROM newsletter_subscribers WHERE id = ${id} RETURNING id
    `;
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Subscriber not found' });
    }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Main handler
export default withApiHandler(async function handler(req, res) {
  const sql = getDb();
  const { resource } = req.query;

  // Route to board members handler
  if (resource === 'board-members') {
    return await handleBoardMembers(req, res, sql);
  }

  // Route to blog posts handler
  if (resource === 'blog-posts') {
    return await handleBlogPosts(req, res, sql);
  }

  // Route to kindergarten info handler
  if (resource === 'kindergarten-info') {
    return await handleKindergartenInfo(req, res, sql);
  }

  // Route to contact messages handler
  if (resource === 'contact-messages') {
    return await handleContactMessages(req, res, sql);
  }

  // Route to users handler
  if (resource === 'users' || resource === 'staff-users') {
    return await handleUsers(req, res, sql);
  }

  // Route to newsletter subscribers handler
  if (resource === 'newsletter-subscribers') {
    return await handleNewsletterSubscribers(req, res, sql);
  }

  // Default: handle site settings (can be extended in future)
  return res.status(400).json({ error: 'Invalid resource' });
});
