# Librarian Dashboard Rate Limit Fix

## Issue
Librarian dashboard showing "Too many requests. Please wait a moment and try again." when trying to reply to users.

## Root Cause
The librarian rate limiter was set to 100 requests per minute, which seemed generous but wasn't enough when considering:
- Dashboard polling every 2 seconds = 30 requests/minute
- Loading conversations, analytics, feedback = additional requests
- Sending responses and warnings = more requests
- Multiple librarians or tabs could share the same IP limit

## Solution

### 1. Increased Librarian Rate Limit
Changed from 100 to 500 requests per minute for librarian endpoints:
- `/api/librarian/*` - 500 req/min
- `/api/admin/*` - 500 req/min

### 2. Added Localhost Skip
Added skip logic to bypass rate limiting for localhost (development):
- Checks for IPs: `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
- Applied to both `apiLimiter` and `librarianLimiter`
- Helps during development and testing

### 3. Fixed Route Patterns
Changed from `/api/librarian/` to `/api/librarian/*` for better pattern matching in Express.

## Rate Limit Summary

| Endpoint | Window | Max Requests | Notes |
|----------|--------|--------------|-------|
| `/api/chat` | 30 seconds | 15 | User chat messages |
| `/api/librarian/*` | 1 minute | 500 | Librarian dashboard |
| `/api/admin/*` | 1 minute | 500 | Admin dashboard |
| `/api/*` | 15 minutes | 100 | Other API endpoints |

## Testing
1. Open librarian dashboard
2. Respond to multiple users rapidly
3. ✅ Should not see rate limit errors
4. Dashboard should continue polling normally

## Code Changes
- `server.js` lines 18-42 - Rate limiter configurations
- `server.js` lines 47-50 - Route pattern application

## Status
✅ Complete - Ready for testing
