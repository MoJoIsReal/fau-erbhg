# FAU Erdal Barnehage

Official website for FAU Erdal Barnehage (Parent Council for Erdal Kindergarten).

## Features

- Responsive Norwegian/English website
- Event management and registration
- Document sharing system
- Contact form functionality
- Admin authentication
- Database integration with Neon PostgreSQL
- Email notifications via Nodemailer
- File uploads with Cloudinary

## Deployment

This application is configured for deployment on Vercel with serverless functions.

### Environment Variables Required

- `DATABASE_URL` - Neon PostgreSQL connection string
- `EMAIL_USER` - Email username for notifications
- `EMAIL_PASS` - Email password
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `ADMIN_EMAIL` - Administrator email
- `ADMIN_PASSWORD` - Administrator password
- `ADMIN_NAME` - Administrator display name

### Local Development

```bash
npm install
npm run dev
```

### Database Setup

After deployment, initialize the database by calling:
```
POST /api/init-db
```

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js serverless functions
- Database: PostgreSQL (Neon)
- Hosting: Vercel
- Email: Nodemailer
- File Storage: Cloudinary

## Contact

Email: fauerdalbarnehage@gmail.com