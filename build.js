#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('Starting build process...');

try {
  // Install dev dependencies first
  console.log('Installing dependencies...');
  execSync('npm install --include=dev', { stdio: 'inherit' });
  
  // Build client with vite
  console.log('Building client...');
  execSync('./node_modules/.bin/vite build', { stdio: 'inherit' });
  
  // Build server with esbuild
  console.log('Building server...');
  execSync('./node_modules/.bin/esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist', { stdio: 'inherit' });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}