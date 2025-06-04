export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const envVars = Object.keys(process.env).filter(key => 
    key.includes('DATABASE') || 
    key.includes('POSTGRES') || 
    key.includes('NEON') ||
    key.includes('CLOUDINARY')
  );

  res.json({
    available_env_vars: envVars,
    postgres_url_exists: !!process.env.POSTGRES_URL,
    database_url_exists: !!process.env.DATABASE_URL,
    cloudinary_configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
  });
}