# Librarian Notification System

This chatbot includes a built-in librarian dashboard for monitoring conversations. Facebook Messenger integration is optional and requires additional setup.

## Quick Start - Use Built-in Dashboard

1. Start your server: `npm start`
2. Open the librarian dashboard: `http://localhost:3000/librarian`
3. Monitor conversations in real-time
4. See when users request to speak with a librarian

## Facebook Messenger Integration (Get Notifications on Your Phone!)

Want to receive notifications directly in Facebook Messenger? Follow these steps:

## Prerequisites

1. A Facebook Page for your library
2. A Facebook Developer account
3. Your chatbot server accessible via HTTPS (use ngrok for testing)

## Setup Steps

### 1. Create a Facebook App

1. Go to https://developers.facebook.com/apps
2. Click "Create App"
3. Select "Business" as app type
4. Fill in app details and create

### 2. Add Messenger Product

1. In your app dashboard, click "Add Product"
2. Find "Messenger" and click "Set Up"

### 3. Generate Page Access Token

1. In Messenger settings, find "Access Tokens"
2. Select your library's Facebook Page
3. Click "Generate Token"
4. Copy the token - this is your `FACEBOOK_PAGE_ACCESS_TOKEN`

### 4. Set Up Webhook

**IMPORTANT**: Facebook requires HTTPS and a publicly accessible URL. `http://localhost:3000` will NOT work!

**For Development/Testing:**
1. Install ngrok from https://ngrok.com/download
2. Start your server: `npm start`
3. In a new terminal, run: `ngrok http 3000`
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

**Configure Webhook in Facebook:**
1. In Messenger settings, find "Webhooks"
2. Click "Add Callback URL"
3. Enter your webhook URL: 
   - Development: `https://abc123.ngrok.io/webhook` (your ngrok HTTPS URL)
   - Production: `https://your-domain.com/webhook`
4. Enter a verify token (create a random string like `my_library_verify_token_2024`) - this is your `FACEBOOK_VERIFY_TOKEN`
5. Click "Verify and Save"
6. Subscribe to these webhook fields:
   - messages
   - messaging_postbacks

**Note**: The free ngrok URL changes every time you restart it. You'll need to update the webhook URL in Facebook settings each time. For a permanent solution, use a paid ngrok account or deploy to production.

### 5. Configure Environment Variables

Create a `.env` file in your project root:

```
FACEBOOK_PAGE_ACCESS_TOKEN=your_page_access_token_here
FACEBOOK_VERIFY_TOKEN=your_verify_token_here
FACEBOOK_PAGE_ID=your_page_id_here
PORT=3000
```

## Security: Authorized Librarians Only

The system now includes access control. Only PSIDs listed in the `LIBRARIAN_PSID` environment variable will:
- Receive notifications when users request help
- Be able to respond to conversations
- Access librarian features

### Adding Multiple Librarians

To add multiple librarians, separate their PSIDs with commas in your `.env` file:

```
LIBRARIAN_PSID=25833220919619877,123456789,987654321
```

### Getting a New Librarian's PSID

1. Have the new librarian message your Facebook Page
2. Check your server console for their PSID
3. The system will show: `🔐 Authorized: ❌ NO`
4. Copy their PSID from the logs
5. Add it to the `LIBRARIAN_PSID` list in `.env`
6. Restart your server

### What Happens to Unauthorized Users?

If someone who is NOT in the authorized list messages your page:
- They will receive an "Access Denied" message
- Their PSID will be logged (so you can add them if needed)
- They will NOT receive librarian notifications
- They will NOT be able to interact with conversations

This ensures only your library staff can act as librarians!

### Method 1: Automatic (Easiest)

1. Make sure your webhook is set up and server is running
2. Go to your Facebook Page
3. Send a message to your page from your personal Facebook account (the librarian's account)
4. Check your server console/logs - you'll see:
   ```
   📱 Message received from PSID: 1234567890
   ```
5. Copy that PSID number
6. Add it to your `.env` file:
   ```
   LIBRARIAN_PSID=1234567890
   ```
7. Restart your server

### Method 2: Using Graph API

1. Send a message to your page
2. Use this URL in your browser (replace YOUR_TOKEN):
   ```
   https://graph.facebook.com/v18.0/me/conversations?access_token=YOUR_TOKEN
   ```
3. Find your PSID in the response
4. Add it to `.env` file

### Testing

Once configured:
1. Open your website chat widget
2. Click "Talk to Librarian"
3. You should receive a Messenger notification on Facebook!

**Note**: Each person who messages your page gets a unique PSID. You can add multiple librarians by storing multiple PSIDs.

### 6. Start Your Server

```cmd
npm start
```

Your server should now be running and ready to receive webhook events from Facebook.

### 7. Subscribe Your Page

1. In Messenger settings, find "Webhooks"
2. Click "Add or Remove Pages"
3. Select your library page and subscribe

## How It Works

1. **User requests librarian**: When a user clicks "Talk to Librarian", a notification is sent to your Facebook Page via Messenger
2. **Librarian receives notification**: The librarian sees the conversation history and user's question
3. **Librarian responds**: The librarian can reply via Facebook Messenger
4. **User receives response**: The response appears in the chat widget

## Testing

1. Make sure ngrok is running: `ngrok http 3000`
2. Start your server in another terminal: `npm start`
3. Open your website: `http://localhost:3000`
4. Open the chat widget
5. Click "Talk to Librarian"
6. Check your Facebook Page's Messenger inbox for the notification

**IMPORTANT: Webhook Limitations in Development Mode**

⚠️ Facebook webhooks in development mode only receive messages from:
- Page admins
- App developers
- App testers

To receive messages from regular users, you must either:
1. Add them as "Testers" in your Facebook App (Roles → Testers)
2. Submit your app for review and make it "Live"

See `FACEBOOK_TROUBLESHOOTING.md` for detailed instructions.

**Quick Test Checklist:**
- [ ] ngrok is running and showing HTTPS URL
- [ ] Server is running on port 3000
- [ ] Webhook is verified in Facebook settings
- [ ] Page is subscribed to webhook
- [ ] .env file has all required tokens
- [ ] Facebook Page exists and you're an admin
- [ ] Test users are added as "Testers" in your app (if not the page admin)

## Production Deployment

For production, deploy your server to a hosting service with HTTPS:
- Heroku
- AWS
- DigitalOcean
- Vercel (with serverless functions)

Update your webhook URL in Facebook settings to point to your production domain.

## Troubleshooting

- **Webhook verification fails**: 
  - Check that your VERIFY_TOKEN in `.env` matches exactly what you entered in Facebook settings
  - Ensure you're using HTTPS (not HTTP)
  - Make sure your server is running before verifying in Facebook
  - Check that ngrok is running and the URL is correct

- **"URL is not available" error**: 
  - You're trying to use `http://localhost:3000` - this won't work!
  - Use ngrok to get a public HTTPS URL
  - Make sure ngrok is running before setting up the webhook

- **No messages received**: 
  - Ensure webhook is subscribed to your page and "messages" field is selected
  - Check your server logs for incoming webhook requests
  - Verify your page access token is correct

- **Token errors**: 
  - Regenerate your page access token and update .env file
  - Make sure there are no extra spaces in your .env file

- **ngrok URL expired**: 
  - Free ngrok URLs change on restart
  - Get the new URL from ngrok terminal
  - Update the webhook URL in Facebook settings
  - Consider ngrok paid plan for permanent URLs

## Security Notes

- Never commit `.env` file to version control
- Keep your access tokens secure
- Use HTTPS in production
- Regularly rotate access tokens
