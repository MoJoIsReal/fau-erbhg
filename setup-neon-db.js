#!/usr/bin/env node

/**
 * Direct Neon Database Setup Script
 * Uses the specific connection string provided
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import bcryptjs from 'bcryptjs';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const DATABASE_URL = 'postgresql://neondb_owner:npg_oUFVkyKrQ5Z7@ep-silent-breeze-a2v8zuzu-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL });

const createTablesSQL = `
-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS contact_messages CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);

-- Events table
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  location TEXT NOT NULL,
  custom_location TEXT,
  max_attendees INTEGER,
  current_attendees INTEGER DEFAULT 0,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

-- Event registrations table
CREATE TABLE event_registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  attendee_count INTEGER DEFAULT 1,
  comments TEXT,
  language TEXT DEFAULT 'no'
);

-- Contact messages table
CREATE TABLE contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Documents table
CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  cloudinary_url TEXT,
  cloudinary_public_id TEXT
);
`;

async function setupNeonDatabase() {
  try {
    console.log('🔄 Connecting to Neon database...');
    
    // Create tables
    console.log('🔄 Creating fresh database tables...');
    await pool.query(createTablesSQL);
    console.log('✅ All tables created successfully');

    // Create admin user
    console.log('🔄 Creating admin user...');
    const hashedPassword = await bcryptjs.hash('admin123', 12);
    const adminUserSQL = `
      INSERT INTO users (username, password, name, role, created_at)
      VALUES ($1, $2, $3, $4, $5)
    `;
    
    await pool.query(adminUserSQL, [
      'admin',
      hashedPassword,
      'FAU Administrator',
      'admin',
      new Date().toISOString()
    ]);
    console.log('✅ Admin user created');

    // Create sample events
    console.log('🔄 Adding sample events...');
    
    // Future event
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    
    const sampleEventsSQL = `
      INSERT INTO events (title, description, date, time, location, type, status, max_attendees) VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8),
      ($9, $10, $11, $12, $13, $14, $15, $16),
      ($17, $18, $19, $20, $21, $22, $23, $24)
    `;
    
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);
    
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 7);
    
    await pool.query(sampleEventsSQL, [
      // Future meeting
      'FAU-møte Januar 2025',
      'Første møte for det nye året. Vi vil diskutere årets aktiviteter, budsjett og planlegging av kommende arrangementer.',
      futureDate.toISOString().split('T')[0],
      '19:00',
      'Erdal barnehage',
      'meeting',
      'active',
      20,
      
      // Past event
      'Julebord 2024',
      'Tradisjonelt julebord for foreldre og ansatte. Hyggelig samling med god mat og sosialt samvær.',
      pastDate.toISOString().split('T')[0],
      '18:30',
      'Kulturhuset Askøy',
      'event',
      'active',
      50,
      
      // Upcoming dugnad
      'Vinter-dugnad',
      'Fellesinnsats for å rydde uteområdet etter vinteren. Ta med arbeidsklær og godt humør!',
      upcomingDate.toISOString().split('T')[0],
      '10:00',
      'Erdal barnehage',
      'dugnad',
      'active',
      15
    ]);
    
    console.log('✅ Sample events added');

    // Add sample contact message
    console.log('🔄 Adding sample data...');
    const sampleContactSQL = `
      INSERT INTO contact_messages (name, email, phone, subject, message, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await pool.query(sampleContactSQL, [
      'Test Bruker',
      'test@example.com',
      '+47 123 45 678',
      'Spørsmål om FAU',
      'Dette er en test melding for å sjekke at kontaktskjemaet fungerer.',
      new Date().toISOString()
    ]);
    
    console.log('✅ Sample contact message added');

    console.log('\n🎉 Neon database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • All tables created and populated');
    console.log('   • Admin user: admin / admin123');
    console.log('   • 3 sample events added');
    console.log('   • 1 sample contact message');
    console.log('\n🔗 Your site: https://fau-erdalbhg.vercel.app/');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupNeonDatabase();