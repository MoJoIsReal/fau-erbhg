export default async function handler(req, res) {
  try {
    // Simple test to see if serverless function works at all
    res.json({
      success: true,
      message: 'Serverless function is working',
      env_vars_available: Object.keys(process.env).filter(key => 
        key.includes('DATABASE') || 
        key.includes('POSTGRES') || 
        key.includes('NEON') ||
        key.includes('SESSION')
      )
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}