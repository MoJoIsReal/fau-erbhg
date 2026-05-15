# FAU Erdal Barnehage - Digital Platform

A comprehensive digital platform for FAU Erdal Barnehage that enhances parent-school communication through robust and scalable digital infrastructure.

## Features

- **Event Management**: Create, manage, and register for kindergarten events
- **Document Management**: Secure file uploads with Cloudinary integration
- **Contact System**: Anonymous and identified contact forms with email notifications
- **Multilingual Support**: Norwegian and English language support
- **Authentication**: Secure user authentication for council members
- **Responsive Design**: Works on all devices

## Technology Stack

- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Backend**: Vercel serverless functions + Neon PostgreSQL
- **Database**: Neon PostgreSQL with Drizzle ORM
- **File Storage**: Cloudinary
- **Deployment**: Vercel

## Quick Start for Vercel Deployment

### 1. Environment Variables

Set these environment variables in your Vercel dashboard:

```
DATABASE_URL=your_neon_database_url
SESSION_SECRET=your_secure_session_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
NODE_ENV=production
```

### 2. Deploy to Vercel

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add the environment variables
4. Deploy

The `vercel.json` configuration is already set up for optimal deployment.

## Security Features

- Session-based authentication with secure cookies
- CSRF protection with SameSite cookies
- File upload validation and size limits
- SQL injection protection with parameterized queries
- XSS protection headers
- Secure password hashing with bcrypt

## Development

```bash
npm install
npm run dev
```

Local development runs the Vite frontend. API routes are implemented in `api/*.js`
and run as Vercel serverless functions in production.

## Database Management

The database schema is managed through `shared/schema.ts` and Drizzle.

## File Upload Limits

- Maximum file size: 10 MB (`MAX_UPLOAD_SIZE_BYTES` in `api/_shared/upload-validation.js`)
- Supported formats: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), plain text (.txt), and images (.jpg, .jpeg, .png, .gif, .webp)
- Files are securely stored in Cloudinary via a signed upload flow that verifies the resulting URL belongs to our `CLOUDINARY_CLOUD_NAME`.

## Support

For technical issues or questions, contact the development team.
