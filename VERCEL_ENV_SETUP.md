# Vercel Environment Variables Setup

## Required Environment Variables

Copy these exact variable names and values into your Vercel dashboard:

### Database Configuration
```
DATABASE_URL
```
Value: `postgresql://neondb_owner:npg_oPhyftK9l5DR@ep-sweet-truth-a5u52k4c.us-east-2.aws.neon.tech/neondb?sslmode=require`

### Email Configuration
```
GMAIL_APP_PASSWORD
```
Value: `nmsvzkyuivvstlki`

### File Upload Configuration
```
CLOUDINARY_CLOUD_NAME
```
Value: `dphthnvcl`

```
CLOUDINARY_API_KEY
```
Value: `921956512463694`

```
CLOUDINARY_API_SECRET
```
Value: `-86LwxQoGCUmPFi_NlMGHZNW0k0`

### Security Configuration
```
SESSION_SECRET
```
Value: `secure-session-key-for-fau-barnehage-2024`

```
ADMIN_SETUP_KEY
```
Value: `fau-admin-setup-2024-secure`

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