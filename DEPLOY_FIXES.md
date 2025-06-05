# Cache Refresh Fix Required

## Issue
Registration works and saves to database, but attendee count doesn't update on frontend.

## Files to Commit
1. `client/src/components/event-registration-modal.tsx` - Aggressive cache invalidation

## Git Commands
```bash
git add client/src/components/event-registration-modal.tsx
git commit -m "Fix attendee count display with aggressive cache invalidation"
git push origin main
```

## Technical Details
- Database correctly shows event #3 has 1 attendee
- API returns correct `currentAttendees: 1` 
- Frontend cache not refreshing on production
- Added cache removal + delayed refetch

## Expected Result
After deployment:
- Attendee count updates immediately after registration
- "påmeldte" displays correct numbers from database
- Cache properly invalidates and refetches