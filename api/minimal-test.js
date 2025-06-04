export default async function handler(req, res) {
  return res.json({ 
    status: 'working',
    timestamp: new Date().toISOString()
  });
}