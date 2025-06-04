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
    // Use direct connection string from Neon
    const connectionString = "postgres://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
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