import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  requireAuth,
  sanitizeText,
  sanitizeHtml,
  sanitizeEmail,
  sanitizeNumber
} from './_shared/middleware.js';

// Handle FAU Board Members operations
async function handleBoardMembers(req, res, sql) {
  // GET - Public access to view board members
  if (req.method === 'GET') {
    const members = await sql`
      SELECT id, name, role, sort_order as "sortOrder"
      FROM fau_board_members
      ORDER BY sort_order ASC, id ASC
    `;
    return res.status(200).json(members);
  }

  // All other methods require admin authentication
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

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

    return res.status(201).json(result[0]);
  }

  // PUT - Update existing board member
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { name, role, sortOrder } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

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

    return res.status(200).json(result[0]);
  }

  // DELETE - Remove board member
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    await sql`
      DELETE FROM fau_board_members
      WHERE id = ${id}
    `;

    return res.status(200).json({ message: 'Board member deleted successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle Blog Posts operations
async function handleBlogPosts(req, res, sql) {
  // GET - Public access to view published blog posts
  if (req.method === 'GET') {
    const { includeArchived } = req.query;

    let posts;
    if (includeArchived === 'true') {
      // Admin view - show all posts
      posts = await sql`
        SELECT id, title, content, status, published_date as "publishedDate", author, show_on_homepage as "showOnHomepage", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
        FROM blog_posts
        ORDER BY published_date DESC
      `;
    } else {
      // Public view - only show published posts
      posts = await sql`
        SELECT id, title, content, published_date as "publishedDate", author, show_on_homepage as "showOnHomepage"
        FROM blog_posts
        WHERE status = 'published'
        ORDER BY published_date DESC
      `;
    }

    return res.status(200).json(posts);
  }

  // All other methods require admin authentication
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const now = new Date().toISOString();

  // POST - Create new blog post
  if (req.method === 'POST') {
    const { title, content, publishedDate, author } = req.body;

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedContent = sanitizeHtml(content, 50000);
    const sanitizedAuthor = author ? sanitizeText(author, 100) : null;

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: 'Valid title and content are required' });
    }

    const pubDate = publishedDate || now;

    const result = await sql`
      INSERT INTO blog_posts (title, content, status, published_date, author, created_by, created_at, updated_at)
      VALUES (${sanitizedTitle}, ${sanitizedContent}, 'published', ${pubDate}, ${sanitizedAuthor}, ${user.username}, ${now}, ${now})
      RETURNING *
    `;

    return res.status(201).json(result[0]);
  }

  // PUT - Update existing blog post
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { title, content, status, publishedDate, author, showOnHomepage } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    const sanitizedTitle = sanitizeText(title, 200);
    const sanitizedContent = sanitizeHtml(content, 50000);
    const sanitizedAuthor = author ? sanitizeText(author, 100) : null;
    const sanitizedStatus = ['published', 'archived'].includes(status) ? status : 'published';

    if (!sanitizedTitle || !sanitizedContent) {
      return res.status(400).json({ error: 'Valid title and content are required' });
    }

    const result = await sql`
      UPDATE blog_posts
      SET title = ${sanitizedTitle},
          content = ${sanitizedContent},
          status = ${sanitizedStatus},
          published_date = ${publishedDate || now},
          author = ${sanitizedAuthor},
          show_on_homepage = ${showOnHomepage !== undefined ? showOnHomepage : true},
          updated_at = ${now}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    return res.status(200).json(result[0]);
  }

  // DELETE - Remove blog post
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    await sql`
      DELETE FROM blog_posts
      WHERE id = ${id}
    `;

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
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

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

    return res.status(200).json(result[0]);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Handle Contact Messages operations
async function handleContactMessages(req, res, sql) {
  // All methods require admin authentication
  const user = requireAuth(req, res);
  if (!user) return;

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const now = new Date().toISOString();

  // GET - Fetch all contact messages
  if (req.method === 'GET') {
    const messages = await sql`
      SELECT id, name, email, phone, subject, message, status,
             created_at as "createdAt", responded_at as "respondedAt", responded_by as "respondedBy"
      FROM contact_messages
      ORDER BY created_at DESC
    `;

    return res.status(200).json(messages);
  }

  // PUT - Update message status
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    if (!status || !['new', 'responded', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (new, responded, archived)' });
    }

    const result = await sql`
      UPDATE contact_messages
      SET status = ${status},
          responded_at = ${status === 'responded' ? now : null},
          responded_by = ${status === 'responded' ? user.username : null}
      WHERE id = ${id}
      RETURNING *
    `;

    if (result.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.status(200).json(result[0]);
  }

  // DELETE - Delete a contact message
  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    await sql`
      DELETE FROM contact_messages
      WHERE id = ${id}
    `;

    return res.status(200).json({ message: 'Contact message deleted successfully' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Main handler
export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
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

    // Default: handle site settings (can be extended in future)
    return res.status(400).json({ error: 'Invalid resource' });

  } catch (error) {
    return handleError(res, error);
  }
}
