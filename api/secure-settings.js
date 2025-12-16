import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  requireAuth
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

    if (!name || !role) {
      return res.status(400).json({ error: 'Name and role are required' });
    }

    const result = await sql`
      INSERT INTO fau_board_members (name, role, sort_order, created_at, updated_at)
      VALUES (${name}, ${role}, ${sortOrder || 0}, ${now}, ${now})
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

    const result = await sql`
      UPDATE fau_board_members
      SET name = ${name},
          role = ${role},
          sort_order = ${sortOrder || 0},
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
        SELECT id, title, content, status, published_date as "publishedDate", author, created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"
        FROM blog_posts
        ORDER BY published_date DESC
      `;
    } else {
      // Public view - only show published posts
      posts = await sql`
        SELECT id, title, content, published_date as "publishedDate", author
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

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const pubDate = publishedDate || now;

    const result = await sql`
      INSERT INTO blog_posts (title, content, status, published_date, author, created_by, created_at, updated_at)
      VALUES (${title}, ${content}, 'published', ${pubDate}, ${author || null}, ${user.username}, ${now}, ${now})
      RETURNING *
    `;

    return res.status(201).json(result[0]);
  }

  // PUT - Update existing blog post
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { title, content, status, publishedDate, author } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    const result = await sql`
      UPDATE blog_posts
      SET title = ${title},
          content = ${content},
          status = ${status || 'published'},
          published_date = ${publishedDate || now},
          author = ${author || null},
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

    // Default: handle site settings (can be extended in future)
    return res.status(400).json({ error: 'Invalid resource' });

  } catch (error) {
    return handleError(res, error);
  }
}
