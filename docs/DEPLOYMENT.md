# Deployment Guide - FAU Erdal Barnehage

This document provides comprehensive instructions for deploying and managing the FAU Erdal Barnehage application on Vercel.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Deployment](#initial-deployment)
3. [Environment Variables](#environment-variables)
4. [Database Setup](#database-setup)
5. [Post-Deployment](#post-deployment)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

Before deploying, ensure you have:

- A Vercel account (https://vercel.com)
- A Neon PostgreSQL database (https://neon.tech)
- Cloudinary account for file storage (https://cloudinary.com)
- Email service credentials (Gmail or SendGrid)
- Git repository access

## Initial Deployment

### 1. Connect Repository to Vercel

1. Log into your Vercel account
2. Click "Add New Project"
3. Import your Git repository
4. Vercel will auto-detect the framework settings

### 2. Configure Build Settings

Vercel should automatically use settings from `vercel.json`, but verify:

- **Framework Preset:** Other
- **Build Command:** `npm run build`
- **Output Directory:** `dist/public`
- **Install Command:** `npm install`
- **Node Version:** 20.x (recommended)

### 3. Configure Root Directory

- **Root Directory:** `.` (root of repository)

---

## Environment Variables

### Required Variables

Add these environment variables in Vercel Dashboard → Project Settings → Environment Variables:

#### Database
```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```
- Get this from your Neon PostgreSQL dashboard
- Ensure it includes SSL mode for security

#### Security
```
SESSION_SECRET=<generate-a-secure-random-string-min-32-chars>
ADMIN_SETUP_KEY=<secure-admin-key-for-initialization>
```
- Generate `SESSION_SECRET` using: `openssl rand -base64 32`
- Keep `ADMIN_SETUP_KEY` secure - only use once for admin creation

#### Cloudinary
```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```
- Get these from Cloudinary dashboard

#### Email (Optional)
```
GMAIL_APP_PASSWORD=your-gmail-app-password
```
Or for SendGrid:
```
SENDGRID_API_KEY=your-sendgrid-api-key
```

#### Application Settings
```
NODE_ENV=production
```

### Environment Variable Scopes

Set all variables for:
- ✅ Production
- ✅ Preview
- ✅ Development (if using Vercel CLI locally)

---

## Database Setup

### 1. Create Neon Database

1. Go to https://neon.tech
2. Create a new project
3. Create a database named `fau_erbhg` (or your preferred name)
4. Copy the connection string

### 2. Run Migrations

After first deployment, run migrations:

```bash
# Install dependencies locally
npm install

# Set your DATABASE_URL in .env
echo "DATABASE_URL=your_connection_string" > .env

# Push schema to database
npm run db:push
```

### 3. Initialize Admin User

After migrations, create an admin user:

```bash
# Make a POST request to initialize admin
curl -X POST https://your-app.vercel.app/api/secure-auth/init-admin \
  -H "Content-Type: application/json" \
  -d '{
    "setupKey": "your-ADMIN_SETUP_KEY",
    "username": "admin",
    "password": "secure-password",
    "name": "Admin User"
  }'
```

**Important:** Change the admin password immediately after first login!

### 4. Database Indexes (Recommended)

For better performance, add these indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date, time);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

---

## Post-Deployment

### 1. Verify Deployment

After deployment completes:

#### Check Health Endpoint
```bash
curl https://your-app.vercel.app/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "environment": "production",
  "checks": {
    "database": "ok",
    "env_vars": "ok"
  }
}
```

#### Check Frontend
- Navigate to `https://your-app.vercel.app`
- Verify the homepage loads
- Test navigation to all pages

#### Test API Endpoints
```bash
# Get events
curl https://your-app.vercel.app/api/events

# Get documents
curl https://your-app.vercel.app/api/documents
```

### 2. Configure Custom Domain (Optional)

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions
4. Update allowed origins in API functions if using custom domain

### 3. Enable Vercel Analytics

Analytics are automatically enabled via the `@vercel/analytics` package in the frontend.

View analytics at: Vercel Dashboard → Your Project → Analytics

---

## Monitoring

### Health Checks

Set up monitoring for your health endpoint:

- **Endpoint:** `https://your-app.vercel.app/api/health`
- **Frequency:** Every 5 minutes
- **Expected Status:** 200
- **Alert on:** Status ≠ 200 or response time > 5s

Recommended services:
- UptimeRobot (free tier available)
- Better Uptime
- Vercel built-in monitoring

### Logs

View logs in Vercel Dashboard:
1. Go to Your Project → Deployments
2. Click on a deployment
3. View "Functions" tab for serverless function logs
4. Check "Build Logs" for deployment issues

### Error Tracking

Consider adding error tracking:

**Option 1: Sentry**
```bash
npm install @sentry/react @sentry/node
```

**Option 2: LogRocket**
```bash
npm install logrocket
```

### Performance Monitoring

Monitor in Vercel Dashboard:
- Function execution times
- Cold start durations
- Bandwidth usage
- Build times

---

## Troubleshooting

### Common Issues

#### 1. "Database configuration missing"

**Cause:** `DATABASE_URL` environment variable not set

**Fix:**
1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Add `DATABASE_URL` with your Neon connection string
3. Redeploy the project

#### 2. Build Failures

**Cause:** TypeScript errors or missing dependencies

**Fix:**
```bash
# Run locally to identify issues
npm run check
npm run build
```

Fix any TypeScript errors before pushing.

**Common Error: "vite: command not found"**

**Cause:** Custom `installCommand` in `vercel.json` interfering with Vercel's dependency installation

**Symptoms:**
```
sh: line 1: vite: command not found
Error: Command "npm run build" exited with 127
```

**Fix:**
Remove any custom `installCommand` from `vercel.json`. Vercel's default installation process properly handles devDependencies needed during the build phase. The `vercel.json` should NOT include:
```json
"installCommand": "npm install"  // ❌ Remove this line
```

Vercel will automatically install all dependencies including devDependencies when needed for the build.

#### 3. CORS Errors

**Cause:** Frontend domain not in allowed origins

**Fix:** Update allowed origins in API functions or `api/_shared/middleware.js`:
```javascript
const allowedOrigins = [
  'https://fau-erdal-barnehage.vercel.app',
  'https://your-custom-domain.com'
];
```

#### 4. Cold Start Delays

**Symptom:** First request to API is slow (~2-3 seconds)

**Explanation:** Serverless functions have cold starts. This is normal.

**Mitigation:**
- Upgrade to Vercel Pro for faster cold starts
- Implement keep-alive pings
- Database connection caching (already implemented)

#### 5. File Upload Failures

**Causes:**
- Invalid Cloudinary credentials
- File size exceeds limit (5MB default)
- Invalid file type

**Fix:**
1. Verify Cloudinary credentials in environment variables
2. Check file size and type restrictions in upload code
3. View Cloudinary dashboard for upload logs

### Debug Mode

To enable detailed logging:

1. Add environment variable:
   ```
   DEBUG=true
   ```
2. Check function logs in Vercel Dashboard

---

## Rollback Procedures

### Quick Rollback (Recommended)

If a deployment introduces issues:

1. Go to Vercel Dashboard → Your Project → Deployments
2. Find the last working deployment
3. Click "..." menu → "Promote to Production"
4. Confirm the rollback

**Recovery time:** ~30 seconds

### Git-Based Rollback

If you need to revert code changes:

```bash
# Find the last working commit
git log --oneline

# Create a revert commit
git revert <commit-hash>

# Push to trigger redeployment
git push origin main
```

### Database Rollback

**⚠️ Warning:** Database changes are harder to rollback!

**Prevention:**
- Always backup before major schema changes
- Use migrations instead of direct schema changes
- Test in staging environment first

**Emergency Rollback:**
```bash
# Restore from Neon backup
# 1. Go to Neon Dashboard → Your Project → Backups
# 2. Select a backup point
# 3. Restore to a new branch
# 4. Update DATABASE_URL to point to restored branch
```

---

## Deployment Checklist

Use this checklist for each deployment:

### Pre-Deployment
- [ ] All tests pass locally
- [ ] TypeScript compiles without errors (`npm run check`)
- [ ] Build succeeds locally (`npm run build`)
- [ ] Environment variables are set in Vercel
- [ ] Database migrations are ready (if applicable)

### During Deployment
- [ ] Monitor build logs for errors
- [ ] Check deployment preview before promoting
- [ ] Test all critical features in preview

### Post-Deployment
- [ ] Health check returns 200
- [ ] Frontend loads correctly
- [ ] API endpoints respond
- [ ] Authentication works
- [ ] File uploads work
- [ ] Email notifications work (if applicable)
- [ ] Check error logs for any new issues

### Rollback Plan
- [ ] Know which deployment to rollback to
- [ ] Have database backup if schema changed
- [ ] Team is notified of deployment

---

## Best Practices

### 1. Use Preview Deployments

Every branch and PR gets a preview deployment:
- Test features before merging
- Share with stakeholders for feedback
- Catch issues before production

### 2. Gradual Rollouts

For major changes:
1. Deploy to preview first
2. Test thoroughly
3. Deploy to production during low-traffic hours
4. Monitor closely for first 15 minutes

### 3. Database Migrations

For schema changes:
```bash
# 1. Create migration
npm run db:push

# 2. Test locally first
# 3. Backup production database
# 4. Run migration in production
```

### 4. Environment Parity

Keep environments consistent:
- Development
- Preview (Vercel)
- Production (Vercel)

### 5. Monitoring

Set up alerts for:
- Health check failures
- High error rates
- Slow response times
- Failed deployments

---

## Support

For issues or questions:

1. Check Vercel documentation: https://vercel.com/docs
2. Check Neon documentation: https://neon.tech/docs
3. Review application logs in Vercel Dashboard
4. Contact your development team

---

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Neon PostgreSQL Documentation](https://neon.tech/docs)
- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Drizzle ORM Documentation](https://orm.drizzle.team)

---

**Last Updated:** 2024-12-09
