# 🚀 Deploy Your Library Chatbot NOW

Your code is ready! Follow these steps to deploy.

---

## ✅ Step 1: Get Your Free Groq API Key (2 minutes)

1. Go to https://console.groq.com
2. Click "Sign Up" (use Google/GitHub for fastest signup)
3. Once logged in, click "API Keys" in the left menu
4. Click "Create API Key"
5. **Copy the key** (starts with `gsk_...`)

---

## ✅ Step 2: Add API Key Locally (1 minute)

1. Open your `.env` file
2. Replace this line:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```
   With your actual Groq API key (starts with `gsk_`)
3. Save the file

---

## ✅ Step 3: Install Dependencies (1 minute)

Run this command:

```bash
npm install
```

This installs the Groq SDK.

---

## ✅ Step 4: Test Locally (2 minutes)

1. Start your server:
   ```bash
   npm start
   ```

2. Open http://localhost:3000

3. Test the chatbot - ask "What are your library hours?"

4. If it responds, you're good! ✅

---

## ✅ Step 5: Push to GitHub (3 minutes)

```bash
git add .
git commit -m "Switch from Ollama to Groq API for cloud deployment"
git push origin main
```

---

## ✅ Step 6: Deploy to Render (5 minutes)

### If you already have a Render account:

1. Go to https://dashboard.render.com
2. Click your existing service (or create new one)
3. Go to "Environment" tab
4. Add environment variable:
   - **Key**: `GROQ_API_KEY`
   - **Value**: Your actual Groq API key
5. Click "Save Changes"
6. Wait 2-3 minutes for deployment

### If you DON'T have a Render account yet:

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub
4. Click "New +" → "Web Service"
5. Connect your GitHub repository
6. Configure:
   - **Name**: library-chatbot
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

7. Click "Advanced" and add ALL these environment variables:
   ```
   GROQ_API_KEY=<your_groq_api_key>
   FACEBOOK_PAGE_ACCESS_TOKEN=<your_facebook_token>
   FACEBOOK_VERIFY_TOKEN=library123
   FACEBOOK_PAGE_ID=<your_page_id>
   LIBRARIAN_PSID=<your_psid>
   LIBRARIAN_REQUEST_KEYWORD=REQUEST_LIBRARIAN_ACCESS
   PORT=3000
   NODE_ENV=production
   ```

8. Click "Create Web Service"

9. Wait 2-3 minutes for deployment

---

## ✅ Step 7: Get Your Live URL

After deployment, your app will be at:

```
https://library-chatbot-xxxx.onrender.com
```

Copy this URL!

---

## ✅ Step 8: Update Facebook Webhook (2 minutes)

1. Go to Facebook Developer Console
2. Go to your app → Messenger → Settings
3. Update webhook URL to:
   ```
   https://library-chatbot-xxxx.onrender.com/webhook
   ```
4. Verify the webhook
5. Subscribe to page events

---

## 🎉 You're Live!

Your chatbot is now deployed and accessible at:
- **Main Chat**: https://library-chatbot-xxxx.onrender.com
- **Librarian Dashboard**: https://library-chatbot-xxxx.onrender.com/librarian.html
- **Admin Dashboard**: https://library-chatbot-xxxx.onrender.com/admin.html

---

## 📊 What You Get with Groq (FREE):

✅ **14,400 requests/day** = ~2,880 conversations/day  
✅ **Very fast responses** (faster than OpenAI)  
✅ **Same Llama 3.2 model** you were using  
✅ **No credit card required**  
✅ **Works on any cloud platform**

---

## 🆘 Troubleshooting

### "Invalid API Key" error:
- Check that your key starts with `gsk_`
- Make sure it's added to both `.env` (local) and Render (production)
- No extra spaces before/after the key

### "Module not found: groq-sdk":
- Run `npm install` again
- Check that `package.json` has `groq-sdk` listed

### Chatbot not responding:
- Check Render logs for errors
- Verify all environment variables are set
- Make sure the service is running (not sleeping)

### Render app sleeping:
- Free tier apps sleep after 15 minutes of inactivity
- First request after sleep takes 30 seconds to wake up
- This is normal for free tier

---

## 💰 Cost Breakdown

| Item | Cost |
|------|------|
| Groq API | **FREE** (14,400 req/day) |
| Render Hosting | **FREE** (with sleep) |
| Facebook Messenger | **FREE** |
| **Total** | **$0/month** 🎉 |

---

## 🚀 Next Steps After Deployment

1. ✅ Test the live chatbot
2. ✅ Share the URL with your team
3. ✅ Monitor usage in Groq console
4. ✅ Check analytics in admin dashboard
5. ✅ Add more librarians if needed

---

## Need Help?

- **Groq Docs**: https://console.groq.com/docs
- **Render Docs**: https://render.com/docs
- **Your Setup Guide**: See `GROQ_SETUP.md`

---

**Ready to deploy? Start with Step 1!** 🚀
