#!/bin/bash

# Remove any Git lock files
rm -f .git/config.lock .git/index.lock .git/refs/heads/main.lock

# Set SSH remote URL
git remote set-url origin git@github.com:MoJoIsReal/fau-erbhg.git

# Add all files
git add .

# Commit with comprehensive message
git commit -m "Complete secure FAU Erdal Barnehage platform

- Full-stack TypeScript application with React frontend
- Express.js backend with Neon PostgreSQL serverless integration
- Event management with calendar view and registrations
- Document upload system with Cloudinary integration
- Contact forms with Gmail email notifications
- User authentication with role-based access control
- Multilingual support (Norwegian/English)
- Security audit completed - all credentials secured
- Optimized for Vercel serverless deployment"

# Push to GitHub
git push origin main

echo "Successfully pushed to GitHub!"
echo "Repository: https://github.com/MoJoIsReal/fau-erbhg.git"
echo "Next step: Deploy to Vercel"