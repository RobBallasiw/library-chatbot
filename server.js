import express from 'express';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import compression from 'compression';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ollama = new Ollama({ host: 'http://localhost:11434' });

// Enable gzip compression
app.use(compression());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
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
  windowMs: 30 * 1000, // 30 seconds
  max: 15, // Limit each IP to 15 chat messages per 30 seconds
  message: 'Too many messages, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

const librarianLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // Very generous limit for librarians (increased from 100)
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

app.use(express.json());
app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  etag: true
}));

// Apply rate limiting to API routes
// Order matters: more specific routes first, then general
app.use('/api/chat', chatLimiter); // Strict limit for chat
app.use('/api/librarian/*', librarianLimiter); // Generous limit for librarians
app.use('/api/admin/*', librarianLimiter); // Generous limit for admin
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

// Cleanup old conversations to prevent memory leaks
function cleanupOldConversations() {
  const now = Date.now();
  let cleaned = 0;
  
  // HARD LIMIT ENFORCEMENT: If over limit, force immediate cleanup
  if (conversations.size > LIMITS.MAX_CONVERSATIONS) {
    console.log(`⚠️ Conversation limit exceeded (${conversations.size}/${LIMITS.MAX_CONVERSATIONS}), forcing aggressive cleanup`);
    
    // Sort conversations by age and delete oldest until under limit
    const sortedConvs = Array.from(conversations.entries())
      .sort((a, b) => new Date(a[1].startTime) - new Date(b[1].startTime));
    
    const toDelete = conversations.size - LIMITS.MAX_CONVERSATIONS + 100; // Delete extra 100 for buffer
    for (let i = 0; i < toDelete && i < sortedConvs.length; i++) {
      conversations.delete(sortedConvs[i][0]);
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
      cleaned++;
    }
    
    // Delete inactive bot conversations older than 24 hours
    if (conv.status === 'bot' && age > CLEANUP_INTERVALS.INACTIVE_BOTS) {
      conversations.delete(sessionId);
      cleaned++;
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
// sessionId -> { status: 'bot'|'human', messages: [], userId: null, startTime: Date }

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

CRITICAL RULES:
- NEVER discuss personal, emotional, or mental health topics
- NEVER provide counseling, emotional support, or personal advice
- NEVER engage with off-topic conversations about non-library topics
- IMMEDIATELY redirect to library services ONLY

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

IMPORTANT: When users ask about materials, documents, or solutions:
- ASSUME they're asking about library resources (books, manuals, guides)
- "Alternative Solutions" = likely a book title or solutions manual
- "Previous students' work" = likely past exam papers or study materials in library
- "Documents" = likely academic papers, journals, or library materials
- ALWAYS try to help them find these resources in the library first
- Ask clarifying questions: "Is 'Alternative Solutions' a book title? What course is it for?"
- Offer to search the library catalog
- Suggest similar resources if exact match isn't available

EXAMPLES OF GOOD RESPONSES:
User: "alternative solutions of previous students"
Bot: "Are you looking for a book or solutions manual called 'Alternative Solutions'? Or are you looking for past exam papers or study materials from previous students? I can help you search our library catalog. What course or subject is this for?"

User: "documents"
Bot: "What type of documents are you looking for? Academic papers, course materials, journals, or something else? I can help you search our library resources."

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

BE HELPFUL and ASSUME library-related intent when ambiguous. Keep responses SHORT and professional. Focus on helping users find library resources.`;


// Store librarian notifications in memory (in production, use a database)
const librarianNotifications = [];

// Get list of authorized librarian PSIDs
function getAuthorizedLibrarians() {
  return librarianData.authorizedPsids || [];
}

// Check if a PSID is an authorized librarian
function isAuthorizedLibrarian(psid) {
  const authorizedPsids = getAuthorizedLibrarians();
  return authorizedPsids.includes(psid);
}

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
      await axios.post(url, {
        recipient: { id: librarianPsid },
        message: {
          text: `🔔 New Librarian Request!\n\nSession: ${conversationData.sessionId}\n\n${message}\n\nView dashboard: ${process.env.WEBHOOK_URL?.replace('/webhook', '/librarian') || 'http://localhost:3000/librarian'}`
        }
      });

      console.log(`✅ Messenger notification sent to librarian: ${librarianPsid}`);
    } catch (error) {
      console.error(`❌ Error sending to librarian ${librarianPsid}:`, error.response?.data || error.message);
    }
  }
}

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], sessionId } = req.body;
    
    const startTime = Date.now();
    
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
    
    // Get or create conversation
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, {
        status: 'bot',
        messages: [],
        userId: null,
        startTime: new Date()
      });
      trackConversationStart(sessionId);
    }

    const conversation = conversations.get(sessionId);
    conversation.messages.push({ role: 'user', content: message, timestamp: new Date() });
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

    // Bot response
    // TODO: Add graceful degradation - if Ollama is down, queue message for retry
    // or provide fallback response directing user to librarian
    const messages = [
      { role: 'system', content: LIBRARY_CONTEXT }
    ];
    
    const recentHistory = history.slice(-LIMITS.CONVERSATION_HISTORY);
    messages.push(...recentHistory);
    messages.push({ role: 'user', content: message });

    const response = await ollama.chat({
      model: 'llama3.2',
      messages: messages,
      stream: false,
      options: {
        temperature: 0.7,
        top_p: 0.9
      }
    });

    const botResponse = response.message.content;
    
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
        startTime: new Date()
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
  console.log('💡 Librarians should use the web dashboard to respond: ' + (process.env.WEBHOOK_URL?.replace('/webhook', '/librarian') || 'http://localhost:3000/librarian'));
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
    res.json({
      status: conversation.status,
      messageCount: conversation.messages.length
    });
  } else {
    res.json({ status: 'bot', messageCount: 0 });
  }
});

// Librarian Dashboard - View all active conversations
app.get('/librarian', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'librarian.html'));
});

// Admin Dashboard - Manage librarian access
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Test endpoint to check webhook configuration
app.get('/api/test/webhook-status', (req, res) => {
  res.json({
    webhookConfigured: !!process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    verifyToken: !!process.env.FACEBOOK_VERIFY_TOKEN,
    pageId: !!process.env.FACEBOOK_PAGE_ID,
    librarianPsids: getAuthorizedLibrarians().length,
    pendingRequests: pendingLibrarianRequests.size,
    keyword: process.env.LIBRARIAN_REQUEST_KEYWORD || 'REQUEST_LIBRARIAN_ACCESS',
    recentWebhookCalls: 'Check server console for webhook logs'
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
      lastMessage: conv.messages[conv.messages.length - 1]
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
    
    res.json({
      sessionId,
      ...conversation,
      feedback: {
        thumbsUp,
        thumbsDown
      }
    });
  } else {
    res.status(404).json({ error: 'Conversation not found' });
  }
});

// API endpoint for librarian to respond
app.post('/api/librarian/respond', (req, res) => {
  const { sessionId, message } = req.body;
  
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
    // If this is the first librarian response to a bot/viewed conversation, add takeover notification
    const wasBot = conversation.status === 'bot' || conversation.status === 'viewed';
    
    if (wasBot) {
      // Add system message to notify user
      conversation.messages.push({
        role: 'assistant',
        content: '👤 A librarian is now assisting you. You can ask any questions and they will respond personally.',
        timestamp: new Date()
      });
      console.log('📢 Added librarian takeover notification');
    }
    
    // Add librarian's message
    conversation.messages.push({
      role: 'librarian',
      content: message,
      timestamp: new Date()
    });
    
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
  conversations: [] // Overall conversation feedback
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
