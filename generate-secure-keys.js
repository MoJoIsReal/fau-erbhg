import crypto from 'crypto';

// Generate cryptographically secure keys for deployment
function generateSecureKeys() {
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const adminSetupKey = crypto.randomBytes(16).toString('hex');
  
  console.log('=== SECURE CREDENTIALS FOR VERCEL DEPLOYMENT ===\n');
  
  console.log('SESSION_SECRET:');
  console.log(sessionSecret);
  console.log('');
  
  console.log('ADMIN_SETUP_KEY:');
  console.log(adminSetupKey);
  console.log('');
  
  console.log('=== COPY THESE TO VERCEL ENVIRONMENT VARIABLES ===');
  console.log('');
  console.log('IMPORTANT:');
  console.log('1. Rotate your Neon database password first');
  console.log('2. Generate new Gmail app password');
  console.log('3. Create new Cloudinary API keys');
  console.log('4. Use these secure keys above');
}

generateSecureKeys();