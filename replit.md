# FAU Erdal Barnehage - Digital Platform

## Overview

This is a comprehensive digital platform for FAU Erdal Barnehage (a Norwegian kindergarten parent association) that facilitates parent-school communication. The platform provides event management, document sharing, contact forms, and administrative tools for council members. It's built with a React frontend and Vercel serverless functions backed by Neon PostgreSQL.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript for type safety
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management
- Tailwind CSS with shadcn/ui component library for styling
- Vite as the build tool and development server

**Design Patterns:**
- Component-based architecture with reusable UI components
- Custom hooks pattern for authentication (`useAuth`) and internationalization (`useLanguage`)
- Context API for global state (language preferences, authentication)
- Form management with React Hook Form and Zod validation
- Responsive design with mobile-first approach

**Key Features:**
- Bilingual support (Norwegian/English) with persistent language preferences
- Cookie-based JWT authentication for Vercel API functions
- Real-time data synchronization with optimistic updates
- File upload with drag-and-drop support
- Calendar views with ICS export and multi-platform calendar integration

### Backend Architecture

**Technology Stack:**
- Vercel serverless functions in `api/*.js`
- Drizzle ORM with Neon Postgres for database operations
- JWT for authentication tokens
- Bcrypt for password hashing
- Nodemailer for email notifications

**API Design:**
- RESTful API endpoints organized by resource type
- Serverless functions for production API routes
- Shared serverless helpers for security, CSRF protection, auth and input sanitization
- Cookie-based JWT authentication with Authorization header fallback
- File uploads handled by the Vercel upload function and Cloudinary

**Key Design Decisions:**
- **Serverless Architecture**: API routes live in `/api/*.js` and are deployed as Vercel functions
- **Email System**: Dual support for Gmail (Nodemailer) and SendGrid for transactional emails
- **Security Layers**: Multiple security mechanisms including rate limiting, CORS configuration, content security policy headers

### Data Storage

**Database Schema (Drizzle ORM with PostgreSQL):**
- `users`: Admin/council member accounts with role-based access
- `events`: Kindergarten events with status tracking and attendance management
- `event_registrations`: Parent registrations for events with attendee counts
- `contact_messages`: Messages from contact forms
- `documents`: File metadata with Cloudinary references

**Design Considerations:**
- Text fields for dates/times to avoid timezone complications
- Soft delete pattern for events (status: 'active'/'cancelled')
- Separate tracking of max attendees vs current attendees
- Language field on registrations for localized email confirmations

### Authentication & Authorization

**Strategy:**
- JWT tokens in HttpOnly cookies for API authentication
- Role-based access control (admin vs member)
- Authentication check via cookie with Bearer token fallback

**Security Measures:**
- Bcrypt password hashing with salt rounds
- HTTP-only cookies with SameSite protection
- Rate limiting on sensitive endpoints (5 login attempts per 15 minutes)
- Input sanitization middleware
- CORS with environment-specific origin whitelisting

## External Dependencies

### Third-Party Services

**Cloudinary (File Storage):**
- Document uploads with automatic format detection
- Public URL generation for file access
- File deletion management via public_id
- Configuration via environment variables (cloud name, API key/secret)

**Email Service (Nodemailer/SendGrid):**
- Event registration confirmations (bilingual)
- Event cancellation notifications
- Contact form submissions
- Event reminders (24-hour automated scheduler)
- Dual provider support for reliability

**Neon Database (PostgreSQL):**
- Serverless PostgreSQL
- Connection pooling for production performance
- Migration support via Drizzle Kit
- Environment-based connection string configuration

### Frontend Libraries

**UI Components (Radix UI):**
- Headless accessible components
- Dialog, Dropdown, Select, Tooltip primitives
- Form controls with proper a11y support

**Form & Validation:**
- React Hook Form for form state management
- Zod for schema validation
- @hookform/resolvers for integration

**Utilities:**
- ExcelJS for attendee list exports
- date-fns for date manipulation
- ICS file generation for calendar exports

### Development Tools

**Build & Development:**
- Vite for fast development and optimized production builds
- TypeScript for type checking frontend and shared code
- Drizzle Kit for database migrations

**Deployment (Vercel):**
- Automatic builds from Git repository
- Serverless function deployment
- Environment variable management
- Custom routing via vercel.json

### Environment Variables Required

```
DATABASE_URL - Neon PostgreSQL connection string
SESSION_SECRET - JWT signing secret
CLOUDINARY_CLOUD_NAME - Cloudinary account identifier
CLOUDINARY_API_KEY - Cloudinary API key
CLOUDINARY_API_SECRET - Cloudinary API secret
GMAIL_USER - Gmail account for Nodemailer (optional)
GMAIL_APP_PASSWORD - Gmail app password (optional)
ADMIN_PASSWORD - Initial admin user password
ADMIN_EMAIL - Initial admin user email
NODE_ENV - Environment identifier (development/production)
```
