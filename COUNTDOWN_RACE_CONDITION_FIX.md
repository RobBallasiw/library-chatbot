# Countdown Race Condition Fix

## Issue
Session was closing even though user sent a message during the countdown. The countdown wasn't being cancelled properly.

## Root Cause
Race condition between user sending message and countdown reaching zero:

### Timeline of the Bug:
1. Countdown at 1 second remaining
2. Countdown interval fires, checks server (countdown still exists) ✅
3. Decrements countdown to 0
4. **User sends message at this exact moment** ⚠️
5. Countdown reaches 0, session closes ❌
6. User's message arrives but session already closed

The problem was that the countdown check happened at the START of the interval, but the session closed at the END, leaving a 1-second window where user messages could be ignored.

## Solution

### 1. Cancel Countdown FIRST in Chat Endpoint
Moved countdown cancellation to happen BEFORE any status checks in `/api/chat`:
```javascript
// Cancel countdown if it exists (do this FIRST, before status checks)
if (conversation.countdown) {
  delete conversation.countdown;
  console.log('⏹️ Countdown cancelled - user sent a message');
}
```

### 2. Reopen Closed Conversations
If user sends message to a closed conversation, reopen it as 'human' status:
```javascript
if (conversation.status === 'closed') {
  console.log('🔄 Reopening closed conversation - user sent message');
  conversation.status = 'human';
  // Notify librarian
}
```

### 3. Double-Check Before Closing
Added a final countdown check right before closing the session:
```javascript
if (countdown <= 0 && !countdownCancelled) {
  // Double-check one more time before closing
  const finalCheck = await fetch(`/api/conversation/${sessionId}`);
  if (!finalCheckData.countdown) {
    // User sent message at last second - cancel!
    return;
  }
  // Only close if countdown still exists
  endSessionAutomatically();
}
```

## How It Works Now

### Happy Path (Countdown Completes):
1. Librarian clicks "Warn Before Ending"
2. 10-second countdown starts
3. User doesn't respond
4. Every second: check server, decrement, update server
5. At 0 seconds: final check confirms no user message
6. Session closes ✅

### Cancellation Path (User Responds):
1. Librarian clicks "Warn Before Ending"
2. Countdown at 5 seconds
3. User sends message
4. Server deletes `conversation.countdown` immediately
5. Next interval check (or final check) detects missing countdown
6. Countdown cancelled, librarian alerted ✅

### Edge Case (Last-Second Message):
1. Countdown at 1 second
2. Interval fires, checks server (countdown exists)
3. Decrements to 0
4. User sends message (countdown deleted on server)
5. Final check detects missing countdown
6. Countdown cancelled instead of closing ✅

## Code Changes
- `server.js` lines 517-560 - Countdown cancellation moved before status checks, reopen closed conversations
- `public/librarian.html` lines 1681-1750 - Added final countdown check before closing session

## Testing Scenarios

### Test 1: Normal Countdown
1. Librarian warns user
2. Wait 10 seconds without user response
3. ✅ Session should close

### Test 2: User Responds Mid-Countdown
1. Librarian warns user
2. User sends message at 5 seconds
3. ✅ Countdown should cancel
4. ✅ Librarian should see alert
5. ✅ Session should stay open

### Test 3: User Responds at Last Second
1. Librarian warns user
2. User sends message at 1 second
3. ✅ Countdown should cancel (not close)
4. ✅ Session should stay open

### Test 4: Message to Closed Session
1. Session is closed
2. User sends new message
3. ✅ Session should reopen as 'human'
4. ✅ Librarian should be notified

## Status
✅ Complete - Ready for testing
