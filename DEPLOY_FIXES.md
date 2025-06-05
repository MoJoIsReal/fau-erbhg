# Critical Deployment Fixes Required

## Issue
Vercel deployment showing 404 NOT_FOUND error due to incorrect build configuration.

## Files to Commit
1. `api/events.js` - New public events API endpoint
2. `api/secure-events.js` - Fixed database column references
3. `vercel.json` - Corrected build output directory from "dist" to "dist/public"

## Git Commands
```bash
git add api/events.js api/secure-events.js vercel.json
git commit -m "Fix Vercel deployment: correct build output directory and API endpoints"
git push origin main
```

## Expected Result
After deployment:
- Frontend serves proper HTML instead of raw JavaScript
- API endpoints return JSON data instead of HTML
- Events page displays 3 sample events from database
- Login functionality works with fauerdalbarnehage@gmail.com

## Current Status
- Local development works correctly
- Production deployment needs these fixes to function