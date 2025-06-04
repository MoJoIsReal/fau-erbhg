# FAU Erdal Barnehage - Digital Platform

A comprehensive digital platform for FAU Erdal Barnehage that enhances parent-school communication through innovative and user-friendly digital tools.

## Features

- **Event Management**: Create, manage and track events with registration system
- **24-Hour Email Reminders**: Automated reminder system for event attendees
- **Multilingual Support**: Full Norwegian/English language support
- **Document Management**: Upload and organize meeting protocols and documents
- **Contact System**: Direct communication with automated email forwarding
- **Calendar Integration**: Export events to Google, Outlook, and Apple calendars
- **Attendee Management**: Excel export functionality for event registrations
- **Responsive Design**: Mobile-friendly interface for all devices

## Technology Stack

- **Frontend**: React with TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **File Storage**: Cloudinary
- **Email**: Gmail integration with Nodemailer
- **Authentication**: Session-based authentication

## Environment Variables

Copy `.env.example` to `.env` and configure the following variables:

```bash
# Database Configuration
DATABASE_URL=your_postgresql_database_url
PGHOST=your_postgres_host
PGPORT=5432
PGDATABASE=your_database_name
PGUSER=your_postgres_user
PGPASSWORD=your_postgres_password

# Email Configuration (Gmail)
GMAIL_USER=your_gmail_address@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password

# File Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Application Configuration
NODE_ENV=production
```

## Installation and Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables (see above)

3. Set up database schema:
   ```bash
   npm run db:push
   ```

4. Start the application:
   ```bash
   npm run dev
   ```

## Deployment on Replit

This application is optimized for Replit Deployments:

1. Connect your Replit to this repository
2. Configure environment variables in Replit Secrets:
   - Database credentials (automatically provided by Replit PostgreSQL)
   - Gmail credentials for email functionality
   - Cloudinary credentials for file storage
3. Deploy using Replit's deployment system

## Admin Access

Admin credentials are configured via environment variables:
- `ADMIN_EMAIL` - Admin username/email
- `ADMIN_PASSWORD` - Admin password

Set these securely in your deployment environment.

## Database Schema

The application uses PostgreSQL with the following main tables:
- `users` - Admin user management
- `events` - Event information and management
- `event_registrations` - Event attendee registrations
- `documents` - File uploads and document management
- `contact_messages` - Contact form submissions
- `sessions` - User session management

## Email Configuration

To enable email functionality:
1. Create a Gmail account or use existing
2. Enable 2-factor authentication
3. Generate an App Password
4. Configure GMAIL_USER and GMAIL_APP_PASSWORD environment variables

## File Storage Configuration

To enable file uploads:
1. Create a Cloudinary account (free tier available)
2. Get your Cloud Name, API Key, and API Secret
3. Configure the Cloudinary environment variables

## Features Overview

### Event Management
- Create and manage events with detailed information
- Track attendee registrations with capacity limits
- Automatic email confirmations and reminders
- Event cancellation with notification system

### Document Management
- Upload meeting protocols and important documents
- Categorize documents (protocols, regulations, budgets)
- Secure file storage with Cloudinary integration

### Communication
- Contact form with automatic email forwarding
- Multilingual email templates
- Automated event reminder system

### Calendar Integration
- Export events to popular calendar applications
- Support for Google Calendar, Outlook, and Apple Calendar
- ICS file generation for calendar imports

## License

This project is developed specifically for FAU Erdal Barnehage.