#!/usr/bin/env node

/**
 * Database Setup Script for FAU Erdal Barnehage
 * This script creates all necessary tables and initial data
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import bcryptjs from 'bcryptjs';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createTablesSQL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
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
CREATE TABLE IF NOT EXISTS event_registrations (
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
CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
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

async function setupDatabase() {
  try {
    console.log('🔄 Connecting to database...');
    
    // Create tables
    console.log('🔄 Creating tables...');
    await pool.query(createTablesSQL);
    console.log('✅ Tables created successfully');

    // Create admin user
    console.log('🔄 Creating admin user...');
    const hashedPassword = await bcryptjs.hash('admin123', 12);
    const adminUserSQL = `
      INSERT INTO users (username, password, name, role, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username) DO NOTHING
    `;
    
    await pool.query(adminUserSQL, [
      'admin',
      hashedPassword,
      'FAU Administrator',
      'admin',
      new Date().toISOString()
    ]);
    console.log('✅ Admin user created (username: admin, password: admin123)');

    // Add sample event
    console.log('🔄 Adding sample event...');
    const sampleEventSQL = `
      INSERT INTO events (title, description, date, time, location, type, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `;
    
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 14);
    
    await pool.query(sampleEventSQL, [
      'Velkommen til FAU-møte',
      'Første møte for det nye året. Vi vil diskutere årets aktiviteter og budsjett.',
      futureDate.toISOString().split('T')[0],
      '19:00',
      'Erdal barnehage',
      'meeting',
      'active'
    ]);
    console.log('✅ Sample event added');

    console.log('\n🎉 Database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • All tables created');
    console.log('   • Admin user: admin / admin123');
    console.log('   • Sample event added');
    console.log('\n🔗 Your site: https://fau-erdalbhg.vercel.app/');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();