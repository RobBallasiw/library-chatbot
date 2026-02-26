# Groq API Setup Guide

## Step 1: Get Your Free Groq API Key

1. Go to https://console.groq.com
2. Click "Sign Up" (or "Sign In" if you have an account)
3. Sign up with Google, GitHub, or email
4. Once logged in, go to "API Keys" section
5. Click "Create API Key"
6. Copy your API key (starts with `gsk_...`)

## Step 2: Add API Key to Your Project

### For Local Development:

1. Open your `.env` file
2. Add this line:
   ```
   GROQ_API_KEY=gsk_your_actual_api_key_here
   ```
3. Save the file

### For Render Deployment:

1. Go to your Render dashboard
2. Select your web service
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Add:
   - **Key**: `GROQ_API_KEY`
   - **Value**: `gsk_your_actual_api_key_here`
6. Click "Save Changes"
7. Your service will automatically redeploy

## Step 3: Install Dependencies

Run this command in your terminal:

```bash
npm install
```

This will install the `groq-sdk` package.

## Step 4: Test Locally

1. Make sure your `.env` file has the `GROQ_API_KEY`
2. Start your server:
   ```bash
   npm start
   ```
3. Open http://localhost:3000
4. Test the chatbot - it should respond using Groq!

## What Changed?

✅ **Removed**: Ollama (local AI)  
✅ **Added**: Groq API (cloud AI)  
✅ **Model**: Using `llama-3.2-90b-text-preview` (same Llama 3.2 family)  
✅ **Speed**: Much faster responses!  
✅ **Cost**: Completely FREE (14,400 requests/day)

## Groq Free Tier Limits

- **14,400 requests per day**
- **30 requests per minute**
- **6,000 tokens per minute**

This is MORE than enough for a library chatbot!

## Troubleshooting

### Error: "Invalid API Key"
- Check that your API key starts with `gsk_`
- Make sure there are no extra spaces
- Verify the key is added to `.env` file

### Error: "Rate limit exceeded"
- You've hit the 30 requests/minute limit
- Wait 1 minute and try again
- Very unlikely for normal usage

### Error: "Module not found: groq-sdk"
- Run `npm install` to install dependencies
- Make sure `package.json` has `groq-sdk` listed

## Benefits of Groq

✅ **Free forever** (not a trial)  
✅ **Very fast** (faster than OpenAI)  
✅ **Same model** (Llama 3.2)  
✅ **Works on any hosting** (Render, Vercel, Railway)  
✅ **No local setup** needed  
✅ **Reliable** and production-ready

## Next Steps

1. ✅ Get Groq API key
2. ✅ Add to `.env` file
3. ✅ Run `npm install`
4. ✅ Test locally
5. ✅ Deploy to Render
6. ✅ Add API key to Render environment variables

You're all set! 🚀
