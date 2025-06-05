import { db } from "./db";
import { users, type InsertUser } from "@shared/schema";
import bcrypt from 'bcryptjs';

export async function initializeAdmin() {
  try {
    // Check if admin user already exists
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log('Admin user already exists, skipping initialization...');
      return;
    }

    console.log('Creating admin user...');

    // Create only the admin user
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminEmail = process.env.ADMIN_EMAIL || "fauerdalbarnehage@gmail.com";
    
    if (!adminPassword) {
      console.log('ADMIN_PASSWORD environment variable not set, skipping admin creation');
      return;
    }
    
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const adminUser: InsertUser = {
      username: adminEmail,
      password: hashedPassword,
      name: "FAU Erdal Barnehage",
      role: "admin",
      createdAt: new Date().toISOString()
    };

    await db.insert(users).values(adminUser);
    console.log('Admin user created successfully!');
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}