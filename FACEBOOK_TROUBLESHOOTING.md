# Facebook Webhook Not Receiving Messages - Troubleshooting

## Problem
Your webhook receives messages when YOU message the page, but NOT when other users message it.

## Root Cause
Facebook Messenger webhooks in development mode only send messages from:
- Page admins
- Page testers
- App developers/testers

Regular users' messages are NOT forwarded to your webhook until the app is approved and live.

## Solutions

### Option 1: Add Users as Testers (Quick Fix for Testing)

1. Go to Facebook Developer Console: https://developers.facebook.com/apps
2. Select your app
3. Go to "Roles" → "Roles" in the left sidebar
4. Click "Add Testers"
5. Enter the Facebook username or User ID of people who need to test
6. They will receive an invitation
7. Once they accept, their messages will be sent to your webhook

**Limitations:** Only works for a small number of people (up to 100 testers)

### Option 2: Submit App for Review (Production Solution)

To receive messages from ALL users, you need to:

1. **Complete App Review Requirements:**
   - Go to your app → "App Review" → "Permissions and Features"
   - Request "pages_messaging" permission
   - Provide:
     - App icon (1024x1024)
     - Privacy Policy URL
     - Terms of Service URL (optional)
     - App description
     - Screencast showing how your app uses Messenger

2. **Submit for Review:**
   - Facebook will review your app (usually takes 1-3 days)
   - Once approved, ALL users can message your page and trigger the webhook

3. **Make App Live:**
   - Go to "Settings" → "Basic"
   - Toggle "App Mode" from "Development" to "Live"

### Option 3: Use Page Inbox Instead (Alternative)

If you don't want to go through app review, you can:

1. **Monitor Facebook Page Inbox manually**
2. **Use the admin dashboard** to manage librarians
3. **When someone wants librarian access:**
   - They message your page directly
   - You see it in your Facebook Page inbox
   - You manually get their PSID and add them

**How to get someone's PSID manually:**

1. They message your Facebook Page
2. You see the message in your Page inbox
3. In the URL, you'll see something like: `facebook.com/messages/t/123456789`
4. That number (123456789) is their PSID
5. Add it to your admin dashboard or .env file

### Option 4: Test with Multiple Facebook Accounts

Create test Facebook accounts and add them as testers:

1. Create a test Facebook account
2. Add it as a tester (Option 1 above)
3. Message your page from that account
4. Your webhook will receive it

## Recommended Approach

**For Development/Testing:**
- Use Option 1 (Add Testers) for your library staff
- This lets you test the full workflow

**For Production:**
- Use Option 2 (Submit for App Review) - **See APP_REVIEW_CHECKLIST.md for complete guide**
- This allows any library patron to message the page
- Required for a real production system
- We've created all required documents (Privacy Policy, Terms of Service)
- Follow the step-by-step checklist to submit your app

## Current Workaround

Until you complete app review, you can:

1. **Tell new librarians to message the page**
2. **You'll see their message in your Facebook Page inbox** (not in the webhook)
3. **Get their PSID from the URL** in the inbox
4. **Manually add them in the admin dashboard** or .env file

## Verification

To check if your webhook is working:

1. Visit: `http://localhost:3000/api/test/webhook-status`
2. Have a tester message your page
3. Check server console for webhook logs

If you see logs when YOU message but not when others do, it confirms this is a Facebook permissions issue, not a code issue.

## Next Steps

Choose one of the options above based on your needs:
- **Just testing?** → Add testers (Option 1)
- **Going live soon?** → Submit for app review (Option 2)
- **Quick workaround?** → Manual PSID entry (Option 3)
