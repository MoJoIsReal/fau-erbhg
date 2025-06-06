import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { storage } from './storage';
import type { User } from '@shared/schema';

export interface AuthSession {
  userId: number;
  username: string;
  name: string;
  role: string;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const user = await storage.getUserByUsername(username);
  if (!user) {
    return null;
  }

  const isValidPassword = await verifyPassword(password, user.password);
  if (!isValidPassword) {
    return null;
  }

  return user;
}

export function isAuthenticated(req: any): boolean {
  // Check session-based authentication
  if (req.session && req.session.user) {
    return true;
  }
  
  // Check JWT token authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      if (!process.env.SESSION_SECRET) {
        throw new Error('SESSION_SECRET environment variable must be set');
      }
      const decoded = jwt.verify(token, process.env.SESSION_SECRET) as any;
      req.user = decoded; // Store decoded token data
      return true;
    } catch (error) {
      return false;
    }
  }
  
  return false;
}

export function requireAuth(req: any, res: any, next: any) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
}

export function requireRole(role: string) {
  return (req: any, res: any, next: any) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    if (req.session.user.role !== role && req.session.user.role !== 'admin') {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    
    next();
  };
}

export function requireCouncilMember(req: any, res: any, next: any) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  // Get role from either session or JWT token
  const userRole = req.session?.user?.role || req.user?.role;
  if (userRole !== 'admin' && userRole !== 'member') {
    return res.status(403).json({ message: 'Council member access required' });
  }
  
  next();
}