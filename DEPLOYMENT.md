# Secure Deployment Guide - FAU Erdal Barnehage

## Pre-Deployment Security Checklist

### 1. Rotate Exposed Credentials
- **CRITICAL**: Change Neon database password immediately
- Update DATABASE_URL in Vercel environment variables
- Generate new SESSION_SECRET
- Verify no sensitive data in Git history

### 2. Required Environment Variables

Configure these in your Vercel dashboard under Settings → Environment Variables:

```
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/dbname
SESSION_SECRET=your_secure_random_32_character_string
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxx
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_cloudinary_secret
ADMIN_SETUP_KEY=your_secure_admin_setup_key
NODE_ENV=production
```

### 3. Service Setup Required

#### Neon PostgreSQL
1. Create new database on neon.tech
2. Copy connection string to DATABASE_URL
3. Database will auto-initialize on first API call

#### SendGrid Email
1. Create account at sendgrid.com
2. Generate API key with Mail Send permissions
3. Verify sender email: fauerdalbarnehage@gmail.com
4. Add API key to SENDGRID_API_KEY

#### Cloudinary File Storage
1. Create account at cloudinary.com
2. Copy cloud name, API key, and secret
3. Configure upload settings for documents/images

## Deployment Steps

### 1. Prepare Repository
```bash
# Ensure no sensitive data in current files
git status
git add .
git commit -m "Secure rebuild with environment variables"
```

### 2. Deploy to Vercel
1. Connect repository to Vercel
2. Add all environment variables
3. Deploy from main branch
4. Test deployment with /api/secure-status

### 3. Initialize Database
```bash
curl -X POST https://your-app.vercel.app/api/init-secure-db
```

### 4. Create Admin User
```bash
curl -X POST https://your-app.vercel.app/api/secure-auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "username": "admin",
    "password": "your_secure_password",
    "name": "Administrator",
    "setupKey": "your_admin_setup_key"
  }'
```

## API Endpoints

- `GET /api/secure-status` - Health check
- `POST /api/init-secure-db` - Initialize database
- `POST /api/secure-auth` - Authentication
- `GET/POST /api/secure-events` - Event management
- `GET/POST /api/secure-registrations` - Event registrations
- `GET/POST /api/secure-documents` - Document management
- `POST /api/secure-contact` - Contact forms
- `POST /api/secure-upload` - File uploads
- `POST /api/secure-email` - Email notifications

## Security Features

- All credentials stored in environment variables
- No hardcoded secrets in source code
- CORS properly configured
- Input validation on all endpoints
- Secure password hashing
- JWT token-based authentication
- Protected admin endpoints

## Email Integration

Contact forms automatically send notifications to: **fauerdalbarnehage@gmail.com**

Event registrations send confirmation emails to participants in Norwegian/English.

## Monitoring

Check deployment health:
```bash
curl https://your-app.vercel.app/api/secure-status
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "message": "FAU Erdal Barnehage API - Secure Version",
  "version": "2.0.0",
  "environment": {
    "database_configured": true,
    "session_configured": true,
    "node_version": "v20.x.x"
  }
}
```