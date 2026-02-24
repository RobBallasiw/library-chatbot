# How to Run the Library Chatbot System

## Quick Start Guide

### Prerequisites

Before running the system, make sure you have:

1. **Node.js** (v18 or higher) - [Download here](https://nodejs.org)
2. **Ollama** installed and running - [Download here](https://ollama.ai)
3. **LLaMA 3.2 model** pulled in Ollama

### Initial Setup (One-Time)

**1. Install Ollama and the AI Model**

```bash
# After installing Ollama, pull the model:
ollama pull llama3.2
```

**2. Install Dependencies**

```bash
npm install
```

**3. Configure Environment Variables**

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your Facebook credentials (see MESSENGER_SETUP.md for details).

## Running Locally

### Step 1: Start Ollama

Make sure Ollama is running on your machine:

```bash
ollama serve
```

(Or just open the Ollama app - it runs automatically in the background)

### Step 2: Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

### Step 3: Access the System

Open your browser and visit:

- **Main Chat Widget**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3000/admin.html
- **Librarian Dashboard**: http://localhost:3000/librarian.html

## System Components

### 1. User Chat Widget (index.html)

- Floating chat button on your library website
- Users can ask library-related questions
- AI responds automatically
- Users can request human librarian assistance

### 2. Admin Dashboard (admin.html)

- Manage authorized librarians
- Approve/remove librarian access
- View pending access requests
- Generate `.env` configuration

**Access**: http://localhost:3000/admin.html (or your production URL)

### 3. Librarian Dashboard (librarian.html)

- View active conversations
- See pending librarian requests
- Monitor conversation status (bot vs. human)
- Auto-refreshes every 5 seconds

**Access**: http://localhost:3000/librarian.html (or your production URL)

## How the System Works

### User Flow

1. User visits your library website
2. Clicks the floating chat widget
3. Types a question about library services
4. AI chatbot responds instantly
5. If needed, user clicks "Talk to Librarian"
6. Librarian receives notification via Facebook Messenger

### Librarian Access Flow

1. Library staff messages your Facebook Page with: `REQUEST_LIBRARIAN_ACCESS`
2. System sends confirmation message
3. Request appears in Admin Dashboard
4. Admin approves the request
5. Librarian's PSID is added to authorized list
6. Librarian now receives notifications for patron requests

### Notification Flow

1. User requests librarian assistance
2. System sends notification to ALL authorized librarians via Messenger
3. Notification includes:
   - Session ID
   - User's question
   - Conversation history
   - Link to librarian dashboard

## Production Deployment

Your app is deployed at: **https://library-chatbot-4lj1.onrender.com**

### Monitoring Production

1. **Render Dashboard**: https://dashboard.render.com
   - View logs
   - Check deployment status
   - Monitor resource usage

2. **Check if app is running**:
   - Visit: https://library-chatbot-4lj1.onrender.com
   - Should see the chat widget

3. **View logs**:
   - Go to Render dashboard
   - Click on your service
   - Click "Logs" tab

### Important Production Notes

- **Free tier sleeps after 15 minutes** of inactivity
- First request after sleep takes ~30 seconds to wake up
- Conversations are stored in memory (lost on restart)
- For always-on service, upgrade to paid plan

## Managing Librarians

### Adding a Librarian

**Option 1: Via Admin Dashboard (Recommended)**

1. Librarian messages your Facebook Page: `REQUEST_LIBRARIAN_ACCESS`
2. Go to Admin Dashboard: https://library-chatbot-4lj1.onrender.com/admin.html
3. See pending request with their name and PSID
4. Click "Approve"
5. Done! They'll receive notifications

**Option 2: Manual (If webhook isn't working)**

1. Get librarian's PSID from Facebook Page inbox URL
2. Add to Admin Dashboard manually
3. Or add to `.env` file: `LIBRARIAN_PSID=123456,789012,345678`

### Removing a Librarian

1. Go to Admin Dashboard
2. Find the librarian in "Authorized Librarians" list
3. Click "Remove"
4. They'll no longer receive notifications

## Troubleshooting

### Chatbot not responding

**Check:**
- Is Ollama running? (`ollama serve`)
- Is the model pulled? (`ollama pull llama3.2`)
- Check server logs for errors

### Webhook not receiving messages

**Check:**
- Is Facebook webhook configured correctly?
- Is app in "Live" mode (not Development)?
- See FACEBOOK_TROUBLESHOOTING.md for details

### Librarian not getting notifications

**Check:**
- Is their PSID in the authorized list?
- Is `FACEBOOK_PAGE_ACCESS_TOKEN` set correctly?
- Check Render logs for Messenger API errors

### App sleeping on Render

**Solutions:**
- Upgrade to paid plan ($7/month) for always-on
- Use a ping service to keep it awake
- Accept the 30-second wake-up time on free tier

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `FACEBOOK_PAGE_ACCESS_TOKEN` | Token from Facebook Developer Console | Long string starting with `EAAR...` |
| `FACEBOOK_VERIFY_TOKEN` | Custom token for webhook verification | `library123` |
| `FACEBOOK_PAGE_ID` | Your Facebook Page ID | `1027160950479609` |
| `LIBRARIAN_PSID` | Comma-separated PSIDs of authorized librarians | `123456,789012` |
| `LIBRARIAN_REQUEST_KEYWORD` | Keyword for requesting access | `REQUEST_LIBRARIAN_ACCESS` |
| `PORT` | Server port | `3000` |
| `WEBHOOK_URL` | Your production webhook URL | `https://your-app.onrender.com/webhook` |

## Customization

### Change Bot Behavior

Edit `LIBRARY_CONTEXT` in `server.js` to customize:
- What topics the bot can help with
- How it responds to off-topic questions
- When to suggest human librarian

### Change UI Styling

Edit `public/style.css` to customize:
- Colors and branding
- Chat widget position
- Button styles

### Change Access Keyword

Update `LIBRARIAN_REQUEST_KEYWORD` in `.env` to change the keyword librarians use to request access.

## Support & Documentation

- **Setup Guide**: MESSENGER_SETUP.md
- **Deployment Guide**: DEPLOYMENT_GUIDE.md
- **Troubleshooting**: FACEBOOK_TROUBLESHOOTING.md
- **App Review**: APP_REVIEW_CHECKLIST.md

## Quick Commands Reference

```bash
# Install dependencies
npm install

# Start server locally
npm start

# Pull AI model
ollama pull llama3.2

# Start Ollama
ollama serve

# Push to GitHub
git add .
git commit -m "Update"
git push

# View production logs
# Go to: https://dashboard.render.com → Your Service → Logs
```

## System Status Check

To verify everything is working:

1. ✅ Ollama running: Visit http://localhost:11434 (should see "Ollama is running")
2. ✅ Server running: Visit http://localhost:3000 (should see chat widget)
3. ✅ Production running: Visit https://library-chatbot-4lj1.onrender.com
4. ✅ Webhook working: Message your Facebook Page, check logs

---

**Your Production URLs:**
- Main App: https://library-chatbot-4lj1.onrender.com
- Admin Dashboard: https://library-chatbot-4lj1.onrender.com/admin.html
- Librarian Dashboard: https://library-chatbot-4lj1.onrender.com/librarian.html
- Privacy Policy: https://library-chatbot-4lj1.onrender.com/privacy-policy.html
- Terms of Service: https://library-chatbot-4lj1.onrender.com/terms-of-service.html
