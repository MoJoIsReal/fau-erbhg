#!/usr/bin/env node

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import bcryptjs from 'bcryptjs';

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = 'postgresql://neondb_owner:npg_oUFVkyKrQ5Z7@ep-silent-breeze-a2v8zuzu-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({ connectionString: DATABASE_URL });

async function updateAdmin() {
  try {
    console.log('🔄 Updating admin credentials...');
    
    // Hash the new password
    const hashedPassword = await bcryptjs.hash('TyWm2c8a3eMrr0*', 12);
    
    // Update admin user
    const updateSQL = `
      UPDATE users 
      SET username = $1, password = $2, name = $3
      WHERE role = 'admin'
    `;
    
    const result = await pool.query(updateSQL, [
      'fauerdalbarnehage@gmail.com',
      hashedPassword,
      'FAU Erdal Barnehage'
    ]);
    
    if (result.rowCount > 0) {
      console.log('✅ Admin credentials updated successfully');
      console.log('   Username: fauerdalbarnehage@gmail.com');
      console.log('   Password: TyWm2c8a3eMrr0*');
    } else {
      console.log('❌ No admin user found to update');
    }
    
    // Verify the update
    const verifyResult = await pool.query('SELECT username, name, role FROM users WHERE role = $1', ['admin']);
    if (verifyResult.rows.length > 0) {
      console.log('\n✅ Verification:');
      console.log(`   Username: ${verifyResult.rows[0].username}`);
      console.log(`   Name: ${verifyResult.rows[0].name}`);
      console.log(`   Role: ${verifyResult.rows[0].role}`);
    }
    
  } catch (error) {
    console.error('❌ Failed to update admin:', error);
  } finally {
    await pool.end();
  }
}

updateAdmin();