# Facebook App Review Submission Checklist

This guide will help you submit your Library Chatbot app for Facebook review so it can receive messages from all users.

## Before You Start

Make sure your app is working correctly:
- [ ] Chatbot responds to messages on your website
- [ ] Webhook receives messages from you (the admin)
- [ ] Librarian notifications work
- [ ] Admin dashboard functions properly

## Required Materials

### 1. App Icon (1024x1024 pixels)

Create a square icon representing your library:
- Size: Exactly 1024x1024 pixels
- Format: PNG or JPG
- Content: Your library logo or a book/library symbol
- No text required, but can include library name

**Tools to create:**
- Canva (free): https://canva.com
- Figma (free): https://figma.com
- Or hire a designer on Fiverr ($5-20)

### 2. Privacy Policy URL

✅ Already created! Use:
```
https://your-domain.com/privacy-policy.html
```

**Before submitting:**
1. Open `public/privacy-policy.html`
2. Replace placeholders with your library's actual information:
   - [Your Library Email]
   - [Your Library Phone]
   - [Your Library Address]
   - [Your Library Website]
3. Deploy to your production server
4. Test the URL works

### 3. Terms of Service URL (Optional but Recommended)

✅ Already created! Use:
```
https://your-domain.com/terms-of-service.html
```

**Before submitting:**
1. Open `public/terms-of-service.html`
2. Replace placeholders with your library's information
3. Update [Your State/Country] in the Governing Law section
4. Deploy to your production server

### 4. App Description

Use this template (customize as needed):

```
Library Chatbot - AI-Powered Library Assistant

Our chatbot helps library patrons get instant answers to common questions about:
- Finding books and resources
- Library hours and locations
- Account information and renewals
- Research assistance
- Computer and printing services
- Library events and programs

When the AI assistant cannot fully help, users can request to speak with a human librarian who will receive a notification via Facebook Messenger.

The chatbot uses Ollama AI (running locally) to provide accurate, library-focused responses while maintaining user privacy.
```

### 5. Screencast Video

**What to show (2-3 minutes):**

1. **User Flow (60 seconds):**
   - Open your website
   - Click the chat widget
   - Ask a library question (e.g., "What are your hours?")
   - Show the AI response
   - Click "Talk to Librarian" button
   - Show the confirmation message

2. **Librarian Flow (60 seconds):**
   - Show Facebook Messenger on your phone/computer
   - Show the notification received by librarian
   - Show the conversation details
   - (Optional) Show admin dashboard

3. **Facebook Messenger Integration (30 seconds):**
   - Show someone messaging your Facebook Page with the keyword
   - Show the confirmation response
   - Show it appearing in admin dashboard

**Tools to record:**
- Windows: Xbox Game Bar (Win + G) - Free, built-in
- Mac: QuickTime Player - Free, built-in
- Cross-platform: OBS Studio (free) - https://obsproject.com
- Loom (free tier) - https://loom.com

**Tips:**
- Keep it under 3 minutes
- Show real functionality, not mockups
- Include audio narration explaining what you're doing
- Show the Facebook Messenger integration clearly
- Upload to YouTube (unlisted) or Google Drive

## Submission Steps

### Step 1: Prepare Your Production Environment

1. **Deploy to a production server with HTTPS:**
   - Heroku (free tier): https://heroku.com
   - Railway: https://railway.app
   - Render: https://render.com
   - DigitalOcean: https://digitalocean.com

2. **Update your webhook URL:**
   - In Facebook Developer Console
   - Change from ngrok URL to your production URL
   - Example: `https://your-library-chatbot.herokuapp.com/webhook`

3. **Test everything works on production**

### Step 2: Request Permissions

1. Go to https://developers.facebook.com/apps
2. Select your app
3. Click "App Review" → "Permissions and Features"
4. Find "pages_messaging"
5. Click "Request Advanced Access"

### Step 3: Fill Out the Review Form

You'll need to provide:

**1. App Details:**
- App Name: "Library Chatbot" (or your library name)
- App Icon: Upload your 1024x1024 icon
- Category: "Education" or "Utilities"

**2. Privacy Policy:**
- URL: `https://your-domain.com/privacy-policy.html`

**3. Terms of Service (optional):**
- URL: `https://your-domain.com/terms-of-service.html`

**4. App Description:**
- Paste the description from above (customize it)

**5. Detailed Description for pages_messaging:**
```
We use pages_messaging to enable library patrons to request assistance from human librarians through Facebook Messenger.

When a user clicks "Talk to Librarian" in our chatbot, we send a notification to our library staff via Messenger, including the conversation context. This allows librarians to provide personalized assistance.

We also use it to manage librarian access - staff can request access by messaging a keyword to our page, and administrators can approve them through our admin dashboard.

All messages are related to library services and patron assistance.
```

**6. Screencast:**
- Upload your video or provide YouTube link
- Make sure it clearly shows the Messenger integration

**7. Test Instructions:**
```
Test User Credentials: [Provide a test Facebook account if needed]

How to Test:
1. Visit https://your-domain.com
2. Click the chat widget in bottom right
3. Ask "What are your hours?"
4. Click "Talk to Librarian" button
5. Check the Facebook Page's Messenger for the notification

To test access request:
1. Message our Facebook Page with: REQUEST_LIBRARIAN_ACCESS
2. You'll receive a confirmation message
3. The request appears in our admin dashboard
```

### Step 4: Submit for Review

1. Review all information
2. Click "Submit for Review"
3. Wait for Facebook's response (usually 1-3 days)

### Step 5: After Approval

Once approved:

1. **Make App Live:**
   - Go to "Settings" → "Basic"
   - Toggle "App Mode" from "Development" to "Live"

2. **Test with real users:**
   - Have non-admin users message your page
   - Verify webhook receives their messages
   - Confirm notifications work

3. **Monitor:**
   - Check admin dashboard regularly
   - Respond to librarian requests
   - Monitor for any issues

## Common Rejection Reasons

If your app is rejected, it's usually because:

1. **Video doesn't show Messenger integration clearly**
   - Solution: Re-record showing the full flow

2. **Privacy Policy is incomplete**
   - Solution: Make sure all placeholders are filled in

3. **App description is vague**
   - Solution: Be specific about how you use Messenger

4. **Can't test the app**
   - Solution: Provide clear test instructions and credentials

## After Rejection

Don't worry! You can resubmit:
1. Read Facebook's feedback carefully
2. Fix the issues they mentioned
3. Update your submission
4. Resubmit (usually faster the second time)

## Need Help?

- Facebook Developer Support: https://developers.facebook.com/support
- Check your app's "App Review" section for detailed feedback
- Review Facebook's Messenger Platform policies: https://developers.facebook.com/docs/messenger-platform/policy

## Estimated Timeline

- Preparation: 2-4 hours
- Facebook Review: 1-3 days
- Total: 1-4 days

Good luck with your submission! 🚀
