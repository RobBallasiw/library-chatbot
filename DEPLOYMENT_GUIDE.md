# Deploy to Render (Free, No Credit Card Required)

Render is a free hosting platform that doesn't require payment verification.

## Step 1: Prepare Your Project

Create a `render.yaml` file in your project root:

Already created! ✅

## Step 2: Create a Render Account

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub, GitLab, or email
4. No credit card required!

## Step 3: Push to GitHub

1. Create a GitHub account if you don't have one: https://github.com
2. Create a new repository
3. Push your code:

```cmd
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/library-chatbot.git
git push -u origin main
```

## Step 4: Deploy on Render

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: library-chatbot
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

5. Click "Advanced" and add environment variables:
   - `FACEBOOK_PAGE_ACCESS_TOKEN`: [your token]
   - `FACEBOOK_VERIFY_TOKEN`: library123
   - `FACEBOOK_PAGE_ID`: [your page id]
   - `LIBRARIAN_PSID`: [your psid]
   - `LIBRARIAN_REQUEST_KEYWORD`: REQUEST_LIBRARIAN_ACCESS
   - `PORT`: 3000

6. Click "Create Web Service"

## Step 5: Get Your URLs

After deployment (takes 2-3 minutes), your app will be at:
- **Main URL**: `https://library-chatbot.onrender.com`
- **Privacy Policy**: `https://library-chatbot.onrender.com/privacy-policy.html`
- **Terms of Service**: `https://library-chatbot.onrender.com/terms-of-service.html`

## Step 6: Update Facebook Webhook

1. Go to Facebook Developer Console
2. Update webhook URL to: `https://library-chatbot.onrender.com/webhook`
3. Verify the webhook

## Alternative: Railway (Also Free)

If you prefer Railway:

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variables
6. Deploy!

Your URL will be: `https://library-chatbot.up.railway.app`

## Alternative: Vercel (Free, Very Fast)

Vercel is great but requires some configuration for Node.js servers:

1. Go to https://vercel.com
2. Sign up with GitHub
3. Import your repository
4. Configure as Node.js project
5. Deploy!

Your URL will be: `https://library-chatbot.vercel.app`

## Which Should You Choose?

- **Render**: Best for this project, easy setup, free forever
- **Railway**: Good alternative, $5 free credit monthly
- **Vercel**: Fast but requires more configuration for backend

## Important Notes

- Free tier apps may sleep after inactivity (takes 30 seconds to wake up)
- For production, consider upgrading to paid tier for better performance
- Keep your environment variables secure
- Update your webhook URL after deployment

## Troubleshooting

**App won't start:**
- Check logs in Render dashboard
- Verify all environment variables are set
- Make sure `package.json` has correct start script

**Webhook not working:**
- Verify webhook URL is correct
- Check that HTTPS is used (not HTTP)
- Test webhook with Facebook's test tool

**Environment variables not working:**
- Make sure they're added in Render dashboard
- Restart the service after adding variables
- Check for typos in variable names
