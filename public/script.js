const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatWidget = document.getElementById('chat-widget');
const chatToggle = document.getElementById('chat-toggle');
const closeChat = document.getElementById('close-chat');
const notificationBadge = document.querySelector('.notification-badge');
const requestLibrarianBtn = document.getElementById('request-librarian');
const statusIndicator = document.querySelector('.status');

let conversationHistory = [];
let isFirstOpen = true;
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let conversationStatus = 'bot';
let lastMessageCount = 0;
let pollingInterval = null;

// Toggle chat widget
chatToggle.addEventListener('click', () => {
  chatWidget.classList.add('open');
  chatToggle.classList.add('hidden');
  if (isFirstOpen) {
    notificationBadge.classList.add('hidden');
    isFirstOpen = false;
  }
  userInput.focus();
});

closeChat.addEventListener('click', () => {
  chatWidget.classList.remove('open');
  chatToggle.classList.remove('hidden');
});

function addMessage(content, isUser, sender = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  
  // Add sender label for bot messages
  if (!isUser && sender) {
    const senderLabel = document.createElement('div');
    senderLabel.className = 'message-sender';
    senderLabel.textContent = sender === 'librarian' ? '👤 Librarian' : '🤖 AI Assistant';
    messageDiv.appendChild(senderLabel);
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.textContent = content;
  messageDiv.appendChild(contentDiv);
  
  messagesContainer.appendChild(messageDiv);
  
  // Scroll the chat container (not messages container)
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message typing-indicator';
  typingDiv.id = 'typing';
  typingDiv.innerHTML = '<span></span><span></span><span></span>';
  messagesContainer.appendChild(typingDiv);
  
  // Scroll the chat container
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function removeTypingIndicator() {
  const typing = document.getElementById('typing');
  if (typing) typing.remove();
}

async function sendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  addMessage(message, true);
  userInput.value = '';
  sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message,
        history: conversationHistory,
        sessionId
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    if (data.success) {
      // Only add bot message if there's a response (not in librarian mode)
      if (data.response) {
        addMessage(data.response, false, 'bot');
        conversationHistory.push(
          { role: 'user', content: message },
          { role: 'assistant', content: data.response }
        );
        
        lastMessageCount = conversationHistory.length;
      } else {
        // In librarian mode - just add user message to history
        conversationHistory.push({ role: 'user', content: message });
      }
      
      if (data.status) {
        conversationStatus = data.status;
        updateStatusIndicator();
      }
    } else {
      addMessage('Sorry, I encountered an error. Please try again.', false, 'bot');
    }
  } catch (error) {
    removeTypingIndicator();
    addMessage('Sorry, I could not connect to the server.', false);
    console.error('Error:', error);
  }

  sendBtn.disabled = false;
  
  // Only focus input if not in librarian mode
  if (conversationStatus === 'bot') {
    userInput.focus();
  }
}

async function requestLibrarian() {
  requestLibrarianBtn.disabled = true;
  showTypingIndicator();

  try {
    const response = await fetch('/api/request-librarian', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sessionId,
        history: conversationHistory
      })
    });

    const data = await response.json();
    removeTypingIndicator();

    if (data.success) {
      conversationStatus = 'human';
      updateStatusIndicator();
      addMessage(data.message, false);
      addMessage('Please describe your question and a librarian will respond shortly.', false);
      
      // Initialize message count - start at 0 since conversation was just created
      lastMessageCount = 0;
    } else {
      addMessage('Sorry, could not connect to a librarian. Please try again.', false);
      requestLibrarianBtn.disabled = false;
    }
  } catch (error) {
    removeTypingIndicator();
    addMessage('Sorry, could not connect to a librarian.', false);
    requestLibrarianBtn.disabled = false;
    console.error('Error:', error);
  }
}

function updateStatusIndicator() {
  if (conversationStatus === 'human' || conversationStatus === 'responded') {
    statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
    requestLibrarianBtn.style.display = 'none';
    
    // Start polling for librarian responses
    if (!pollingInterval) {
      pollingInterval = setInterval(checkForNewMessages, 3000);
    }
  } else {
    statusIndicator.innerHTML = '<span class="status-dot"></span>AI Assistant';
  }
}

async function checkForNewMessages() {
  try {
    const response = await fetch(`/api/conversation/${sessionId}`);
    
    if (!response.ok) {
      console.log('Conversation not found yet');
      return;
    }
    
    const data = await response.json();
    
    console.log('Polling check:', {
      totalMessages: data.messages?.length || 0,
      lastMessageCount: lastMessageCount,
      hasNewMessages: (data.messages?.length || 0) > lastMessageCount,
      countdown: data.countdown
    });
    
    // Update status indicator with countdown if present
    if (data.countdown && data.countdown > 0) {
      statusIndicator.innerHTML = `<span class="status-dot human"></span>Session ending in ${data.countdown}s...`;
    } else if (conversationStatus === 'human' || conversationStatus === 'responded') {
      statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
    }
    
    if (data.messages && data.messages.length > lastMessageCount) {
      // New messages arrived
      const newMessages = data.messages.slice(lastMessageCount);
      
      console.log('New messages detected:', newMessages);
      
      newMessages.forEach(msg => {
        if (msg.role === 'librarian') {
          console.log('Adding librarian message:', msg.content);
          addMessage(msg.content, false, 'librarian');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        } else if (msg.role === 'assistant') {
          // System message (like session ended)
          console.log('Adding system message:', msg.content);
          addMessage(msg.content, false, 'bot');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        }
      });
      
      lastMessageCount = data.messages.length;
      
      // Force scroll to bottom after adding messages
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      // Check if session was ended (status changed back to bot)
      if (data.status === 'bot' && conversationStatus !== 'bot') {
        console.log('Session ended by librarian');
        conversationStatus = 'bot';
        updateStatusIndicator();
        
        // Stop polling
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        
        // Show the "Talk to Librarian" button again
        requestLibrarianBtn.style.display = 'flex';
        requestLibrarianBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error('Error checking for new messages:', error);
  }
}

sendBtn.addEventListener('click', sendMessage);
requestLibrarianBtn.addEventListener('click', requestLibrarian);

userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Welcome message
setTimeout(() => {
  addMessage('Hello! I\'m your library assistant. How can I help you today?', false);
  addMessage('If you need personalized help, you can request to speak with a librarian anytime.', false);
}, 500);
