#!/usr/bin/env node

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = 'postgresql://neondb_owner:npg_oUFVkyKrQ5Z7@ep-silent-breeze-a2v8zuzu-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL });

async function verifyConnection() {
  try {
    console.log('🔄 Testing Neon database connection...');
    
    // Test basic connection
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful');
    console.log(`   Server time: ${result.rows[0].current_time}`);

    // Check all tables
    const tables = await pool.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\n📋 Database structure:');
    for (const table of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table.table_name}`);
      console.log(`   ${table.table_name}: ${count.rows[0].count} records, ${table.column_count} columns`);
    }

    // Test admin login
    const admin = await pool.query('SELECT username, name, role FROM users WHERE role = $1', ['admin']);
    console.log('\n👤 Admin account:');
    console.log(`   Username: ${admin.rows[0].username}`);
    console.log(`   Name: ${admin.rows[0].name}`);
    console.log(`   Role: ${admin.rows[0].role}`);

    // Show sample events
    const events = await pool.query('SELECT title, date, time, type FROM events ORDER BY date');
    console.log('\n📅 Sample events:');
    events.rows.forEach(event => {
      console.log(`   ${event.title} (${event.type}) - ${event.date} at ${event.time}`);
    });

    console.log('\n✅ All database verification checks passed!');
    
  } catch (error) {
    console.error('❌ Database verification failed:', error);
  } finally {
    await pool.end();
  }
}

verifyConnection();