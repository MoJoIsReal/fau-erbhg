# Vercel Deployment Guide - FAU Erdal Barnehage

## Step 1: Push Code to GitHub
Execute these commands in your terminal:
```bash
rm -f .git/config.lock .git/index.lock
git add .
git commit -m "Complete FAU Erdal Barnehage platform - production ready"
git push origin main
```

## Step 2: Deploy to Vercel

### 2.1 Connect Repository
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click "New Project"
4. Import `MoJoIsReal/fau-erbhg` repository
5. Click "Deploy"

### 2.2 Configure Environment Variables
In Vercel dashboard → Settings → Environment Variables, add:

#### Database (Neon PostgreSQL)
```
DATABASE_URL=postgresql://username:password@host/database?sslmode=require
```

#### Authentication
```
SESSION_SECRET=your-secure-random-string-minimum-32-characters
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password
```

#### Email (Gmail)
```
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-specific-password
```

#### File Upload (Cloudinary)
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

#### Environment
```
NODE_ENV=production
```

## Step 3: Database Setup (Neon)

### 3.1 Create Neon Database
1. Go to [neon.tech](https://neon.tech)
2. Create new project
3. Select EU Central region (closest to Norway)
4. Copy connection string

### 3.2 Get Gmail App Password
1. Google Account → Security → 2-Step Verification
2. App passwords → Generate new password
3. Use generated password in GMAIL_APP_PASSWORD

### 3.3 Setup Cloudinary
1. Go to [cloudinary.com](https://cloudinary.com)
2. Create account or sign in
3. Dashboard → Account Details
4. Copy Cloud Name, API Key, API Secret

## Step 4: Deploy and Test

1. **Redeploy** after adding environment variables
2. **Test features:**
   - Event creation and registration
   - Document upload
   - Contact form submissions
   - Admin authentication

## Step 5: Domain Setup (Optional)

1. Vercel → Project → Settings → Domains
2. Add custom domain
3. Configure DNS records

## Troubleshooting

### Common Issues:
- **Database connection fails**: Check DATABASE_URL format
- **Email not sending**: Verify Gmail app password
- **File uploads fail**: Check Cloudinary credentials
- **Session issues**: Ensure SESSION_SECRET is set

### Logs:
- View deployment logs in Vercel dashboard
- Function logs available in Functions tab

## Security Notes
- All credentials are stored securely in Vercel environment variables
- Database uses SSL connections
- Sessions are encrypted with secure cookies
- File uploads are validated and size-limited

Your platform will be available at: `https://your-project-name.vercel.app`