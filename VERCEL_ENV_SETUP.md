# Vercel Environment Variables Setup

## Required Environment Variables

Copy these exact variable names and values into your Vercel dashboard:

### Database Configuration
```
DATABASE_URL
```
Value: `[Get from Neon dashboard - rotate password first]`

### Email Configuration
```
GMAIL_APP_PASSWORD
```
Value: `[16-character Gmail app password]`

### File Upload Configuration
```
CLOUDINARY_CLOUD_NAME
```
Value: `[Your Cloudinary cloud name]`

```
CLOUDINARY_API_KEY
```
Value: `[Your Cloudinary API key]`

```
CLOUDINARY_API_SECRET
```
Value: `[Your Cloudinary API secret]`

### Security Configuration
```
SESSION_SECRET
```
Value: `[Generate 32-character random string]`

```
ADMIN_SETUP_KEY
```
Value: `[Generate secure random key]`

```
NODE_ENV
```
Value: `production`

## How to Add to Vercel

1. Go to your Vercel project dashboard
2. Click Settings → Environment Variables
3. Add each variable above with its exact name and value
4. Deploy your application
5. Test with: `https://your-app.vercel.app/api/secure-status`

## Security Note

These credentials are already exposed in Git history and need to be rotated after deployment. For production use:

1. Change the Neon database password
2. Generate new Cloudinary API keys
3. Create new session secrets
4. Update environment variables in Vercel

## Initial Setup Commands

After deployment, run these to initialize:

```bash
# Initialize database
curl -X POST https://your-app.vercel.app/api/init-secure-db

# Create admin user
curl -X POST https://your-app.vercel.app/api/secure-auth \
  -H "Content-Type: application/json" \
  -d '{
    "action": "register",
    "username": "admin",
    "password": "YourSecurePassword123!",
    "name": "Administrator",
    "setupKey": "fau-admin-setup-2024-secure"
  }'
```