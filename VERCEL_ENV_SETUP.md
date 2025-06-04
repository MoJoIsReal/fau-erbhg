# Vercel Environment Variables Setup

To complete the deployment and enable authentication, add these environment variables in your Vercel project:

## Go to Vercel Dashboard:
1. Visit: https://vercel.com/dashboard
2. Select your "fau-erdal-database" project
3. Go to Settings → Environment Variables

## Add these variables:

**DATABASE_URL**
```
postgresql://neondb_owner:npg_P5nSRsy4FYHq@ep-rapid-moon-a202ppv3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

**SESSION_SECRET**
```
25tt0FNdPJ5tgo9odeP94acLhfiRztD7
```

## After adding the variables:
1. Redeploy the application (Vercel will automatically redeploy)
2. Test authentication at: https://fau-erdalbhg.vercel.app
3. Login with:
   - Username: fauerdalbarnehage@gmail.com
   - Password: admin123

The authentication system will then work properly on the deployed site.