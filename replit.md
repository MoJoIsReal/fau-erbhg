# FAU Erdal Barnehage - Digital Platform

## Overview

This is a comprehensive digital platform for FAU Erdal Barnehage (a Norwegian kindergarten parent association) that facilitates parent-school communication. The platform provides event management, document sharing, contact forms, and administrative tools for council members. It's built as a full-stack TypeScript application with React frontend and Express backend, deployed on Vercel with serverless functions.

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
- Session-based authentication with JWT tokens stored in localStorage
- Real-time data synchronization with optimistic updates
- File upload with drag-and-drop support
- Calendar views with ICS export and multi-platform calendar integration

### Backend Architecture

**Technology Stack:**
- Express.js with TypeScript for the API server
- Drizzle ORM with Neon Postgres for database operations
- JWT for authentication tokens
- Bcrypt for password hashing
- Nodemailer for email notifications

**API Design:**
- RESTful API endpoints organized by resource type
- Dual deployment strategy: Traditional Express routes for development, serverless functions for production
- Middleware-based security (rate limiting, CSRF protection, input sanitization)
- Session-based authentication with JWT fallback
- File uploads handled via Multer with memory storage for serverless compatibility

**Key Design Decisions:**
- **Serverless-First Architecture**: API routes are duplicated as serverless functions (`/api/*.js`) for Vercel deployment while maintaining Express routes for local development
- **Database Abstraction**: Storage interface (`IStorage`) allows swapping between different database implementations
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
- Session-based authentication for traditional web flow
- JWT tokens for API authentication and serverless functions
- Role-based access control (admin vs member)
- Dual authentication check: session cookie OR Bearer token

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
- Serverless PostgreSQL with WebSocket connections
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
- TypeScript for type checking across client/server
- ESBuild for server bundling
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