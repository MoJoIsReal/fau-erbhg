# Critical Deployment Fixes Required

## Issue
Missing API endpoints causing 404 errors during signup and login.

## Files to Commit
1. `api/user.js` - JWT-based user authentication endpoint
2. `api/login.js` - User login with bcrypt password verification
3. `api/registrations.js` - Event registration with capacity checking
4. `client/src/components/event-registration-modal.tsx` - Updated API endpoint

## Git Commands
```bash
git add api/user.js api/login.js api/registrations.js client/src/components/event-registration-modal.tsx
git commit -m "Add missing authentication and registration API endpoints"
git push origin main
```

## Expected Result
After deployment:
- User login works with JWT authentication
- Event registration creates database entries
- Capacity checking prevents overbooking
- Frontend properly communicates with backend

## Current Status
- Events displaying correctly ✓
- Need authentication and registration endpoints deployed