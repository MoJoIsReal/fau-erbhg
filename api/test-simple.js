export default async function handler(req, res) {
  try {
    // Basic response test
    return res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL ? 'vercel' : 'local'
    });
  } catch (error) {
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}