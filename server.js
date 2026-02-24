import express from 'express';
import { Ollama } from 'ollama';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const ollama = new Ollama({ host: 'http://localhost:11434' });

app.use(express.json());
app.use(express.static('public'));

// Librarian data file
const LIBRARIAN_DATA_FILE = path.join(__dirname, 'librarian-data.json');

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

// Store active conversations and their status
const conversations = new Map();
// sessionId -> { status: 'bot'|'human', messages: [], userId: null, startTime: Date }

// Store pending librarian requests
const pendingLibrarianRequests = new Map();
// psid -> { psid, lastMessage: Date, messageCount: number, name: string }

// Store librarian profile info cache
const librarianProfiles = new Map();
// psid -> { name: string, profilePic: string }

// Fetch user profile from Facebook Graph API
async function fetchUserProfile(psid) {
  // Check cache first
  if (librarianProfiles.has(psid)) {
    return librarianProfiles.get(psid);
  }

  if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    return { name: 'Unknown', profilePic: null };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${psid}?fields=name,profile_pic&access_token=${process.env.FACEBOOK_PAGE_ACCESS_TOKEN}`;
    const response = await axios.get(url);
    
    const profile = {
      name: response.data.name || 'Unknown',
      profilePic: response.data.profile_pic || null
    };
    
    // Cache it
    librarianProfiles.set(psid, profile);
    
    return profile;
  } catch (error) {
    console.error('Error fetching user profile:', error.response?.data || error.message);
    return { name: 'Unknown', profilePic: null };
  }
}

const LIBRARY_CONTEXT = `You are a helpful library assistant chatbot. Your ONLY purpose is to help with library-related topics.

YOU CAN HELP WITH:
- Finding books, journals, and digital resources IN THE LIBRARY
- Library hours, locations, and policies
- Account information, holds, and renewals
- Research assistance and citation help
- Computer, printing, and study room services
- Library events, programs, and workshops
- Membership and library card information

YOU MUST POLITELY DECLINE AND NOT HELP WITH:
- Questions unrelated to library services (cars, concrete, shopping, etc.)
- General knowledge questions not related to using library resources
- Personal advice, medical, legal, or financial topics
- Technical support for personal devices
- Homework or assignment completion
- Finding or recommending things that are NOT library resources

CRITICAL: When asked about non-library topics (like cars, concrete, products, services outside the library):
- DO NOT try to help them find these things
- DO NOT suggest online searches or external resources
- DO NOT offer to research it for them
- SIMPLY decline politely and redirect to library services

Example responses for off-topic questions:
- "I'm specifically designed to help with library services only. I can't assist with [topic], but I'd be happy to help you find books, research materials, or other library resources. What can I help you with today?"
- "That's outside my area - I only handle library-related questions. Is there anything about our library services I can help you with?"

If you cannot fully help with a LIBRARY question or the user seems frustrated, suggest: "Would you like to speak with a librarian? They can provide more personalized assistance."

Keep responses concise, friendly, and focused ONLY on library services.`;


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
  if (librarianNotifications.length > 50) {
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
    
    // Get or create conversation
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, {
        status: 'bot',
        messages: [],
        userId: null,
        startTime: new Date()
      });
    }

    const conversation = conversations.get(sessionId);
    conversation.messages.push({ role: 'user', content: message, timestamp: new Date() });

    // If conversation is with human, queue message for librarian
    if (conversation.status === 'human') {
      await sendToMessenger(message, { sessionId, ...conversation });
      
      res.json({
        response: 'A librarian will respond to you shortly. Please wait...',
        success: true,
        status: 'human'
      });
      return;
    }

    // Bot response
    const messages = [
      { role: 'system', content: LIBRARY_CONTEXT }
    ];
    
    const recentHistory = history.slice(-10);
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

    conversation.messages.push({ 
      role: 'assistant', 
      content: response.message.content, 
      timestamp: new Date() 
    });

    res.json({ 
      response: response.message.content,
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
      conversations.set(sessionId, {
        status: 'human',
        messages: history,
        userId: null,
        startTime: new Date()
      });
    }

    const conversation = conversations.get(sessionId);
    conversation.status = 'human';

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
      message: 'A librarian has been notified and will assist you shortly.'
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
  
  // Fetch names for all PSIDs
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

// API endpoint for librarian to respond
app.post('/api/librarian/respond', (req, res) => {
  const { sessionId, message } = req.body;
  const conversation = conversations.get(sessionId);
  
  if (conversation) {
    conversation.messages.push({
      role: 'librarian',
      content: message,
      timestamp: new Date()
    });
    
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Conversation not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Library chatbot server running on http://localhost:${PORT}`);
});
