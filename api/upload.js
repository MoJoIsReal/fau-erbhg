import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Use environment variable for database connection
    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    // For now, return a mock response since file upload requires additional setup
    const mockDocument = {
      id: Date.now(),
      title: req.body.title || 'Test Document',
      category: req.body.category || 'other',
      file_url: 'https://example.com/mock-file.pdf',
      uploaded_at: new Date().toISOString()
    };

    // Insert into database (mock for now)
    await sql`
      INSERT INTO documents (title, category, file_url, uploaded_at)
      VALUES (${mockDocument.title}, ${mockDocument.category}, ${mockDocument.file_url}, ${mockDocument.uploaded_at})
    `;

    return res.status(200).json({
      message: 'Dokument lastet opp',
      document: mockDocument
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ message: 'Feil ved opplasting av dokument' });
  }
}