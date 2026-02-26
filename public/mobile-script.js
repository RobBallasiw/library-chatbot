const messagesContainer = document.getElementById('messages-container');
const messages = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusIndicator = document.getElementById('status-indicator');
const requestLibrarianBtn = document.getElementById('request-librarian');
const newChatBtn = document.getElementById('new-chat-btn');
const menuBtn = document.getElementById('menu-btn');
const menuOverlay = document.getElementById('menu-overlay');
const closeMenuBtn = document.getElementById('close-menu-btn');
const newChatMenu = document.getElementById('new-chat-menu');
const librarianMenu = document.getElementById('librarian-menu');

let conversationHistory = [];
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let conversationStatus = 'bot';
let lastMessageCount = 0;
let pollingInterval = null;
let consecutiveErrors = 0;

// Auto-resize textarea
userInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Menu handlers
menuBtn.addEventListener('click', () => {
  menuOverlay.classList.add('active');
});

closeMenuBtn.addEventListener('click', () => {
  menuOverlay.classList.remove('active');
});

menuOverlay.addEventListener('click', (e) => {
  if (e.target === menuOverlay) {
    menuOverlay.classList.remove('active');
  }
});

newChatMenu.addEventListener('click', () => {
  menuOverlay.classList.remove('active');
  startNewChat();
});

librarianMenu.addEventListener('click', () => {
  menuOverlay.classList.remove('active');
  if (!requestLibrarianBtn.disabled) {
    requestLibrarian();
  }
});

function addMessage(content, isUser, sender = null) {
  const messageId = isUser ? null : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addMessageWithFeedback(content, isUser, sender, messageId);
}

function showTypingIndicator() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message typing-indicator';
  typingDiv.id = 'typing';
  typingDiv.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(typingDiv);
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
  userInput.style.height = 'auto';
  sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message,
        history: conversationHistory,
        sessionId
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      removeTypingIndicator();
      const retryAfter = response.headers.get('Retry-After');
      let waitTime = retryAfter ? parseInt(retryAfter) : 30;
      
      if (waitTime > 30) {
        waitTime = 30;
      }
      
      addMessage(`You're sending messages too quickly. Please wait ${waitTime} seconds before trying again.`, false, 'bot');
      
      sendBtn.disabled = true;
      let remaining = waitTime;
      
      const countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          sendBtn.innerHTML = `<span style="font-size: 14px;">${remaining}s</span>`;
        } else {
          clearInterval(countdownInterval);
          sendBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
          sendBtn.disabled = false;
        }
      }, 1000);
      
      userInput.focus();
      return;
    }

    const data = await response.json();
    removeTypingIndicator();

    if (data.success) {
      if (data.response) {
        addMessage(data.response, false, 'bot');
        conversationHistory.push(
          { role: 'user', content: message },
          { role: 'assistant', content: data.response }
        );
        lastMessageCount = conversationHistory.length;
      } else {
        conversationHistory.push({ role: 'user', content: message });
      }
      
      if (data.status) {
        conversationStatus = data.status;
        updateStatusIndicator();
      }
      
      if (conversationStatus === 'bot' || conversationStatus === 'viewed') {
        setTimeout(checkForLibrarianIntervention, 1000);
      }
    } else {
      addMessage('Sorry, I encountered an error. Please try again.', false, 'bot');
    }
  } catch (error) {
    removeTypingIndicator();
    
    if (error.name === 'AbortError') {
      addMessage('The server is taking longer than expected. This might be because the service is waking up. Please try again in a moment.', false, 'bot');
    } else {
      addMessage('Sorry, I could not connect to the server. Please check your internet connection and try again.', false, 'bot');
    }
    console.error('Error:', error);
  }

  sendBtn.disabled = false;
  
  if (conversationStatus === 'bot') {
    userInput.focus();
  }
}

async function checkForLibrarianIntervention() {
  try {
    const response = await fetch(`/api/conversation/${sessionId}?skipView=true`);
    
    if (!response.ok) return;
    
    const data = await response.json();
    
    if (data.status === 'responded' && conversationStatus !== 'responded') {
      console.log('🔔 Librarian has intervened!');
      conversationStatus = 'responded';
      
      statusIndicator.innerHTML = '<span class="status-dot human"></span><span>Connected to Librarian</span>';
      requestLibrarianBtn.style.display = 'none';
      
      if (data.messages && data.messages.length > lastMessageCount) {
        const newMessages = data.messages.slice(lastMessageCount);
        
        const systemMessages = newMessages.filter(msg => msg.role === 'assistant');
        const librarianMessages = newMessages.filter(msg => msg.role === 'librarian');
        
        systemMessages.forEach(msg => {
          addMessage(msg.content, false, 'bot');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        });
        
        setTimeout(() => {
          librarianMessages.forEach(msg => {
            addMessage(msg.content, false, 'librarian');
            conversationHistory.push({ role: 'assistant', content: msg.content });
          });
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 1500);
        
        lastMessageCount = data.messages.length;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
      
      if (!pollingInterval) {
        pollingInterval = setInterval(checkForNewMessages, 3000);
      }
    }
  } catch (error) {
    console.error('Error checking for librarian intervention:', error);
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
      addMessage(data.message, false, 'bot');
      lastMessageCount = conversationHistory.length - 1;
    } else {
      addMessage('Sorry, could not connect to a librarian. Please try again.', false, 'bot');
      requestLibrarianBtn.disabled = false;
    }
  } catch (error) {
    removeTypingIndicator();
    addMessage('Sorry, could not connect to a librarian.', false, 'bot');
    requestLibrarianBtn.disabled = false;
    console.error('Error:', error);
  }
}

function updateStatusIndicator() {
  if (conversationStatus === 'human' || conversationStatus === 'responded') {
    statusIndicator.innerHTML = '<span class="status-dot human"></span><span>Connected to Librarian</span>';
    requestLibrarianBtn.style.display = 'none';
    
    if (!pollingInterval) {
      pollingInterval = setInterval(checkForNewMessages, 3000);
    }
  } else {
    statusIndicator.innerHTML = '<span class="status-dot"></span><span>AI Assistant</span>';
  }
}

async function checkForNewMessages() {
  try {
    const response = await fetch(`/api/conversation/${sessionId}`);
    
    if (!response.ok) return;
    
    const data = await response.json();
    consecutiveErrors = 0;
    
    if (data.countdown && data.countdown > 0) {
      statusIndicator.innerHTML = `<span class="status-dot human"></span><span>Session ending in ${data.countdown}s...</span>`;
      statusIndicator.classList.add('countdown');
    } else if (conversationStatus === 'human' || conversationStatus === 'responded') {
      statusIndicator.innerHTML = '<span class="status-dot human"></span><span>Connected to Librarian</span>';
      statusIndicator.classList.remove('countdown');
    }
    
    if (data.messages && data.messages.length > lastMessageCount) {
      const newMessages = data.messages.slice(lastMessageCount);
      
      newMessages.forEach(msg => {
        if (msg.role === 'librarian') {
          addMessage(msg.content, false, 'librarian');
          conversationHistory.push({ role: 'assistant', content: msg.content });
          
          if (conversationStatus !== 'responded') {
            conversationStatus = 'responded';
            statusIndicator.innerHTML = '<span class="status-dot human"></span><span>Connected to Librarian</span>';
            requestLibrarianBtn.style.display = 'none';
            
            if (!pollingInterval) {
              pollingInterval = setInterval(checkForNewMessages, 3000);
            }
          }
        } else if (msg.role === 'assistant') {
          addMessage(msg.content, false, 'bot');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        }
      });
      
      lastMessageCount = data.messages.length;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      if (data.status === 'closed' && conversationStatus !== 'bot') {
        conversationStatus = 'closed';
        statusIndicator.classList.remove('countdown');
        
        userInput.disabled = true;
        userInput.placeholder = 'This session has been closed. Please start a new chat.';
        sendBtn.disabled = true;
        
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        
        requestLibrarianBtn.style.display = 'none';
        newChatBtn.style.display = 'flex';
        
        statusIndicator.innerHTML = '<span class="status-dot" style="background: #6b7280;"></span><span>Session Closed</span>';
        
        setTimeout(() => {
          showFeedbackModal();
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Error checking for new messages:', error);
    consecutiveErrors++;
    
    if (consecutiveErrors >= 3) {
      statusIndicator.innerHTML = '<span class="status-dot" style="background: #ef4444;"></span><span>Connection Error</span>';
    }
  }
}

function startNewChat() {
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  conversationHistory = [];
  conversationStatus = 'bot';
  lastMessageCount = 0;
  
  messages.innerHTML = '';
  
  userInput.disabled = false;
  userInput.placeholder = 'Type your question...';
  userInput.value = '';
  userInput.style.height = 'auto';
  sendBtn.disabled = false;
  
  requestLibrarianBtn.style.display = 'flex';
  requestLibrarianBtn.disabled = false;
  newChatBtn.style.display = 'none';
  
  updateStatusIndicator();
  
  setTimeout(() => {
    addMessage('Hello! I\'m your library assistant. How can I help you today?\n\nIf you need personalized help, you can request to speak with a librarian anytime.', false, 'bot');
  }, 300);
}

sendBtn.addEventListener('click', sendMessage);
requestLibrarianBtn.addEventListener('click', requestLibrarian);
newChatBtn.addEventListener('click', startNewChat);

userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Welcome message
setTimeout(() => {
  fetch('/api/conversation-status/' + sessionId)
    .then(() => {
      addMessage('Hello! I\'m your library assistant. How can I help you today?\n\nIf you need personalized help, you can request to speak with a librarian anytime.', false, 'bot');
    })
    .catch(() => {
      addMessage('Hello! I\'m your library assistant. The service is starting up, please wait a moment...', false, 'bot');
      
      setTimeout(() => {
        fetch('/api/conversation-status/' + sessionId)
          .then(() => {
            removeTypingIndicator();
            addMessage('Ready! How can I help you today?\n\nIf you need personalized help, you can request to speak with a librarian anytime.', false, 'bot');
          })
          .catch(() => {
            addMessage('Service is still starting. Please refresh the page in a moment.', false, 'bot');
          });
      }, 5000);
    });
}, 500);

// Check for librarian intervention
setInterval(() => {
  if (conversationStatus === 'bot' || conversationStatus === 'viewed') {
    checkForLibrarianIntervention();
  }
}, 3000);

// Feedback System
let selectedRating = 0;
let messageFeedback = {};

function addMessageWithFeedback(content, isUser, sender = null, messageId = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  
  if (messageId) {
    messageDiv.setAttribute('data-message-id', messageId);
  }
  
  if (!isUser && sender) {
    const senderLabel = document.createElement('div');
    senderLabel.className = 'message-sender';
    senderLabel.textContent = sender === 'librarian' ? '👤 Librarian' : '🤖 AI Assistant';
    messageDiv.appendChild(senderLabel);
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.textContent = content;
  messageDiv.appendChild(contentDiv);
  
  if (!isUser && sender === 'bot' && messageId) {
    const feedbackDiv = document.createElement('div');
    feedbackDiv.className = 'message-feedback';
    feedbackDiv.innerHTML = `
      <button class="feedback-btn thumbs-up" onclick="giveFeedback('${messageId}', 'up')" title="Helpful">
        👍
      </button>
      <button class="feedback-btn thumbs-down" onclick="giveFeedback('${messageId}', 'down')" title="Not helpful">
        👎
      </button>
    `;
    messageDiv.appendChild(feedbackDiv);
  }
  
  messages.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function giveFeedback(messageId, type) {
  messageFeedback[messageId] = type;
  
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    const buttons = messageEl.querySelectorAll('.feedback-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = messageEl.querySelector(`.feedback-btn.thumbs-${type}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }
  
  fetch('/api/feedback/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      messageId,
      type,
      timestamp: new Date().toISOString()
    })
  }).catch(error => console.error('Error sending feedback:', error));
}

function showFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('active');
  selectedRating = 0;
  document.getElementById('feedback-comment').value = '';
  
  document.querySelectorAll('.star').forEach(star => {
    star.classList.remove('active');
  });
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  const stars = document.querySelectorAll('.star');
  
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.getAttribute('data-rating'));
      
      stars.forEach((s, index) => {
        if (index < selectedRating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });
});

async function submitFeedback() {
  if (selectedRating === 0) {
    alert('Please select a rating');
    return;
  }
  
  const comment = document.getElementById('feedback-comment').value.trim();
  
  try {
    const response = await fetch('/api/feedback/conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        rating: selectedRating,
        comment,
        messageFeedback,
        timestamp: new Date().toISOString()
      })
    });
    
    if (response.ok) {
      const modalBody = document.querySelector('.feedback-modal-body');
      modalBody.innerHTML = `
        <div class="feedback-thank-you">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <h3>Thank You!</h3>
          <p>Your feedback helps us improve our service.</p>
          <button class="feedback-submit-btn" onclick="closeFeedbackModal()">Close</button>
        </div>
      `;
      
      setTimeout(() => {
        closeFeedbackModal();
      }, 3000);
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);
    alert('Failed to submit feedback. Please try again.');
  }
}

document.addEventListener('click', (e) => {
  const modal = document.getElementById('feedback-modal');
  if (e.target === modal) {
    closeFeedbackModal();
  }
});
