import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure SSL for production
const isProduction = process.env.NODE_ENV === 'production';

// Parse DATABASE_URL and add SSL parameters for production
let connectionConfig: any = {
  connectionString: process.env.DATABASE_URL
};

if (isProduction && process.env.DATABASE_URL) {
  // For Render PostgreSQL, add SSL parameters to connection string
  const dbUrl = new URL(process.env.DATABASE_URL);
  dbUrl.searchParams.set('sslmode', 'require');
  connectionConfig.connectionString = dbUrl.toString();
  connectionConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(connectionConfig);

export const db = drizzle({ client: pool, schema });