#!/usr/bin/env node

/**
 * Deployment Readiness Verification Script
 * Ensures all files are secure and ready for Git commit
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Verifying deployment readiness...\n');

// Check for sensitive patterns that should not be in Git
const sensitivePatterns = [
  /postgresql:\/\/[^@]+:[^@]+@/,  // Real database URLs
  /npg_[a-zA-Z0-9]{20,}/,        // Neon password tokens
  /[a-z]{16}/i,                  // App passwords
  /AKIA[0-9A-Z]{16}/,            // AWS access keys
  /[0-9]{21}/,                   // API keys
];

const filesToCheck = [
  'server',
  'client', 
  'shared',
  'api',
  '*.md',
  '*.js',
  '*.ts',
  '*.json'
];

let securityIssues = [];
let filesChecked = 0;

function scanDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
      scanDirectory(fullPath);
    } else if (file.isFile() && (file.name.endsWith('.js') || file.name.endsWith('.ts') || file.name.endsWith('.md'))) {
      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  if (filePath.includes('.env') && !filePath.includes('.env.example')) {
    return; // Skip actual .env files
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    filesChecked++;
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(content)) {
        securityIssues.push({
          file: filePath,
          issue: 'Contains sensitive data that should use environment variables'
        });
      }
    }
  } catch (err) {
    // Ignore files that can't be read
  }
}

// Check root files
const rootFiles = ['*.md', '*.js', '*.ts', '*.json'];
for (const pattern of rootFiles) {
  if (pattern.includes('*')) {
    const files = fs.readdirSync('.').filter(f => f.endsWith(pattern.slice(1)));
    files.forEach(file => {
      if (!file.startsWith('.')) {
        checkFile(file);
      }
    });
  }
}

// Check directories
scanDirectory('server');
scanDirectory('client');
scanDirectory('shared');
scanDirectory('api');

console.log(`✅ Checked ${filesChecked} files`);

if (securityIssues.length === 0) {
  console.log('✅ No security issues found');
  console.log('✅ All files are safe for Git commit');
  console.log('\n🚀 Ready for deployment to:');
  console.log('   Repository: https://github.com/MoJoIsReal/fau-erbhg.git');
  console.log('   Platform: Vercel');
} else {
  console.log('⚠️  Security issues found:');
  securityIssues.forEach(issue => {
    console.log(`   ${issue.file}: ${issue.issue}`);
  });
  console.log('\n❌ Fix security issues before Git commit');
}

// Check required files exist
const requiredFiles = [
  'package.json',
  'server/index.ts',
  'client/src/App.tsx',
  'shared/schema.ts',
  'FINAL_DEPLOYMENT_GUIDE.md'
];

console.log('\n📁 Checking required files:');
let missingFiles = [];

for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file}`);
    missingFiles.push(file);
  }
}

if (missingFiles.length === 0) {
  console.log('\n🎉 All required files present');
  console.log('🎉 Project is ready for Git deployment!');
} else {
  console.log(`\n❌ Missing ${missingFiles.length} required files`);
}