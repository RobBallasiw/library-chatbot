import express from 'express';
import Groq from 'groq-sdk';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

console.log('✅ pdfjs-dist loaded successfully');

// Trust proxy - required for rate limiting behind Render's proxy
app.set('trust proxy', 1);

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Enable gzip compression
app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased to 500 requests per 15 minutes to handle polling
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost ONLY in development
    if (process.env.NODE_ENV === 'production') {
      return false; // Never skip in production
    }
    const ip = req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 60 seconds
  max: 50, // 50 messages per minute (very generous)
  message: 'Too many messages, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost in development
    if (process.env.NODE_ENV !== 'production') {
      const ip = req.ip || req.connection.remoteAddress;
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
        return true;
      }
    }
    return false;
  }
});

const librarianLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Very generous limit - 1000 requests per minute
  message: 'Too many requests. Please wait a moment.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for localhost ONLY in development
    if (process.env.NODE_ENV === 'production') {
      return false; // Never skip in production
    }
    const ip = req.ip || req.connection.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 feedback actions per minute
  message: 'Too many feedback requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false
});

// Increase body size limit to handle file uploads (10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}));

// Apply rate limiting to API routes
// Order matters: more specific routes first, then general
// Removed chat rate limiting - too restrictive for normal conversation
// app.use('/api/chat', chatLimiter); // Disabled - causing UX issues
app.use('/api/librarian/*', librarianLimiter); // Generous limit for librarians
app.use('/api/admin/*', librarianLimiter); // Generous limit for admin
app.use('/api/conversation/*', librarianLimiter); // Generous limit for conversation endpoints
app.use('/api/canned-responses', librarianLimiter); // Generous limit for canned responses
app.use('/api/feedback/*', feedbackLimiter); // Rate limit feedback endpoints
app.use('/api/analytics/*', feedbackLimiter); // Rate limit analytics tracking
app.use('/api/*', apiLimiter); // Default limit for other endpoints

// Configuration Constants
const POLLING_INTERVALS = {
  LIBRARIAN_DASHBOARD: 2000,      // 2 seconds
  USER_CHAT: 3000,                // 3 seconds
  ADMIN_DASHBOARD: 30000,         // 30 seconds (reduced from 10s)
  CONVERSATION_REFRESH: 2000      // 2 seconds
};

const CLEANUP_INTERVALS = {
  OLD_CONVERSATIONS: 15 * 60 * 1000,  // 15 minutes (reduced from 1 hour)
  CLOSED_SESSIONS: 60 * 60 * 1000,    // 1 hour
  INACTIVE_BOTS: 24 * 60 * 60 * 1000  // 24 hours
};

const LIMITS = {
  MAX_CONVERSATIONS: 1000,
  MAX_NOTIFICATIONS: 50,
  MAX_MESSAGE_LENGTH: 5000,
  CONVERSATION_HISTORY: 20  // Increased from 10 for better context
};

const TIMEOUTS = {
  COUNTDOWN_WARNING: 10,  // 10 seconds
  REFRESH_DELAY: 100      // 100ms
};

/**
 * CONVERSATION STATUS STATE MACHINE
 * 
 * Status transitions:
 * - bot → viewed (when librarian views conversation)
 * - bot → human (when user requests librarian)
 * - human → responded (when librarian sends first reply)
 * - responded → human (when user replies back)
 * - any → closed (when librarian ends session)
 * 
 * Status meanings:
 * - bot: AI assistant handling conversation
 * - viewed: Librarian has viewed but not responded
 * - human: User requested librarian, waiting for response
 * - responded: Librarian has replied, conversation active
 * - closed: Session ended by librarian
 */

// Logger utility - only log in development
const logger = {
  log: process.env.NODE_ENV === 'production' ? () => {} : console.log,
  error: console.error,
  warn: console.warn,
  info: console.info
};

// Librarian data file
const LIBRARIAN_DATA_FILE = path.join(__dirname, 'librarian-data.json');
const CANNED_RESPONSES_FILE = path.join(__dirname, 'canned-responses.json');
const AI_SETTINGS_FILE = path.join(__dirname, 'ai-settings.json');
const EVENTS_FILE = path.join(__dirname, 'library-events.json');
const ANALYTICS_FILE = path.join(__dirname, 'document-analytics.json');

// Load canned responses
function loadCannedResponses() {
  try {
    if (fs.existsSync(CANNED_RESPONSES_FILE)) {
      const data = JSON.parse(fs.readFileSync(CANNED_RESPONSES_FILE, 'utf8'));
      logger.log('✅ Loaded canned responses:', data.categories.length, 'categories');
      return data;
    }
  } catch (error) {
    logger.error('⚠️  Error loading canned responses:', error.message);
  }
  
  return { categories: [] };
}

// Save canned responses
function saveCannedResponses(data) {
  try {
    fs.writeFileSync(CANNED_RESPONSES_FILE, JSON.stringify(data, null, 2));
    logger.log('✅ Saved canned responses');
    return true;
  } catch (error) {
    logger.error('❌ Error saving canned responses:', error.message);
    return false;
  }
}

// Load AI settings
function loadAISettings() {
  try {
    if (fs.existsSync(AI_SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(AI_SETTINGS_FILE, 'utf8'));
      console.log('✅ Loaded custom AI settings');
      return data;
    }
  } catch (error) {
    console.error('⚠️  Error loading AI settings:', error.message);
  }
  
  return {
    customPrompt: null,
    useCustomPrompt: false,
    customContext: null,
    useCustomContext: false,
    lastUpdated: null
  };
}

// Save AI settings
function saveAISettings(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(AI_SETTINGS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Saved AI settings');
    return true;
  } catch (error) {
    console.error('❌ Error saving AI settings:', error.message);
    return false;
  }
}

// Load library events
function loadEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      console.log('✅ Loaded library events:', data.events.length);
      return data;
    }
  } catch (error) {
    console.error('⚠️  Error loading events:', error.message);
  }
  return { events: [], featured: [] };
}

// Save library events
function saveEvents(data) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Saved library events');
    return true;
  } catch (error) {
    console.error('❌ Error saving events:', error.message);
    return false;
  }
}

// Load document analytics
function loadAnalytics() {
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
      console.log('✅ Loaded document analytics');
      return data;
    }
  } catch (error) {
    console.error('⚠️  Error loading analytics:', error.message);
  }
  return { 
    documentViews: {}, 
    searchTerms: {},
    helpfulResponses: [],
    trending: []
  };
}

// Save document analytics
function saveAnalytics(data) {
  try {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error saving analytics:', error.message);
    return false;
  }
}

// Load or initialize librarian data
function loadLibrarianData() {
  try {
    if (fs.existsSync(LIBRARIAN_DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIBRARIAN_DATA_FILE, 'utf8'));
      console.log('✅ Loaded librarian data from file:', data.authorizedPsids.length, 'authorized');
      return data;
    }
  } catch (error) {
    console.error('⚠️  Error loading librarian data:', error.message);
  }
  
  // Initialize with .env data if file doesn't exist
  const envPsids = process.env.LIBRARIAN_PSID 
    ? process.env.LIBRARIAN_PSID.split(',').map(id => id.trim()).filter(id => id)
    : [];
  
  console.log('📝 Initializing librarian data with', envPsids.length, 'PSIDs from .env');
  
  return {
    authorizedPsids: envPsids,
    lastUpdated: new Date().toISOString()
  };
}

// Save librarian data
function saveLibrarianData(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(LIBRARIAN_DATA_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Saved librarian data to file');
    return true;
  } catch (error) {
    console.error('❌ Error saving librarian data:', error.message);
    return false;
  }
}

// Initialize librarian data
let librarianData = loadLibrarianData();
let cannedResponses = loadCannedResponses();
let aiSettings = loadAISettings();
let libraryEvents = loadEvents();
let documentAnalytics = loadAnalytics();

// Cleanup old conversations to prevent memory leaks
function cleanupOldConversations() {
  const now = Date.now();
  let cleaned = 0;
  const deletedSessions = [];
  
  // HARD LIMIT ENFORCEMENT: If over limit, force immediate cleanup
  if (conversations.size > LIMITS.MAX_CONVERSATIONS) {
    console.log(`⚠️ Conversation limit exceeded (${conversations.size}/${LIMITS.MAX_CONVERSATIONS}), forcing aggressive cleanup`);
    
    // Sort conversations by age and delete oldest until under limit
    const sortedConvs = Array.from(conversations.entries())
      .sort((a, b) => new Date(a[1].startTime) - new Date(b[1].startTime));
    
    const toDelete = conversations.size - LIMITS.MAX_CONVERSATIONS + 100; // Delete extra 100 for buffer
    for (let i = 0; i < toDelete && i < sortedConvs.length; i++) {
      const sessionId = sortedConvs[i][0];
      conversations.delete(sessionId);
      deletedSessions.push(sessionId);
      cleaned++;
    }
    
    console.log(`🗑️ Emergency cleanup: deleted ${cleaned} oldest conversations`);
  }
  
  // Regular cleanup
  for (const [sessionId, conv] of conversations.entries()) {
    const age = now - new Date(conv.startTime).getTime();
    
    // Delete closed conversations older than 1 hour
    if (conv.status === 'closed' && age > CLEANUP_INTERVALS.CLOSED_SESSIONS) {
      conversations.delete(sessionId);
      deletedSessions.push(sessionId);
      cleaned++;
    }
    
    // Delete inactive bot conversations older than 24 hours
    if (conv.status === 'bot' && age > CLEANUP_INTERVALS.INACTIVE_BOTS) {
      conversations.delete(sessionId);
      deletedSessions.push(sessionId);
      cleaned++;
    }
  }
  
  // Clean up typing status for deleted conversations
  for (const sessionId of deletedSessions) {
    if (typingStatus.has(sessionId)) {
      typingStatus.delete(sessionId);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🗑️ Cleaned up ${cleaned} old conversations (${conversations.size} remaining)`);
  }
}

// Run cleanup every 15 minutes (reduced from 1 hour)
setInterval(cleanupOldConversations, CLEANUP_INTERVALS.OLD_CONVERSATIONS);

// Store active conversations and their status
const conversations = new Map();
// sessionId -> { status: 'bot'|'human'|'responded', messages: [], userId: null, startTime: Date, assignedTo: null, assignedAt: null }

// Store typing status for real-time indicators
const typingStatus = new Map();
// sessionId -> { user: { isTyping: boolean, lastUpdate: Date }, librarian: { isTyping: boolean, lastUpdate: Date } }

// Auto-clear typing status after 5 seconds of inactivity
setInterval(() => {
  const now = Date.now();
  const TYPING_TIMEOUT = 5000; // 5 seconds
  
  for (const [sessionId, status] of typingStatus.entries()) {
    if (status.user.isTyping && (now - status.user.lastUpdate.getTime()) > TYPING_TIMEOUT) {
      status.user.isTyping = false;
    }
    if (status.librarian.isTyping && (now - status.librarian.lastUpdate.getTime()) > TYPING_TIMEOUT) {
      status.librarian.isTyping = false;
    }
    
    // Remove entry if both are not typing
    if (!status.user.isTyping && !status.librarian.isTyping) {
      typingStatus.delete(sessionId);
    }
  }
}, 2000); // Check every 2 seconds

// Store pending librarian requests
const pendingLibrarianRequests = new Map();
// psid -> { psid, lastMessage: Date, messageCount: number, name: string }

// Store librarian profile info cache
const librarianProfiles = new Map();
// psid -> { name: string, profilePic: string }

// Analytics data
const analytics = {
  totalConversations: 0,
  totalMessages: 0,
  librarianRequests: 0,
  averageResponseTime: 0,
  conversationsByStatus: { bot: 0, human: 0, responded: 0, viewed: 0, closed: 0 },
  messagesPerDay: {},
  conversationsPerDay: {},
  responseTimeHistory: [],
  startTime: new Date()
};

// Track analytics
function trackConversationStart(sessionId) {
  analytics.totalConversations++;
  const today = new Date().toISOString().split('T')[0];
  analytics.conversationsPerDay[today] = (analytics.conversationsPerDay[today] || 0) + 1;
  logger.log('📊 New conversation tracked:', sessionId);
}

function trackMessage() {
  analytics.totalMessages++;
  const today = new Date().toISOString().split('T')[0];
  analytics.messagesPerDay[today] = (analytics.messagesPerDay[today] || 0) + 1;
}

function trackLibrarianRequest() {
  analytics.librarianRequests++;
}

function trackResponseTime(sessionId, responseTime) {
  analytics.responseTimeHistory.push({
    sessionId,
    responseTime,
    timestamp: new Date()
  });
  
  // Keep only last 100 response times
  if (analytics.responseTimeHistory.length > 100) {
    analytics.responseTimeHistory.shift();
  }
  
  // Calculate average
  const sum = analytics.responseTimeHistory.reduce((acc, item) => acc + item.responseTime, 0);
  analytics.averageResponseTime = Math.round(sum / analytics.responseTimeHistory.length);
}

function updateStatusCounts() {
  analytics.conversationsByStatus = { bot: 0, human: 0, responded: 0, viewed: 0, closed: 0 };
  for (const conv of conversations.values()) {
    analytics.conversationsByStatus[conv.status] = (analytics.conversationsByStatus[conv.status] || 0) + 1;
  }
}

// Fetch user profile from Facebook Graph API
async function fetchUserProfile(psid, forceRefresh = false) {
  // Check cache first (unless force refresh)
  if (!forceRefresh && librarianProfiles.has(psid)) {
    return librarianProfiles.get(psid);
  }

  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    console.log('⚠️  No Facebook token, returning default profile for:', psid);
    return { name: 'Librarian ' + psid.substring(0, 8), profilePic: null };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${psid}?fields=name,profile_pic&access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
    console.log('🔍 Fetching profile for PSID:', psid);
    const response = await axios.get(url);
    
    console.log('📦 Facebook API response:', JSON.stringify(response.data, null, 2));
    
    const profile = {
      name: response.data.name || 'Unknown',
      profilePic: response.data.profile_pic || null
    };
    
    console.log('✅ Profile created:', profile);
    
    // Cache it
    librarianProfiles.set(psid, profile);
    
    return profile;
  } catch (error) {
    console.error('❌ Error fetching user profile for', psid);
    console.error('   Error type:', error.response?.status);
    console.error('   Error message:', error.response?.data?.error?.message || error.message);
    console.error('   Full error:', JSON.stringify(error.response?.data, null, 2));
    
    // Return a default profile instead of failing
    const defaultProfile = { name: 'Librarian ' + psid.substring(0, 8), profilePic: null };
    librarianProfiles.set(psid, defaultProfile);
    return defaultProfile;
  }
}

const LIBRARY_CONTEXT = `You are a helpful library assistant chatbot. Your ONLY purpose is to help with library-related topics.

CRITICAL FORMATTING REQUIREMENTS (FOLLOW EXACTLY):
When providing information with multiple items (hours, lists, schedules):
1. Put each item on a NEW LINE
2. Add a BLANK LINE between different sections
3. Use bullet points (•) or dashes (-) for lists
4. Use **bold** for labels and important info

EXAMPLE - Library Hours (COPY THIS FORMAT):
Our library hours:

**Monday - Friday:**
7:00 AM - 7:00 PM

**Saturday:**
8:30 AM - 5:30 PM

**Sunday:**
Closed

We're closed on public holidays.

EXAMPLE - List Format:
Available services:

• Book borrowing
• Computer access
• Printing services
• Study rooms

CRITICAL RULES:
- NEVER discuss personal, emotional, or mental health topics
- NEVER provide counseling, emotional support, or personal advice
- NEVER engage with off-topic conversations about non-library topics
- IMMEDIATELY redirect to library services ONLY
- BE DIRECT: Don't ask unnecessary clarifying questions if the user's intent is clear
- PROVIDE INFORMATION: If you have relevant information, share it immediately
- KEEP IT SHORT: Give concise, helpful answers
- ALWAYS use proper line breaks and spacing

LANGUAGE RULE:
- You MUST respond ONLY in ENGLISH
- Even if the user writes in another language (Tagalog, Spanish, etc.), respond in ENGLISH
- Politely inform non-English speakers that you only communicate in English

YOU CAN HELP WITH:
- Finding books, journals, textbooks, and digital resources IN THE LIBRARY
- Student solutions manuals, answer keys, and study guides
- Previous exam papers, past student work (if available in library)
- Course materials, required readings, and reference materials
- Library hours, locations, and policies
- Account information, holds, and renewals
- Research assistance and citation help
- Computer, printing, and study room services
- Library events, programs, and workshops
- Membership and library card information

RESPONSE STYLE:
- BE DIRECT: If you have the information, provide it immediately
- DON'T ASK: Avoid asking clarifying questions unless absolutely necessary
- BE HELPFUL: Assume the user wants the most relevant information
- BE BRIEF: Keep responses concise and to the point
- ONLY MENTION UPLOADED DOCUMENTS: Never make up or suggest books that aren't in the system
- IF NO DOCUMENTS: Be honest that no digital documents are available yet

WHEN LISTING AVAILABLE DOCUMENTS:
- ONLY list documents that have been uploaded to the knowledge base
- Format: Simple numbered list with title and type
- Example: "Here are the documents currently available:\n1. OJT Journal Format (PDF, 45KB)\n2. Library Policy Manual (Text, 12KB)"
- DON'T mention generic categories or make up titles
- DON'T say "we have a wide range" if you don't have specific documents

EXAMPLES OF GOOD RESPONSES:
User: "what books do you have?"
Bot (if documents uploaded): "Here are the documents currently available in our digital library:\n1. OJT Journal Format (PDF)\n2. CCSE Course Guide (PDF)\n3. Library Hours Policy (Text)\n\nWould you like more information about any of these?"

Bot (if NO documents): "We don't have any digital documents uploaded to the system yet. However, I can help you with information about our physical library collection, hours, services, or you can speak with a librarian for assistance."

User: "ojt journal format for ccse"
Bot: "Yes! We have an OJT journal format for CCSE students. It includes daily log templates with fields for date, activities, hours worked, and supervisor's signature. The format follows the standard OJT documentation requirements. Would you like me to provide more details about the format?"

User: "library hours"
Bot: "Our library is open Monday-Friday 8am-10pm, Saturday 9am-6pm, and Sunday 10am-5pm. We're closed on public holidays."

EXAMPLES OF BAD RESPONSES (TOO MANY QUESTIONS):
❌ "Can you please provide more information about what you're looking for?"
❌ "Is this a specific format or template required by your school?"
❌ "What specific information are you looking for?"
❌ "Are you looking for a physical copy or online version?"

INSTEAD, BE DIRECT:
✅ "Yes, we have that! Here's what I found..."
✅ "We have several options available..."
✅ "Based on your question, here's the most relevant information..."

YOU MUST NEVER HELP WITH:
- Personal problems, emotional issues, mental health, relationships
- Questions clearly unrelated to library (cars, concrete, shopping, construction)
- Personal advice, medical, legal, or financial topics
- Technical support for personal devices
- Actually doing homework (but CAN help find resources)
- Finding things that are clearly NOT library resources

HANDLING OFF-TOPIC REQUESTS:
- Personal/emotional topics: "I'm a library assistant and can only help with library services. How can I help you find books or resources?"
- Inappropriate behavior: "I can only help with library-related questions. Please ask respectfully about our books, services, or resources."
- Crisis situations: Already handled by server - should not reach you

If user writes in a non-English language, respond:
"I apologize, but I can only communicate in English. Please ask your question in English, or you can request to speak with a librarian for assistance in other languages."

If you cannot fully help with a LIBRARY question, suggest: "Would you like to speak with a librarian? They can provide more personalized assistance."

BE HELPFUL, DIRECT, and BRIEF. Focus on providing information, not asking questions.`;


// Store librarian notifications in memory (in production, use a database)
const librarianNotifications = [];

// Track librarian last activity for 24-hour window reminders
const librarianActivity = new Map(); // psid -> { lastMessageTime: Date, reminderSent: boolean }

// Get list of authorized librarian PSIDs
function getAuthorizedLibrarians() {
  return librarianData.authorizedPsids || [];
}

// Check if a PSID is an authorized librarian
function isAuthorizedLibrarian(psid) {
  const authorizedPsids = getAuthorizedLibrarians();
  return authorizedPsids.includes(psid);
}

// Update librarian activity when they message the page
function updateLibrarianActivity(psid) {
  librarianActivity.set(psid, {
    lastMessageTime: new Date(),
    reminderSent: false
  });
  console.log(`📝 Updated activity for librarian ${psid}`);
}

// Check and send reminders to librarians before 24-hour window expires
async function checkLibrarianReminders() {
  const now = new Date();
  const authorizedLibrarians = getAuthorizedLibrarians();
  
  for (const psid of authorizedLibrarians) {
    const activity = librarianActivity.get(psid);
    
    if (!activity) continue; // No activity recorded yet
    
    const hoursSinceLastMessage = (now - activity.lastMessageTime) / (1000 * 60 * 60);
    
    // Send reminder after 23 hours (1 hour before window closes)
    if (hoursSinceLastMessage >= 23 && !activity.reminderSent) {
      try {
        const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
        
        await axios.post(url, {
          recipient: { id: psid },
          message: {
            text: `⏰ Reminder: Your 24-hour messaging window will expire in ~1 hour.\n\nTo continue receiving librarian notifications, please send any message to this page.\n\n💡 Tip: Just reply "Hi" to keep notifications active!`
          }
        });
        
        activity.reminderSent = true;
        console.log(`✅ Reminder sent to librarian ${psid}`);
      } catch (error) {
        console.error(`❌ Error sending reminder to ${psid}:`, error.response?.data || error.message);
      }
    }
    
    // Reset reminder flag after 24 hours
    if (hoursSinceLastMessage >= 24) {
      activity.reminderSent = false;
    }
  }
}

// Check reminders every hour
setInterval(checkLibrarianReminders, 60 * 60 * 1000); // Every 1 hour

// Facebook Messenger API helper - Send to authorized librarians only
async function sendToMessenger(message, conversationData) {
  // Store notification for librarian dashboard
  librarianNotifications.push({
    sessionId: conversationData.sessionId,
    message: message,
    timestamp: new Date(),
    conversationHistory: conversationData.messages || []
  });

  // Keep only last 50 notifications
  if (librarianNotifications.length > LIMITS.MAX_NOTIFICATIONS) {
    librarianNotifications.shift();
  }

  console.log('📬 New librarian request:', {
    sessionId: conversationData.sessionId,
    message: message.substring(0, 100)
  });

  // Send to Messenger if configured
  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    console.log('⚠️  Messenger not configured. Set FACEBOOK_PAGE_ACCESS_TOKEN in .env file');
    return;
  }

  const authorizedLibrarians = getAuthorizedLibrarians();
  
  if (authorizedLibrarians.length === 0) {
    console.log('⚠️  No authorized librarians configured. Set LIBRARIAN_PSID in .env file');
    return;
  }

  // Send notification to all authorized librarians
  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
  
  for (const librarianPsid of authorizedLibrarians) {
    try {
      const baseUrl = process.env.WEBHOOK_URL?.replace('/webhook', '') || 'http://localhost:3000';
      
      await axios.post(url, {
        recipient: { id: librarianPsid },
        message: {
          text: `🔔 New Librarian Request!\n\nSession: ${conversationData.sessionId}\n\n${message}\n\n📱 Mobile: ${baseUrl}/librarian-mobile\n💻 Desktop: ${baseUrl}/librarian`
        }
      });

      console.log(`✅ Messenger notification sent to librarian: ${librarianPsid}`);
    } catch (error) {
      console.error(`❌ Error sending to librarian ${librarianPsid}:`, error.response?.data || error.message);
      if (error.response?.data) {
        console.error('Full error details:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], sessionId, attachment } = req.body;
    
    const startTime = Date.now();
    
    // Get or create conversation FIRST (before any validation)
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, {
        status: 'bot',
        messages: [],
        userId: null,
        startTime: new Date(),
        assignedTo: null,
        assignedAt: null
      });
      trackConversationStart(sessionId);
      console.log(`📝 Created new conversation: ${sessionId}`);
    }

    const conversation = conversations.get(sessionId);
    
    // Check if attachment is an image for recognition
    let imageAnalysis = null;
    if (attachment && attachment.type && attachment.type.startsWith('image/')) {
      console.log('🖼️ Image detected, analyzing with AI...');
      try {
        // Use Groq's vision model to analyze the image
        const visionResponse = await groq.chat.completions.create({
          model: 'llama-3.2-11b-vision-preview',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'You are a library assistant. Analyze this image and describe what you see. If it\'s a book cover, identify the title, author, and any other relevant information. If it\'s a document or page, describe its content. Be specific and helpful.'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: attachment.data
                  }
                }
              ]
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        });
        
        imageAnalysis = visionResponse.choices[0].message.content;
        console.log('✅ Image analysis complete:', imageAnalysis.substring(0, 100));
      } catch (error) {
        console.error('❌ Error analyzing image:', error.message);
        imageAnalysis = 'I can see you\'ve shared an image, but I\'m having trouble analyzing it right now. Could you describe what you\'re looking for?';
      }
    }
    
    // Crisis detection - immediate response with resources
    const crisisPatterns = [
      /\b(suicide|kill myself|end my life|want to die|hurt myself|self harm)\b/i,
      /\b(depressed|depression|anxiety|mental health)\b/i,
      /\bcall 911\b/i
    ];
    
    const isCrisis = crisisPatterns.some(pattern => pattern.test(message));
    
    if (isCrisis) {
      const crisisResponse = "I'm a library assistant and can't help with personal or mental health issues. If you're in crisis, please contact:\n\n• National Suicide Prevention Lifeline: 1-800-273-8255\n• Crisis Text Line: Text HOME to 741741\n• Emergency Services: 911\n\nFor library services, I'm here to help with books, research, and resources.";
      
      res.json({
        response: crisisResponse,
        success: true,
        status: 'bot'
      });
      return;
    }
    
    // Content filtering - detect inappropriate or off-topic content
    const inappropriatePatterns = [
      /\b(fuck|shit|bitch|ass|damn|cunt|dick|pussy|cock)\b/i,
      /\b(sex|cum|porn|xxx|nude|naked)\b/i,
      /daddy/i
    ];
    
    const offTopicPatterns = [
      /\b(bullied|bullying|lonely|sad|talk to|someone to talk|emotional|feelings)\b/i,
      /\b(relationship|dating|friend|boyfriend|girlfriend)\b/i
    ];
    
    const isInappropriate = inappropriatePatterns.some(pattern => pattern.test(message));
    const isOffTopic = offTopicPatterns.some(pattern => pattern.test(message));
    
    if (isInappropriate) {
      const warningResponse = "I can only help with library-related questions. Please ask respectfully about our books, services, or resources.";
      
      res.json({
        response: warningResponse,
        success: true,
        status: 'bot'
      });
      return;
    }
    
    if (isOffTopic) {
      const redirectResponse = "I'm a library assistant and can only help with library services like finding books, research assistance, library hours, and resources. For personal matters, please reach out to appropriate support services. How can I help you with library-related questions?";
      
      res.json({
        response: redirectResponse,
        success: true,
        status: 'bot'
      });
      return;
    }
    
    // Create message object with attachment if present
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const userMessage = { 
      id: messageId,
      role: 'user', 
      content: message, 
      timestamp: new Date() 
    };
    
    if (attachment) {
      userMessage.attachment = {
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        data: attachment.data
      };
      console.log('📎 User attached file:', attachment.name);
    }
    
    // If we have image analysis, prepend it to the message
    let effectiveMessage = message;
    if (imageAnalysis) {
      effectiveMessage = `[User shared an image. AI Analysis: ${imageAnalysis}]\n\nUser's message: ${message || 'What can you tell me about this image?'}`;
      console.log('🖼️ Including image analysis in conversation');
    }
    
    conversation.messages.push(userMessage);
    trackMessage();
    
    console.log(`💬 Message saved to conversation ${sessionId}:`, {
      totalMessages: conversation.messages.length,
      status: conversation.status,
      latestMessage: message.substring(0, 50)
    });

    // Cancel countdown if it exists (do this FIRST, before status checks)
    if (conversation.countdown) {
      delete conversation.countdown;
      console.log('⏹️ Countdown cancelled - user sent a message');
    }

    // If conversation is with human librarian or closed, don't send bot response
    if (conversation.status === 'human' || conversation.status === 'responded' || conversation.status === 'closed') {
      // If closed, reopen the conversation since user is still chatting
      if (conversation.status === 'closed') {
        console.log('🔄 Reopening closed conversation - user sent message');
        conversation.status = 'human';
        
        // Notify librarian
        await sendToMessenger(
          `User sent a new message in previously closed session ${sessionId}:\n\n${message}`,
          { sessionId, ...conversation }
        );
        
        res.json({
          response: null,
          success: true,
          status: 'human'
        });
        return;
      }
      
      // Change status back to 'human' (waiting) since user sent a new message
      conversation.status = 'human';
      
      // Notify librarian of new message
      await sendToMessenger(
        `New message from user in session ${sessionId}:\n\n${message}`,
        { sessionId, ...conversation }
      );
      
      // Don't send any response - user will see librarian's reply via polling
      res.json({
        response: null,
        success: true,
        status: 'human'
      });
      return;
    }

    // Bot response using Groq API
    // Use custom prompt if enabled, otherwise use default
    const systemPrompt = (aiSettings.useCustomPrompt && aiSettings.customPrompt) 
      ? aiSettings.customPrompt 
      : LIBRARY_CONTEXT;
    
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add custom context if enabled
    if (aiSettings.useCustomContext && aiSettings.customContext) {
      messages.push({
        role: 'system',
        content: `ADDITIONAL LIBRARY INFORMATION:\n\n${aiSettings.customContext}\n\nUse this information to answer user questions when relevant. This is official library information that you should reference.`
      });
      console.log('📝 Added custom context to AI');
    }
    
    // RAG: Search knowledge base for relevant information
    const knowledgeResults = searchKnowledgeBase(effectiveMessage);
    
    // Check if user is asking for a general list of available documents
    const isGeneralQuery = /what (books|documents|files|pdfs|materials|resources).*(do you have|available|got)/i.test(effectiveMessage) ||
                          /list (all|available|your) (books|documents|files|pdfs)/i.test(effectiveMessage) ||
                          /show me (all|available|your) (books|documents|files|pdfs)/i.test(effectiveMessage);
    
    if (isGeneralQuery && knowledgeBase.documents.length > 0) {
      // User wants a list of all available documents
      const categoryLabels = {
        'ebook': '📚 eBook',
        'journal': '📓 Journal',
        'manual': '📖 Manual',
        'policy': '📋 Policy',
        'form': '📄 Form',
        'syllabus': '📝 Syllabus',
        'research': '🔬 Research',
        'reference': '📚 Reference',
        'other': '📁 Other'
      };
      
      const documentList = knowledgeBase.documents.map((doc, index) => {
        const category = categoryLabels[doc.category] || categoryLabels['other'];
        const fileType = doc.type === 'application/pdf' ? 'PDF' : 'Text';
        return `${index + 1}. ${doc.title} - ${category} (${fileType}, ${Math.round(doc.size / 1024)}KB)`;
      }).join('\n');
      
      messages.push({
        role: 'system',
        content: `The user is asking for a list of available documents. Here are ALL the documents currently in our library system:\n\n${documentList}\n\nProvide this list to the user in a simple, clear format. Don't make up or mention any other books. ONLY list these documents.`
      });
      
      console.log(`📚 Providing full document list (${knowledgeBase.documents.length} documents)`);
    } else if (knowledgeResults.length > 0) {
      // User is searching for specific documents
      const knowledgeContext = knowledgeResults.map(r => 
        `From "${r.title}":\n${r.excerpt}`
      ).join('\n\n');
      
      messages.push({
        role: 'system',
        content: `Here is relevant information from our knowledge base that may help answer the user's question:\n\n${knowledgeContext}\n\nIMPORTANT: You have access to these documents in our library system. When relevant, you should:\n1. Provide a brief summary or preview of the document content\n2. Mention that the full document is available\n3. Tell the user they can request to view or download the full document\n4. Be specific about what's in the document\n\nExample: "Yes, we have the OJT Journal Format document! It includes daily log templates, weekly reflection sheets, and guidelines for documenting your on-the-job training activities. Would you like me to show you a preview or would you prefer to view the full document?"`
      });
      
      console.log(`📚 RAG: Found ${knowledgeResults.length} relevant documents`);
    } else if (knowledgeBase.documents.length === 0) {
      // No documents in knowledge base
      messages.push({
        role: 'system',
        content: `IMPORTANT: The library's digital document collection is currently empty. No books, PDFs, or documents have been uploaded yet. If the user asks about available books or documents, tell them honestly that no digital documents are currently available in the system, but they can speak with a librarian for assistance with physical books or other resources.`
      });
      
      console.log(`⚠️ No documents in knowledge base`);
    }
    
    const recentHistory = history.slice(-LIMITS.CONVERSATION_HISTORY);
    messages.push(...recentHistory);
    messages.push({ role: 'user', content: effectiveMessage });

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 0.9
    });

    const botResponse = response.choices[0].message.content;
    
    // Validation: Check if bot response contains forbidden content or non-English
    const forbiddenPatterns = [
      /\bP\s*\d+\.?\d*\s*(kila|per|each|unit)/i, // Prices with units
      /\b(price|presyo|halaga)\s*[:=]\s*P?\s*\d+/i, // Price listings
      /\b(concrete|semento)\s+(block|slab|mix)/i, // Construction materials
      /\b(supplier|tindahan|store)\s+(ng|of|for)\s+(bato|concrete)/i, // Suppliers
      /\bDPWH\b/i, // Department of Public Works
      /\b(bili|buy|purchase)\s+(ng\s+)?(bato|concrete|semento)/i // Buying materials
    ];
    
    // Check if response is in non-English (contains Tagalog words)
    const tagalogWords = /\b(ako|ang|ng|sa|mga|ka|mo|ko|ba|po|opo|mayroon|kaming|puwede|pwede|oo|hindi|natin|atin|tungkol|masaya|akong|iyo|ngayon)\b/i;
    const isNonEnglish = tagalogWords.test(botResponse);
    
    const containsForbiddenContent = forbiddenPatterns.some(pattern => pattern.test(botResponse));
    
    if (containsForbiddenContent || isNonEnglish) {
      console.warn('⚠️ Bot response contained forbidden content or non-English, replacing with safe response');
      console.warn('Original response:', botResponse.substring(0, 200));
      
      const safeResponse = "I apologize, but I can only communicate in English and help with library services only. Please ask your question in English about library-related topics (books, hours, services, etc.), or you can request to speak with a librarian for personalized assistance.";
      
      conversation.messages.push({ 
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant', 
        content: safeResponse, 
        timestamp: new Date() 
      });

      res.json({ 
        response: safeResponse,
        success: true,
        status: 'bot'
      });
      return;
    }

    conversation.messages.push({ 
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant', 
      content: botResponse, 
      timestamp: new Date() 
    });

    // Track response time
    const responseTime = Date.now() - startTime;
    trackResponseTime(sessionId, responseTime);
    trackMessage();
    updateStatusCounts();

    res.json({ 
      response: botResponse,
      success: true,
      status: 'bot'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: 'Failed to get response from chatbot',
      success: false 
    });
  }
});

// Request human librarian
app.post('/api/request-librarian', async (req, res) => {
  try {
    const { sessionId, history = [] } = req.body;
    
    if (!conversations.has(sessionId)) {
      // Convert history to proper message format with timestamps
      const messages = history.map(msg => ({
        ...msg,
        timestamp: msg.timestamp || new Date()
      }));
      
      conversations.set(sessionId, {
        status: 'human',
        messages: messages,
        userId: null,
        startTime: new Date(),
        assignedTo: null,
        assignedAt: null
      });
      
      console.log('📝 Created new conversation:', sessionId, 'with', messages.length, 'messages');
    }

    const conversation = conversations.get(sessionId);
    conversation.status = 'human';
    
    // Track librarian request
    trackLibrarianRequest();
    updateStatusCounts();

    // Notify librarian via Messenger
    const conversationSummary = history.slice(-5).map(m => 
      `${m.role === 'user' ? 'User' : 'Bot'}: ${m.content}`
    ).join('\n');

    await sendToMessenger(
      `New librarian request!\n\nRecent conversation:\n${conversationSummary}`,
      { sessionId, ...conversation }
    );

    res.json({ 
      success: true,
      message: 'A librarian has been notified and will assist you shortly. Please describe your question and they will respond as soon as possible.'
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to request librarian'
    });
  }
});

// Facebook Messenger Webhook verification
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔍 Webhook verification request received');
  console.log('Mode:', mode, 'Token:', token);

  if (mode && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// Facebook Messenger Webhook - receive messages from librarian
app.post('/webhook', async (req, res) => {
  const body = req.body;

  console.log('');
  console.log('🌐 ═══════════════════════════════════════════');
  console.log('🌐 WEBHOOK POST RECEIVED');
  console.log('🌐 ═══════════════════════════════════════════');
  console.log('📦 Body:', JSON.stringify(body, null, 2));
  console.log('🌐 ═══════════════════════════════════════════');
  console.log('');

  if (body.object === 'page') {
    // Process each entry
    for (const entry of body.entry) {
      console.log('📋 Processing entry:', entry.id);
      
      if (entry.messaging) {
        for (const event of entry.messaging) {
          console.log('📬 Processing messaging event:', JSON.stringify(event, null, 2));
          
          if (event.message && event.message.text) {
            console.log('💬 Text message detected, calling handleLibrarianMessage...');
            await handleLibrarianMessage(event);
          } else {
            console.log('⚠️  Event has no text message, skipping');
          }
        }
      } else {
        console.log('⚠️  Entry has no messaging array');
      }
    }
    
    console.log('✅ Webhook processing complete, sending EVENT_RECEIVED');
    res.status(200).send('EVENT_RECEIVED');
  } else {
    console.log('❌ Body object is not "page", it is:', body.object);
    res.sendStatus(404);
  }
});

// Handle messages from librarian via Messenger
async function handleLibrarianMessage(event) {
  const senderPsid = event.sender.id;
  const librarianMessage = event.message.text;
  
  // Check if sender is an authorized librarian
  const isAuthorized = isAuthorizedLibrarian(senderPsid);
  
  // Update activity tracking for authorized librarians
  if (isAuthorized) {
    updateLibrarianActivity(senderPsid);
  }
  
  // Check if message contains the request keyword
  const requestKeyword = process.env.LIBRARIAN_REQUEST_KEYWORD || 'REQUEST_LIBRARIAN_ACCESS';
  const isAccessRequest = librarianMessage.trim().toUpperCase() === requestKeyword.toUpperCase();
  
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('📱 MESSAGE RECEIVED FROM FACEBOOK MESSENGER');
  console.log('═══════════════════════════════════════════');
  console.log('👤 Sender PSID:', senderPsid);
  console.log('🔐 Authorized:', isAuthorized ? '✅ YES' : '❌ NO');
  console.log('🔑 Access Request:', isAccessRequest ? '✅ YES' : '❌ NO');
  console.log('💬 Message:', librarianMessage);
  console.log('🔑 Expected Keyword:', requestKeyword);
  console.log('🔍 Message (uppercase):', librarianMessage.trim().toUpperCase());
  console.log('🔍 Keyword (uppercase):', requestKeyword.toUpperCase());
  console.log('🔍 Match:', librarianMessage.trim().toUpperCase() === requestKeyword.toUpperCase());
  
  // If this is an access request
  if (isAccessRequest) {
    // Check if already authorized
    if (isAuthorized) {
      console.log('');
      console.log('ℹ️  User already has access');
      console.log('═══════════════════════════════════════════');
      console.log('');
      
      // Send message telling them they already have access
      try {
        const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
        
        await axios.post(url, {
          recipient: { id: senderPsid },
          message: {
            text: `✅ You already have librarian access!\n\nYou will receive notifications when users request assistance.\n\nNo further action needed.`
          }
        });
        
        console.log('✅ Already-authorized message sent successfully!');
      } catch (error) {
        console.error('❌ Error sending already-authorized message:', error.response?.data || error.message);
      }
      
      return;
    }
    
    // Not authorized yet - process new request
    // Fetch user profile
    const profile = await fetchUserProfile(senderPsid);
    
    // Add to pending requests with special flag
    pendingLibrarianRequests.set(senderPsid, {
      psid: senderPsid,
      lastMessage: new Date(),
      messageCount: 1,
      requestedAccess: true,
      name: profile.name
    });
    
    console.log('');
    console.log('🔔 NEW LIBRARIAN ACCESS REQUEST!');
    console.log('👤 Name:', profile.name);
    console.log('📊 View admin dashboard: http://localhost:3000/admin');
    console.log('═══════════════════════════════════════════');
    console.log('');
    
    // Send confirmation message
    try {
      const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
      
      console.log('📤 Attempting to send confirmation message to PSID:', senderPsid);
      
      const response = await axios.post(url, {
        recipient: { id: senderPsid },
        message: {
          text: `✅ Your request has been sent to the administrators.\n\nWe will notify you once your request has been approved.\n\nThank you for your patience!`
        }
      });
      
      console.log('✅ Confirmation message sent successfully!');
      console.log('📬 Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('❌ Error sending confirmation:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('   Message:', error.message);
    }
    
    return;
  }
  
  // If not authorized and not a valid access request
  if (!isAuthorized) {
    console.log('');
    console.log('⚠️  Unauthorized user - Message ignored (no response sent)');
    console.log('💡 To request access, they should message: ' + requestKeyword);
    console.log('═══════════════════════════════════════════');
    console.log('');
    
    // Silently ignore - don't send any response
    return;
  }
  
  console.log('✅ Authorized librarian message received');
  const baseUrl = process.env.WEBHOOK_URL?.replace('/webhook', '') || 'http://localhost:3000';
  console.log('💡 Librarians should use the web dashboard to respond:');
  console.log('   📱 Mobile: ' + baseUrl + '/librarian-mobile');
  console.log('   💻 Desktop: ' + baseUrl + '/librarian');
  console.log('═══════════════════════════════════════════');
  console.log('');
  
  // Librarians should use the web dashboard to respond, not Messenger
  // Silently ignore their Messenger messages
}

// Get conversation status
app.get('/api/conversation-status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const conversation = conversations.get(sessionId);
  
  if (conversation) {
    // Include typing status in response
    const typing = typingStatus.get(sessionId) || {
      user: { isTyping: false, lastUpdate: new Date() },
      librarian: { isTyping: false, lastUpdate: new Date() }
    };
    
    res.json({
      status: conversation.status,
      messageCount: conversation.messages.length,
      typing: {
        user: typing.user.isTyping,
        librarian: typing.librarian.isTyping
      }
    });
  } else {
    res.json({ 
      status: 'bot', 
      messageCount: 0,
      typing: { user: false, librarian: false }
    });
  }
});

// Set typing status (user or librarian)
app.post('/api/typing/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { isTyping, role } = req.body; // role: 'user' or 'librarian'
  
  if (!role || (role !== 'user' && role !== 'librarian')) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }
  
  if (!typingStatus.has(sessionId)) {
    typingStatus.set(sessionId, {
      user: { isTyping: false, lastUpdate: new Date() },
      librarian: { isTyping: false, lastUpdate: new Date() }
    });
  }
  
  const status = typingStatus.get(sessionId);
  status[role].isTyping = !!isTyping;
  status[role].lastUpdate = new Date();
  
  res.json({ success: true });
});

// Get typing status for a conversation
app.get('/api/typing/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const status = typingStatus.get(sessionId);
  
  if (status) {
    res.json({
      user: status.user.isTyping,
      librarian: status.librarian.isTyping
    });
  } else {
    res.json({
      user: false,
      librarian: false
    });
  }
});


// Librarian Dashboard - View all active conversations
app.get('/librarian', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'librarian.html'));
});

// Librarian Mobile Dashboard - Mobile-optimized version
app.get('/librarian-mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'librarian-mobile.html'));
});

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;
  
  // Require admin password to be set in environment
  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD not set in environment variables');
    return res.status(500).json({ success: false, message: 'Admin access not configured' });
  }
  
  console.log('Login attempt - Password provided:', password ? 'Yes' : 'No');
  
  if (password === adminPassword) {
    console.log('Login successful');
    res.json({ success: true, message: 'Login successful' });
  } else {
    console.log('Login failed - Invalid password');
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Librarian login endpoint
app.post('/api/librarian/login', (req, res) => {
  const { password } = req.body;
  const librarianPassword = process.env.LIBRARIAN_PASSWORD;
  
  // Require librarian password to be set in environment
  if (!librarianPassword) {
    console.error('❌ LIBRARIAN_PASSWORD not set in environment variables');
    return res.status(500).json({ success: false, message: 'Librarian access not configured' });
  }
  
  console.log('Librarian login attempt');
  
  if (password === librarianPassword) {
    console.log('Librarian login successful');
    res.json({ success: true, message: 'Login successful' });
  } else {
    console.log('Librarian login failed');
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Admin Dashboard - Manage librarian access
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Health check endpoint (prevents Render from sleeping)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: Math.floor((Date.now() - analytics.startTime.getTime()) / 1000),
    conversations: conversations.size,
    groqConfigured: !!process.env.GROQ_API_KEY
  });
});

// API endpoint for admin to get librarian data
app.get('/api/admin/librarians', async (req, res) => {
  const authorizedPsids = getAuthorizedLibrarians();
  const pendingList = Array.from(pendingLibrarianRequests.values());
  
  logger.log('Fetching librarian data - authorized:', authorizedPsids.length, 'pending:', pendingList.length);
  
  // Fetch names for all PSIDs (use cache)
  const authorizedWithNames = await Promise.all(
    authorizedPsids.map(async (psid) => {
      const profile = await fetchUserProfile(psid);
      return {
        psid,
        name: profile.name,
        profilePic: profile.profilePic
      };
    })
  );
  
  const pendingWithNames = await Promise.all(
    pendingList.map(async (req) => {
      const profile = await fetchUserProfile(req.psid);
      return {
        ...req,
        name: profile.name,
        profilePic: profile.profilePic
      };
    })
  );
  
  console.log('✅ Librarian data prepared:', {
    authorized: authorizedWithNames.map(l => ({ psid: l.psid, name: l.name }))
  });
  
  res.json({
    authorized: authorizedWithNames,
    pending: pendingWithNames,
    keyword: process.env.LIBRARIAN_REQUEST_KEYWORD || 'REQUEST_LIBRARIAN_ACCESS'
  });
});

// API endpoint for admin to approve a librarian
app.post('/api/admin/approve', async (req, res) => {
  const { psid } = req.body;
  
  if (!psid) {
    return res.status(400).json({ success: false, error: 'PSID required' });
  }
  
  const currentLibrarians = getAuthorizedLibrarians();
  
  if (currentLibrarians.includes(psid)) {
    return res.json({ success: false, error: 'Already authorized' });
  }
  
  // Add to list
  librarianData.authorizedPsids.push(psid);
  
  // Save to file
  if (!saveLibrarianData(librarianData)) {
    return res.status(500).json({ success: false, error: 'Failed to save data' });
  }
  
  // Remove from pending
  pendingLibrarianRequests.delete(psid);
  
  // Notify the approved librarian via Messenger
  try {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
    await axios.post(url, {
      recipient: { id: psid },
      message: {
        text: `🎉 Congratulations!\n\nYour librarian access request has been approved!\n\nYou will now receive notifications when users request assistance.\n\nWelcome to the team!`
      }
    });
    console.log('✅ Approval notification sent to:', psid);
  } catch (error) {
    console.error('❌ Error sending approval notification:', error.response?.data);
  }
  
  res.json({ 
    success: true,
    message: 'Librarian approved and saved permanently!'
  });
});

// API endpoint for admin to remove a librarian
app.post('/api/admin/remove', (req, res) => {
  const { psid } = req.body;
  
  if (!psid) {
    return res.status(400).json({ success: false, error: 'PSID required' });
  }
  
  const currentLibrarians = getAuthorizedLibrarians();
  const filtered = currentLibrarians.filter(id => id !== psid);
  
  if (filtered.length === currentLibrarians.length) {
    return res.json({ success: false, error: 'Not found' });
  }
  
  // Update the list
  librarianData.authorizedPsids = filtered;
  
  // Save to file
  if (!saveLibrarianData(librarianData)) {
    return res.status(500).json({ success: false, error: 'Failed to save data' });
  }
  
  res.json({ 
    success: true,
    message: 'Librarian removed and saved permanently!'
  });
});

// API endpoint for librarian to get notifications
app.get('/api/librarian/notifications', (req, res) => {
  res.json({
    notifications: librarianNotifications,
    activeConversations: Array.from(conversations.entries()).map(([id, conv]) => ({
      sessionId: id,
      status: conv.status,
      messageCount: conv.messages.length,
      startTime: conv.startTime,
      lastMessage: conv.messages[conv.messages.length - 1],
      assignedTo: conv.assignedTo || null,
      assignedAt: conv.assignedAt || null
    }))
  });
});

// API endpoint to get a single conversation
app.get('/api/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { skipView } = req.query; // Add query parameter to skip auto-view
  const conversation = conversations.get(sessionId);
  
  if (conversation) {
    // Mark as viewed if it's a bot conversation (only if skipView is not set)
    if (conversation.status === 'bot' && !skipView) {
      conversation.status = 'viewed';
      console.log(`👁️ Conversation ${sessionId} marked as viewed`);
    }
    
    // Calculate feedback for this conversation
    const sessionFeedback = feedback.messages.filter(f => f.sessionId === sessionId);
    const thumbsUp = sessionFeedback.filter(f => f.type === 'up').length;
    const thumbsDown = sessionFeedback.filter(f => f.type === 'down').length;
    
    // Add reactions to each message using the message ID
    const messagesWithReactions = conversation.messages.map((msg) => {
      const messageReactions = feedback.reactions[msg.id];
      const reactions = messageReactions ? messageReactions.counts : {};
      
      return {
        ...msg,
        reactions
      };
    });
    
    res.json({
      sessionId,
      ...conversation,
      messages: messagesWithReactions,
      feedback: {
        thumbsUp,
        thumbsDown
      }
    });
  } else {
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// API endpoint for librarian to claim/assign a conversation
app.post('/api/librarian/claim', (req, res) => {
  const { sessionId, librarianName } = req.body;
  
  if (!sessionId || !librarianName) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or librarianName' });
  }
  
  const conversation = conversations.get(sessionId);
  
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }
  
  // Check if already assigned to another librarian
  if (conversation.assignedTo && conversation.assignedTo !== librarianName) {
    return res.status(409).json({ 
      success: false, 
      error: 'Already assigned',
      assignedTo: conversation.assignedTo,
      assignedAt: conversation.assignedAt
    });
  }
  
  // Assign conversation
  conversation.assignedTo = librarianName;
  conversation.assignedAt = new Date();
  
  console.log(`📌 Conversation ${sessionId} claimed by ${librarianName}`);
  
  res.json({ 
    success: true, 
    assignedTo: librarianName,
    assignedAt: conversation.assignedAt
  });
});

// API endpoint for librarian to release a conversation
app.post('/api/librarian/release', (req, res) => {
  const { sessionId, librarianName } = req.body;
  
  if (!sessionId || !librarianName) {
    return res.status(400).json({ success: false, error: 'Missing sessionId or librarianName' });
  }
  
  const conversation = conversations.get(sessionId);
  
  if (!conversation) {
    return res.status(404).json({ success: false, error: 'Conversation not found' });
  }
  
  // Only the assigned librarian can release
  if (conversation.assignedTo !== librarianName) {
    return res.status(403).json({ 
      success: false, 
      error: 'Not assigned to you',
      assignedTo: conversation.assignedTo
    });
  }
  
  // Release conversation
  conversation.assignedTo = null;
  conversation.assignedAt = null;
  
  console.log(`🔓 Conversation ${sessionId} released by ${librarianName}`);
  
  res.json({ success: true });
});

// API endpoint for librarian to respond
app.post('/api/librarian/respond', (req, res) => {
  const { sessionId, message, attachment, librarianName } = req.body;
  
  // Input validation
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid sessionId' });
  }
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid message' });
  }
  
  if (message.length > LIMITS.MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ success: false, error: `Message too long (max ${LIMITS.MAX_MESSAGE_LENGTH} characters)` });
  }
  
  const conversation = conversations.get(sessionId);
  
  logger.log('Librarian responding to session:', sessionId);
  
  if (conversation) {
    // Auto-claim conversation if not already assigned
    if (!conversation.assignedTo && librarianName) {
      conversation.assignedTo = librarianName;
      conversation.assignedAt = new Date();
      console.log(`📌 Auto-claimed by ${librarianName}`);
    }
    
    // Check if assigned to another librarian
    if (conversation.assignedTo && librarianName && conversation.assignedTo !== librarianName) {
      return res.status(409).json({ 
        success: false, 
        error: 'Conversation is being handled by another librarian',
        assignedTo: conversation.assignedTo
      });
    }
    
    // If this is the first librarian response to a bot/viewed conversation, add takeover notification
    const wasBot = conversation.status === 'bot' || conversation.status === 'viewed';
    
    if (wasBot) {
      // Add system message to notify user
      conversation.messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: '👤 A librarian is now assisting you. You can ask any questions and they will respond personally.',
        timestamp: new Date()
      });
      console.log('� Added librarian takeover notification');
    }
    
    // Create message object
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const librarianMessage = {
      id: messageId,
      role: 'librarian',
      content: message,
      timestamp: new Date(),
      librarianName: librarianName || 'Librarian'
    };
    
    // Add attachment if present
    if (attachment) {
      librarianMessage.attachment = {
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        data: attachment.data
      };
      console.log('📎 Librarian attached file:', attachment.name);
    }
    
    // Add librarian's message
    conversation.messages.push(librarianMessage);
    
    // Change status to 'responded' to indicate librarian has replied
    conversation.status = 'responded';
    
    logger.log('Message added. Total messages:', conversation.messages.length);
    
    res.json({ success: true });
  } else {
    console.log('❌ Conversation not found:', sessionId);
    res.status(404).json({ success: false, error: 'Conversation not found' });
  }
});

// API endpoint for librarian to end session
app.post('/api/librarian/end-session', (req, res) => {
  const { sessionId } = req.body;
  const conversation = conversations.get(sessionId);
  
  console.log('🔚 Ending session:', sessionId);
  
  if (conversation) {
    // Add a system message
    conversation.messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: 'assistant',
      content: 'This conversation has been closed by the librarian. If you need further assistance, feel free to ask!',
      timestamp: new Date()
    });
    
    // Change status to 'closed' instead of 'bot'
    conversation.status = 'closed';
    conversation.closedAt = new Date();
    
    // Clear countdown if exists
    if (conversation.countdown) {
      delete conversation.countdown;
    }
    
    console.log('✅ Session ended. Status changed to: closed');
    
    res.json({ success: true });
  } else {
    console.log('❌ Conversation not found:', sessionId);
    res.status(404).json({ success: false, error: 'Conversation not found' });
  }
});

// API endpoint to set countdown status
app.post('/api/librarian/set-countdown', (req, res) => {
  const { sessionId, countdown } = req.body;
  const conversation = conversations.get(sessionId);
  
  if (conversation) {
    if (countdown > 0) {
      conversation.countdown = countdown;
    } else {
      delete conversation.countdown;
    }
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Conversation not found' });
  }
});

// API endpoint to get canned responses
app.get('/api/canned-responses', (req, res) => {
  res.json(cannedResponses);
});

// API endpoint to save canned responses
app.post('/api/canned-responses', (req, res) => {
  const { categories } = req.body;
  
  if (!categories || !Array.isArray(categories)) {
    return res.status(400).json({ success: false, error: 'Invalid data' });
  }
  
  cannedResponses = { categories };
  
  if (saveCannedResponses(cannedResponses)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// Knowledge Base endpoints
let knowledgeBase = { documents: [] };

// Load knowledge base from file
function loadKnowledgeBase() {
  try {
    const data = fs.readFileSync('knowledge-base.json', 'utf8');
    knowledgeBase = JSON.parse(data);
    console.log(`✅ Loaded ${knowledgeBase.documents.length} knowledge base documents`);
    if (knowledgeBase.documents.length > 0) {
      console.log('📚 Documents in knowledge base:');
      knowledgeBase.documents.forEach(doc => {
        console.log(`   - "${doc.title}" (${doc.size} chars, ${doc.type || 'text'})`);
      });
    }
  } catch (error) {
    console.log('⚠️  No existing knowledge base found, starting fresh');
    knowledgeBase = { documents: [] };
  }
}

// Save knowledge base to file
function saveKnowledgeBase(data) {
  try {
    fs.writeFileSync('knowledge-base.json', JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving knowledge base:', error);
    return false;
  }
}

// Get all knowledge base documents
app.get('/api/knowledge-base', (req, res) => {
  res.json(knowledgeBase);
});

// Add new document to knowledge base
app.post('/api/knowledge-base', async (req, res) => {
  const { title, content, fileData, fileType, category, tags } = req.body;
  
  if (!title) {
    return res.status(400).json({ success: false, error: 'Title required' });
  }
  
  let documentContent = content;
  
  // If PDF file data is provided, extract text from it
  if (fileData && fileType === 'application/pdf') {
    try {
      console.log('📄 Extracting text from PDF using pdfjs-dist...');
      console.log('File data length:', fileData.length);
      
      // Convert base64 to buffer
      let base64Data = fileData;
      if (fileData.includes(',')) {
        base64Data = fileData.split(',')[1];
      }
      
      console.log('Base64 data length:', base64Data.length);
      
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      console.log('PDF buffer size:', pdfBuffer.length, 'bytes');
      
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(pdfBuffer),
        useSystemFonts: true,
        standardFontDataUrl: null
      });
      
      const pdfDocument = await loadingTask.promise;
      const numPages = pdfDocument.numPages;
      console.log(`📊 PDF has ${numPages} pages`);
      
      // Extract text from all pages
      let fullText = '';
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
      }
      
      documentContent = fullText.trim();
      
      console.log(`✅ Extracted ${documentContent.length} characters from PDF`);
      console.log('First 200 chars:', documentContent.substring(0, 200));
      
      if (!documentContent || documentContent.trim().length === 0) {
        console.warn('⚠️ PDF text extraction returned empty content');
        return res.status(400).json({ 
          success: false, 
          error: 'Could not extract text from PDF. The PDF might be image-based (scanned) or encrypted. Try a text-based PDF or use OCR for scanned documents.' 
        });
      }
    } catch (error) {
      console.error('❌ Error parsing PDF:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      return res.status(400).json({ 
        success: false, 
        error: `Failed to parse PDF: ${error.message}. Please ensure it's a valid PDF with extractable text.` 
      });
    }
  } else if (!content || content.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'Content required' });
  }
  
  const document = {
    id: Date.now().toString(),
    title,
    content: documentContent, // Text for AI to search
    createdAt: new Date(),
    size: documentContent.length,
    type: fileType || 'text/plain',
    category: category || 'other',
    tags: tags || [], // Add tags support
    originalFile: fileData ? fileData : null // Store original PDF for preview
  };
  
  knowledgeBase.documents.push(document);
  
  if (saveKnowledgeBase(knowledgeBase)) {
    console.log(`✅ Saved document: ${title} (${documentContent.length} chars)`);
    res.json({ success: true, document });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// Delete document from knowledge base
app.delete('/api/knowledge-base/:id', (req, res) => {
  const { id } = req.params;
  
  const index = knowledgeBase.documents.findIndex(doc => doc.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  
  knowledgeBase.documents.splice(index, 1);
  
  if (saveKnowledgeBase(knowledgeBase)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// Get a specific document by ID (for viewing/downloading)
app.get('/api/knowledge-base/document/:id', (req, res) => {
  const { id } = req.params;
  
  const document = knowledgeBase.documents.find(doc => doc.id === id);
  if (!document) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  
  // Track document view
  if (!documentAnalytics.documentViews[id]) {
    documentAnalytics.documentViews[id] = { count: 0, lastViewed: null };
  }
  documentAnalytics.documentViews[id].count++;
  documentAnalytics.documentViews[id].lastViewed = new Date().toISOString();
  saveAnalytics(documentAnalytics);
  
  // Return document with preview and original file
  res.json({
    success: true,
    document: {
      id: document.id,
      title: document.title,
      type: document.type,
      size: document.size,
      category: document.category,
      createdAt: document.createdAt,
      preview: document.content.substring(0, 2000) + (document.content.length > 2000 ? '...' : ''),
      fullContent: document.content, // Text content for download
      originalFile: document.originalFile // Original PDF file data
    }
  });
});

// Update document category
// Update document (title, category, and/or tags)
app.patch('/api/knowledge-base/:id', (req, res) => {
  const { id } = req.params;
  const { title, category, tags } = req.body;
  
  const document = knowledgeBase.documents.find(doc => doc.id === id);
  if (!document) {
    return res.status(404).json({ success: false, error: 'Document not found' });
  }
  
  // Update fields if provided
  if (title !== undefined) {
    if (!title.trim()) {
      return res.status(400).json({ success: false, error: 'Title cannot be empty' });
    }
    document.title = title.trim();
  }
  
  if (category !== undefined) {
    document.category = category;
  }
  
  if (tags !== undefined) {
    document.tags = Array.isArray(tags) ? tags : [];
  }
  
  if (saveKnowledgeBase(knowledgeBase)) {
    console.log(`✅ Updated document ${id}:`, { title: document.title, category: document.category, tags: document.tags });
    res.json({ success: true, document });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// Get AI settings
app.get('/api/ai-settings', (req, res) => {
  res.json({
    success: true,
    settings: aiSettings,
    defaultPrompt: LIBRARY_CONTEXT
  });
});

// Update AI settings
app.post('/api/ai-settings', (req, res) => {
  const { customPrompt, useCustomPrompt, customContext, useCustomContext } = req.body;
  
  aiSettings.customPrompt = customPrompt || null;
  aiSettings.useCustomPrompt = useCustomPrompt === true;
  aiSettings.customContext = customContext || null;
  aiSettings.useCustomContext = useCustomContext === true;
  
  if (saveAISettings(aiSettings)) {
    console.log(`✅ Updated AI settings - Custom prompt ${aiSettings.useCustomPrompt ? 'enabled' : 'disabled'}, Custom context ${aiSettings.useCustomContext ? 'enabled' : 'disabled'}`);
    res.json({ success: true, settings: aiSettings });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// Reset AI settings to default
app.post('/api/ai-settings/reset', (req, res) => {
  aiSettings.customPrompt = null;
  aiSettings.useCustomPrompt = false;
  aiSettings.customContext = null;
  aiSettings.useCustomContext = false;
  
  if (saveAISettings(aiSettings)) {
    console.log(`✅ Reset AI settings to default`);
    res.json({ success: true, settings: aiSettings });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save settings' });
  }
});

// ===== LIBRARY EVENTS ENDPOINTS =====

// Get all events
app.get('/api/events', (req, res) => {
  res.json({ success: true, events: libraryEvents.events, featured: libraryEvents.featured });
});

// Add new event
app.post('/api/events', (req, res) => {
  const { title, description, date, time, location, type } = req.body;
  
  if (!title || !date) {
    return res.status(400).json({ success: false, error: 'Title and date required' });
  }
  
  const event = {
    id: Date.now().toString(),
    title,
    description: description || '',
    date,
    time: time || '',
    location: location || '',
    type: type || 'general',
    createdAt: new Date().toISOString()
  };
  
  libraryEvents.events.push(event);
  
  if (saveEvents(libraryEvents)) {
    res.json({ success: true, event });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// Delete event
app.delete('/api/events/:id', (req, res) => {
  const { id } = req.params;
  const index = libraryEvents.events.findIndex(e => e.id === id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Event not found' });
  }
  
  libraryEvents.events.splice(index, 1);
  
  if (saveEvents(libraryEvents)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// ===== FEATURED CONTENT ENDPOINTS =====

// Set featured documents
app.post('/api/featured', (req, res) => {
  const { documentIds } = req.body;
  
  if (!Array.isArray(documentIds)) {
    return res.status(400).json({ success: false, error: 'documentIds must be an array' });
  }
  
  libraryEvents.featured = documentIds;
  
  if (saveEvents(libraryEvents)) {
    res.json({ success: true, featured: libraryEvents.featured });
  } else {
    res.status(500).json({ success: false, error: 'Failed to save' });
  }
});

// ===== ANALYTICS ENDPOINTS =====

// Track document view
app.post('/api/analytics/view/:id', (req, res) => {
  const { id } = req.params;
  
  if (!documentAnalytics.documentViews[id]) {
    documentAnalytics.documentViews[id] = { count: 0, lastViewed: null };
  }
  
  documentAnalytics.documentViews[id].count++;
  documentAnalytics.documentViews[id].lastViewed = new Date().toISOString();
  
  saveAnalytics(documentAnalytics);
  res.json({ success: true });
});

// Track search term
app.post('/api/analytics/search', (req, res) => {
  const { term } = req.body;
  
  if (!term) {
    return res.status(400).json({ success: false, error: 'Search term required' });
  }
  
  const termLower = term.toLowerCase().trim();
  if (!documentAnalytics.searchTerms[termLower]) {
    documentAnalytics.searchTerms[termLower] = 0;
  }
  documentAnalytics.searchTerms[termLower]++;
  
  saveAnalytics(documentAnalytics);
  res.json({ success: true });
});

// Track helpful response
app.post('/api/analytics/helpful', (req, res) => {
  const { messageId, response, helpful } = req.body;
  
  if (!messageId || !response) {
    return res.status(400).json({ success: false, error: 'Message ID and response required' });
  }
  
  const existing = documentAnalytics.helpfulResponses.find(r => r.messageId === messageId);
  
  if (existing) {
    existing.helpful = helpful;
    existing.updatedAt = new Date().toISOString();
  } else {
    documentAnalytics.helpfulResponses.push({
      messageId,
      response,
      helpful,
      createdAt: new Date().toISOString()
    });
  }
  
  // Keep only last 100 responses
  if (documentAnalytics.helpfulResponses.length > 100) {
    documentAnalytics.helpfulResponses = documentAnalytics.helpfulResponses.slice(-100);
  }
  
  saveAnalytics(documentAnalytics);
  res.json({ success: true });
});

// Get analytics data
app.get('/api/document-analytics', (req, res) => {
  // Calculate trending documents
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  const trending = Object.entries(documentAnalytics.documentViews)
    .filter(([id, data]) => new Date(data.lastViewed).getTime() > oneDayAgo)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id, data]) => ({
      documentId: id,
      views: data.count,
      document: knowledgeBase.documents.find(d => d.id === id)
    }))
    .filter(item => item.document);
  
  // Top search terms
  const topSearches = Object.entries(documentAnalytics.searchTerms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));
  
  // Most helpful responses
  const mostHelpful = documentAnalytics.helpfulResponses
    .filter(r => r.helpful === true)
    .slice(-10)
    .reverse();
  
  res.json({
    success: true,
    trending,
    topSearches,
    mostHelpful,
    totalViews: Object.values(documentAnalytics.documentViews).reduce((sum, d) => sum + d.count, 0),
    totalSearches: Object.values(documentAnalytics.searchTerms).reduce((sum, count) => sum + count, 0)
  });
});

// Search knowledge base (for RAG)
function searchKnowledgeBase(query) {
  if (!query || knowledgeBase.documents.length === 0) {
    return [];
  }
  
  const queryLower = query.toLowerCase();
  
  // Extract keywords from query (remove common words)
  const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'should', 'would', 'for', 'you', 'your', 'any', 'there'];
  const keywords = queryLower
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  console.log('🔍 Searching knowledge base for keywords:', keywords);
  
  const results = [];
  
  for (const doc of knowledgeBase.documents) {
    const contentLower = doc.content.toLowerCase();
    const titleLower = doc.title.toLowerCase();
    
    // Calculate relevance score
    let relevanceScore = 0;
    let bestExcerptIndex = -1;
    
    // Check title matches (higher weight)
    for (const keyword of keywords) {
      if (titleLower.includes(keyword)) {
        relevanceScore += 3;
      }
    }
    
    // Check content matches
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\w*\\b`, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        relevanceScore += matches.length;
        // Find first occurrence for excerpt
        if (bestExcerptIndex === -1) {
          bestExcerptIndex = contentLower.indexOf(keyword);
        }
      }
    }
    
    // If we found matches, add to results
    if (relevanceScore > 0) {
      // Extract relevant excerpt
      let excerpt = '';
      if (bestExcerptIndex !== -1) {
        const start = Math.max(0, bestExcerptIndex - 150);
        const end = Math.min(doc.content.length, bestExcerptIndex + 350);
        excerpt = doc.content.substring(start, end);
        excerpt = (start > 0 ? '...' : '') + excerpt + (end < doc.content.length ? '...' : '');
      } else {
        // No specific match, use beginning
        excerpt = doc.content.substring(0, 500) + (doc.content.length > 500 ? '...' : '');
      }
      
      results.push({
        title: doc.title,
        excerpt: excerpt,
        relevance: relevanceScore,
        id: doc.id,
        size: doc.size,
        type: doc.type
      });
      
      console.log(`✓ Found match in "${doc.title}" (score: ${relevanceScore})`);
    }
  }
  
  // Sort by relevance and return top 3
  results.sort((a, b) => b.relevance - a.relevance);
  
  console.log(`📊 Found ${results.length} relevant documents`);
  
  return results.slice(0, 3);
}

// Load knowledge base on startup
loadKnowledgeBase();

// API endpoint to get analytics data
app.get('/api/analytics', (req, res) => {
  // Update status counts before sending
  updateStatusCounts();
  
  // Calculate uptime
  const uptime = Date.now() - analytics.startTime.getTime();
  const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  
  // Get last 7 days of data for charts
  const last7Days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    last7Days.push({
      date: dateStr,
      conversations: analytics.conversationsPerDay[dateStr] || 0,
      messages: analytics.messagesPerDay[dateStr] || 0
    });
  }
  
  // Get active conversations
  const activeConversations = Array.from(conversations.entries()).map(([id, conv]) => ({
    sessionId: id,
    status: conv.status,
    messageCount: conv.messages.length,
    startTime: conv.startTime,
    duration: Math.floor((Date.now() - new Date(conv.startTime).getTime()) / 1000)
  }));
  
  res.json({
    summary: {
      totalConversations: analytics.totalConversations,
      totalMessages: analytics.totalMessages,
      librarianRequests: analytics.librarianRequests,
      averageResponseTime: analytics.averageResponseTime,
      activeConversations: conversations.size,
      uptime: `${uptimeHours}h ${uptimeMinutes}m`
    },
    conversationsByStatus: analytics.conversationsByStatus,
    last7Days: last7Days,
    activeConversations: activeConversations,
    recentResponseTimes: analytics.responseTimeHistory.slice(-10).map(rt => ({
      responseTime: rt.responseTime,
      timestamp: rt.timestamp
    }))
  });
});

// Feedback storage
const feedback = {
  messages: [], // Individual message feedback
  conversations: [], // Overall conversation feedback
  reactions: {} // Emoji reactions per message: { messageId: { emoji: count } }
};

// API endpoint for message feedback
app.post('/api/feedback/message', (req, res) => {
  const { sessionId, messageId, type, timestamp } = req.body;
  
  if (!sessionId || !messageId || !type) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  
  feedback.messages.push({
    sessionId,
    messageId,
    type, // 'up' or 'down'
    timestamp: timestamp || new Date().toISOString()
  });
  
  // Keep only last 1000 message feedbacks to prevent memory leak
  if (feedback.messages.length > 1000) {
    feedback.messages.shift();
  }
  
  logger.log('📊 Message feedback received:', { sessionId, messageId, type });
  
  res.json({ success: true });
});

// API endpoint for emoji reactions
app.post('/api/feedback/reaction', (req, res) => {
  const { sessionId, messageId, emoji, userId } = req.body;
  
  if (!sessionId || !messageId || !emoji) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  
  // Initialize reactions for this message if not exists
  if (!feedback.reactions[messageId]) {
    feedback.reactions[messageId] = {
      counts: {},      // emoji -> count
      users: {}        // userId -> emoji (each user can only have 1 emoji)
    };
  }
  
  const messageReactions = feedback.reactions[messageId];
  
  // Use sessionId as userId if not provided
  const user = userId || sessionId;
  
  // Check if user already has a reaction
  const existingEmoji = messageReactions.users[user];
  
  if (existingEmoji) {
    // User already reacted - remove old reaction
    messageReactions.counts[existingEmoji]--;
    if (messageReactions.counts[existingEmoji] <= 0) {
      delete messageReactions.counts[existingEmoji];
    }
    
    // If clicking the same emoji, just remove it (toggle off)
    if (existingEmoji === emoji) {
      delete messageReactions.users[user];
      logger.log('😊 Emoji reaction removed:', { sessionId, messageId, emoji });
      res.json({ success: true, reactions: messageReactions.counts });
      return;
    }
  }
  
  // Add new reaction
  messageReactions.users[user] = emoji;
  messageReactions.counts[emoji] = (messageReactions.counts[emoji] || 0) + 1;
  
  logger.log('😊 Emoji reaction added:', { sessionId, messageId, emoji, count: messageReactions.counts[emoji] });
  
  res.json({ success: true, reactions: messageReactions.counts });
});

// API endpoint to get reactions for a message
app.get('/api/feedback/reactions/:messageId', (req, res) => {
  const { messageId } = req.params;
  const messageReactions = feedback.reactions[messageId];
  const reactions = messageReactions ? messageReactions.counts : {};
  res.json({ success: true, reactions });
});

// API endpoint for conversation feedback
app.post('/api/feedback/conversation', (req, res) => {
  const { sessionId, rating, comment, messageFeedback, timestamp } = req.body;
  
  if (!sessionId || !rating) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  
  feedback.conversations.push({
    sessionId,
    rating, // 1-5 stars
    comment: comment || '',
    messageFeedback: messageFeedback || {},
    timestamp: timestamp || new Date().toISOString()
  });
  
  // Keep only last 500 conversation feedbacks to prevent memory leak
  if (feedback.conversations.length > 500) {
    feedback.conversations.shift();
  }
  
  logger.log('⭐ Conversation feedback received:', { sessionId, rating, hasComment: !!comment });
  
  res.json({ success: true });
});

// API endpoint to get feedback data (for admin dashboard)
app.get('/api/feedback', (req, res) => {
  const totalFeedback = feedback.conversations.length;
  const averageRating = totalFeedback > 0
    ? (feedback.conversations.reduce((sum, f) => sum + f.rating, 0) / totalFeedback).toFixed(1)
    : 0;
  
  const ratingDistribution = {
    1: feedback.conversations.filter(f => f.rating === 1).length,
    2: feedback.conversations.filter(f => f.rating === 2).length,
    3: feedback.conversations.filter(f => f.rating === 3).length,
    4: feedback.conversations.filter(f => f.rating === 4).length,
    5: feedback.conversations.filter(f => f.rating === 5).length
  };
  
  const messageFeedbackStats = {
    thumbsUp: feedback.messages.filter(f => f.type === 'up').length,
    thumbsDown: feedback.messages.filter(f => f.type === 'down').length
  };
  
  res.json({
    summary: {
      totalFeedback,
      averageRating,
      messageFeedbackStats
    },
    ratingDistribution,
    recentFeedback: feedback.conversations.slice(-20).reverse(), // Last 20, newest first
    recentMessageFeedback: feedback.messages.slice(-50).reverse() // Last 50, newest first
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Library chatbot server running on http://localhost:${PORT}`);
});
