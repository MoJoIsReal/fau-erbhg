import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Security headers
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://fau-erdal-barnehage.vercel.app']
    : ['http://localhost:5000', 'http://localhost:3000'];
  
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Authentication check
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Ikke innlogget" });
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const boardMembers = await sql`
        SELECT id, name, role, email, phone, description, 
               display_order as "displayOrder", is_active as "isActive"
        FROM board_members 
        ORDER BY display_order ASC, id ASC
      `;
      return res.status(200).json(boardMembers);
    }

    if (req.method === 'POST') {
      const { name, role, email, phone, description, displayOrder } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: 'Name and role are required' });
      }

      const newMember = await sql`
        INSERT INTO board_members (name, role, email, phone, description, display_order)
        VALUES (${name}, ${role}, ${email || null}, ${phone || null}, ${description || null}, ${displayOrder || 0})
        RETURNING id, name, role, email, phone, description, 
                  display_order as "displayOrder", is_active as "isActive"
      `;

      return res.status(201).json(newMember[0]);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      const { name, role, email, phone, description, displayOrder, isActive } = req.body;

      if (!name || !role) {
        return res.status(400).json({ error: 'Name and role are required' });
      }

      const updatedMember = await sql`
        UPDATE board_members 
        SET name = ${name},
            role = ${role},
            email = ${email || null},
            phone = ${phone || null},
            description = ${description || null},
            display_order = ${displayOrder || 0},
            is_active = ${isActive !== undefined ? isActive : true}
        WHERE id = ${id}
        RETURNING id, name, role, email, phone, description, 
                  display_order as "displayOrder", is_active as "isActive"
      `;

      if (updatedMember.length === 0) {
        return res.status(404).json({ error: 'Board member not found' });
      }

      return res.status(200).json(updatedMember[0]);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;

      const deletedMember = await sql`
        DELETE FROM board_members 
        WHERE id = ${id}
        RETURNING id
      `;

      if (deletedMember.length === 0) {
        return res.status(404).json({ error: 'Board member not found' });
      }

      return res.status(200).json({ message: 'Board member deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Board members API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}