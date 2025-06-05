# FAU Erdal Barnehage - Secure Web Application

A modern, secure web platform for FAU Erdal Barnehage with proper environment variable management and Vercel deployment optimization.

## Features
- Event management system
- Document upload and management
- Contact forms
- User authentication
- Multilingual support (Norwegian/English)
- Responsive design

## Security Architecture
- All sensitive data stored in environment variables
- No hardcoded credentials in source code
- Secure database connections
- JWT-based authentication
- CORS properly configured

## Environment Variables Required

Create these in your Vercel dashboard:

```
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_secure_random_string
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
ADMIN_SETUP_KEY=your_secure_setup_key
```

## Deployment
1. Configure environment variables in Vercel
2. Deploy from Git
3. Run database initialization
4. Create admin user securely

## Tech Stack
- Frontend: React + TypeScript + Tailwind CSS
- Backend: Serverless functions
- Database: PostgreSQL (Neon)
- File Storage: Cloudinary
- Deployment: Vercel