#!/usr/bin/env node

/**
 * Database Verification Script
 * Checks if all tables exist and shows current data
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

neonConfig.webSocketConstructor = ws;
dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyDatabase() {
  try {
    console.log('🔄 Verifying database setup...');
    
    // Check if tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const tablesResult = await pool.query(tablesQuery);
    console.log('\n📋 Database tables:');
    tablesResult.rows.forEach(row => {
      console.log(`   ✅ ${row.table_name}`);
    });

    // Count records in each table
    const tables = ['users', 'events', 'event_registrations', 'contact_messages', 'documents'];
    
    console.log('\n📊 Record counts:');
    for (const table of tables) {
      try {
        const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   ${table}: ${countResult.rows[0].count} records`);
      } catch (error) {
        console.log(`   ${table}: Table not found`);
      }
    }

    // Show admin user
    const adminResult = await pool.query('SELECT username, name, role FROM users WHERE role = $1', ['admin']);
    if (adminResult.rows.length > 0) {
      console.log('\n👤 Admin user found:');
      console.log(`   Username: ${adminResult.rows[0].username}`);
      console.log(`   Name: ${adminResult.rows[0].name}`);
    }

    console.log('\n✅ Database verification completed');
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
  } finally {
    await pool.end();
  }
}

verifyDatabase();