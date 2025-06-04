import { storage } from '../../server/storage.js';
import { insertDocumentSchema } from '../../shared/schema.js';

function getSessionFromCookie(req) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  
  const sessionCookie = cookies.split(';').find(c => c.trim().startsWith('session='));
  if (!sessionCookie) return null;
  
  try {
    return JSON.parse(decodeURIComponent(sessionCookie.split('=')[1]));
  } catch {
    return null;
  }
}

function requireAuth(req) {
  const session = getSessionFromCookie(req);
  return session && session.userId;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { category } = req.query;
      let documents;
      
      if (category) {
        documents = await storage.getDocumentsByCategory(category);
      } else {
        documents = await storage.getAllDocuments();
      }
      
      return res.status(200).json(documents);
    }
    
    if (req.method === 'POST') {
      if (!requireAuth(req)) {
        return res.status(401).json({ message: 'Ikke autorisert' });
      }
      
      const validatedData = insertDocumentSchema.parse(req.body);
      const document = await storage.createDocument(validatedData);
      return res.status(201).json(document);
    }
    
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    console.error('Documents API error:', error);
    return res.status(500).json({ message: 'Intern serverfeil' });
  }
}