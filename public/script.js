const messagesContainer = document.getElementById('messages');
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

function addMessage(content, isUser) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  messageDiv.textContent = content;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message typing-indicator';
  typingDiv.id = 'typing';
  typingDiv.innerHTML = '<span></span><span></span><span></span>';
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
      addMessage(data.response, false);
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      );
      
      if (data.status) {
        conversationStatus = data.status;
        updateStatusIndicator();
      }
    } else {
      addMessage('Sorry, I encountered an error. Please try again.', false);
    }
  } catch (error) {
    removeTypingIndicator();
    addMessage('Sorry, I could not connect to the server.', false);
    console.error('Error:', error);
  }

  sendBtn.disabled = false;
  userInput.focus();
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
  if (conversationStatus === 'human') {
    statusIndicator.innerHTML = '<span class="status-dot human"></span>Librarian notified';
    requestLibrarianBtn.style.display = 'none';
  } else {
    statusIndicator.innerHTML = '<span class="status-dot"></span>AI Assistant';
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
