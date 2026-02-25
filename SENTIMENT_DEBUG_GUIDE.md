# Sentiment Indicator Debug Guide

## Issue
Sentiment indicator showing "😐 Neutral (1👍 1👎)" but not updating live when user gives more feedback.

## Debugging Steps

### 1. Check Browser Console (Librarian Dashboard)
Open browser console (F12) and look for these logs every 2 seconds:

**Expected Output:**
```
Refresh check: {
  messages: "2 → 2",
  status: "viewed → viewed", 
  feedback: "1👍 1👎 → 2👍 1👎",
  hasNewMessages: false,
  hasFeedbackChanged: true
}
✅ Updating sentiment indicator (feedback changed)
```

**If you see:**
- `feedback: "1👍 1👎 → 1👍 1👎"` - Feedback not changing on server
- `hasFeedbackChanged: false` - Comparison logic issue
- No logs at all - Polling not running

### 2. Check User Chat Console
When user clicks thumbs up/down, should see:
```
📊 Message feedback received: { sessionId: "...", messageId: "...", type: "up" }
```

### 3. Test Feedback Endpoint Manually
In browser console (on librarian dashboard):
```javascript
fetch('/api/conversation/' + currentSessionId)
  .then(r => r.json())
  .then(d => console.log('Feedback:', d.feedback));
```

Should show: `Feedback: { thumbsUp: 1, thumbsDown: 1 }`

### 4. Check Server Logs
Look for:
```
📊 Message feedback received: { sessionId: '...', messageId: '...', type: 'up' }
```

## Common Issues

### Issue 1: Feedback Not Saved
**Symptom**: Server logs don't show feedback received
**Cause**: User-side fetch failing
**Fix**: Check network tab for 429 (rate limit) or 500 errors

### Issue 2: Feedback Saved But Not Returned
**Symptom**: Server logs show feedback, but API doesn't return it
**Cause**: Conversation endpoint not including feedback
**Fix**: Verify `/api/conversation/:sessionId` includes feedback calculation

### Issue 3: Feedback Returned But Not Detected
**Symptom**: Console shows same feedback counts
**Cause**: Comparison logic issue
**Fix**: Check `hasFeedbackChanged` calculation

### Issue 4: Feedback Detected But Not Displayed
**Symptom**: Console shows "feedback changed" but UI doesn't update
**Cause**: `updateSentimentIndicator()` not working
**Fix**: Check if indicator element exists

## Quick Test

### Step 1: Open User Chat
1. Start conversation
2. Click thumbs up on a message
3. Check console for feedback submission

### Step 2: Open Librarian Dashboard
1. Open the conversation
2. Check console for polling logs
3. Wait 2 seconds
4. Should see feedback update

### Step 3: Give More Feedback
1. In user chat, click thumbs down
2. Watch librarian dashboard console
3. Within 2 seconds, should see:
   - `feedback: "1👍 1👎 → 1👍 2👎"`
   - `hasFeedbackChanged: true`
   - Sentiment badge updates

## Manual Fix Test

If automatic update doesn't work, test manual update:

**In librarian dashboard console:**
```javascript
// Get current conversation
fetch('/api/conversation/' + currentSessionId)
  .then(r => r.json())
  .then(data => {
    console.log('Feedback:', data.feedback);
    updateSentimentIndicator(data);
  });
```

If this works, polling is the issue. If not, `updateSentimentIndicator()` is broken.

## Expected Behavior

### Timeline:
1. **T+0s**: User clicks thumbs up
2. **T+0.1s**: Feedback sent to server
3. **T+0.2s**: Server saves feedback
4. **T+2s**: Librarian dashboard polls
5. **T+2.1s**: Server returns updated feedback
6. **T+2.2s**: Sentiment indicator updates

### Visual Changes:
- Badge text changes (e.g., "Happy" → "Very Happy")
- Badge color changes (e.g., blue → green)
- Counts update (e.g., "2👍 1👎" → "3👍 1👎")

## Code Verification

### Check 1: Polling Running?
```javascript
// In librarian dashboard console
console.log('Polling interval:', conversationPollingInterval);
// Should NOT be null
```

### Check 2: Current Session Set?
```javascript
console.log('Current session:', currentSessionId);
// Should show session ID
```

### Check 3: Modal Open?
```javascript
console.log('Modal active:', 
  document.getElementById('conversation-modal').classList.contains('active'));
// Should be true
```

### Check 4: Feedback Data Structure?
```javascript
console.log('Current conversation feedback:', currentConversation?.feedback);
// Should show { thumbsUp: X, thumbsDown: Y }
```

## Next Steps

Based on console output, determine:
1. Is feedback being sent? → Check user console
2. Is feedback being saved? → Check server logs
3. Is feedback being returned? → Check API response
4. Is feedback being detected? → Check comparison logic
5. Is UI being updated? → Check updateSentimentIndicator()

## Status
🔍 Debugging in progress - Need console output to diagnose
