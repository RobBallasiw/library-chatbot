const messagesContainer = document.getElementById('messages');
const chatContainer = document.getElementById('chat-container');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatWidget = document.getElementById('chat-widget');
const chatToggle = document.getElementById('chat-toggle');
const closeChat = document.getElementById('close-chat');
const notificationBadge = document.querySelector('.notification-badge');
const requestLibrarianBtn = document.getElementById('request-librarian');
const newChatBtn = document.getElementById('new-chat-btn');
const statusIndicator = document.querySelector('.status');

let conversationHistory = [];
let isFirstOpen = true;
let sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
let conversationStatus = 'bot';
let lastMessageCount = 0;
let pollingInterval = null;
let consecutiveErrors = 0; // Track polling failures

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
  const messageId = isUser ? null : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addMessageWithFeedback(content, isUser, sender, messageId);
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
    // Add timeout for slow server response (Render wake-up)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

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

    // Handle rate limiting
    if (response.status === 429) {
      removeTypingIndicator();
      
      // Retry-After header is in seconds
      const retryAfter = response.headers.get('Retry-After');
      let waitTime = retryAfter ? parseInt(retryAfter) : 30;
      
      // Cap wait time at 30 seconds (our window) to prevent display bugs
      if (waitTime > 30) {
        console.warn('Rate limit wait time too high:', waitTime, 'capping at 30s');
        waitTime = 30;
      }
      
      addMessage(`You're sending messages too quickly. Please wait ${waitTime} seconds before trying again.`, false, 'bot');
      
      // Disable send button temporarily
      sendBtn.disabled = true;
      let remaining = waitTime;
      
      const countdownInterval = setInterval(() => {
        remaining--;
        if (remaining > 0) {
          sendBtn.textContent = `Wait ${remaining}s`;
        } else {
          clearInterval(countdownInterval);
          sendBtn.textContent = 'Send';
          sendBtn.disabled = false;
        }
      }, 1000);
      
      userInput.focus();
      return;
    }

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
      
      // Check for new messages immediately after sending (in case librarian intervened)
      if (conversationStatus === 'bot' || conversationStatus === 'viewed') {
        setTimeout(checkForLibrarianIntervention, 1000);
      }
    } else {
      addMessage('Sorry, I encountered an error. Please try again.', false, 'bot');
    }
  } catch (error) {
    removeTypingIndicator();
    
    // Check if it's a timeout error
    if (error.name === 'AbortError') {
      addMessage('The server is taking longer than expected. This might be because the service is waking up. Please try again in a moment.', false, 'bot');
    } else {
      addMessage('Sorry, I could not connect to the server. Please check your internet connection and try again.', false, 'bot');
    }
    console.error('Error:', error);
  }

  sendBtn.disabled = false;
  
  // Only focus input if not in librarian mode
  if (conversationStatus === 'bot') {
    userInput.focus();
  }
}

async function checkForLibrarianIntervention() {
  try {
    const response = await fetch(`/api/conversation/${sessionId}?skipView=true`);
    
    if (!response.ok) {
      return;
    }
    
    const data = await response.json();
    
    // Check if status changed to 'responded' (librarian intervened)
    if (data.status === 'responded' && conversationStatus !== 'responded') {
      console.log('🔔 Librarian has intervened!');
      conversationStatus = 'responded';
      
      // Update status indicator
      statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
      requestLibrarianBtn.style.display = 'none';
      
      // Get new messages from the conversation
      if (data.messages && data.messages.length > lastMessageCount) {
        const newMessages = data.messages.slice(lastMessageCount);
        
        console.log('New messages from librarian intervention:', newMessages);
        
        // Separate system messages and librarian messages
        const systemMessages = newMessages.filter(msg => msg.role === 'assistant');
        const librarianMessages = newMessages.filter(msg => msg.role === 'librarian');
        
        // Show system messages first (takeover notification)
        systemMessages.forEach(msg => {
          addMessage(msg.content, false, 'bot');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        });
        
        // Show librarian messages after a brief delay (1.5 seconds)
        setTimeout(() => {
          librarianMessages.forEach(msg => {
            addMessage(msg.content, false, 'librarian');
            conversationHistory.push({ role: 'assistant', content: msg.content });
          });
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 1500);
        
        lastMessageCount = data.messages.length;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      
      // Start polling for librarian messages
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
      
      // Set message count to match server's conversation (which was created with history)
      // The notification message we just added is NOT on the server yet
      lastMessageCount = conversationHistory.length - 1;
      
      console.log('📊 Librarian requested, lastMessageCount set to:', lastMessageCount);
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
    
    // Reset error counter on successful fetch
    consecutiveErrors = 0;
    
    // Update status indicator with countdown if present
    if (data.countdown && data.countdown > 0) {
      statusIndicator.innerHTML = `<span class="status-dot human"></span>Session ending in ${data.countdown}s...`;
      statusIndicator.classList.add('countdown');
    } else if (conversationStatus === 'human' || conversationStatus === 'responded') {
      statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
      statusIndicator.classList.remove('countdown');
    }
    
    if (data.messages && data.messages.length > lastMessageCount) {
      // New messages arrived
      const newMessages = data.messages.slice(lastMessageCount);
      
      newMessages.forEach(msg => {
        if (msg.role === 'librarian') {
          addMessage(msg.content, false, 'librarian');
          conversationHistory.push({ role: 'assistant', content: msg.content });
          
          // Update status to show connected to librarian
          if (conversationStatus !== 'responded') {
            conversationStatus = 'responded';
            statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
            requestLibrarianBtn.style.display = 'none';
            
            // Start polling if not already polling
            if (!pollingInterval) {
              pollingInterval = setInterval(checkForNewMessages, 3000);
            }
          }
        } else if (msg.role === 'assistant') {
          // System message (like session ended or librarian takeover)
          addMessage(msg.content, false, 'bot');
          conversationHistory.push({ role: 'assistant', content: msg.content });
        }
      });
      
      lastMessageCount = data.messages.length;
      
      // Force scroll to bottom after adding messages
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
      // Check if session was ended (status changed to closed)
      if (data.status === 'closed' && conversationStatus !== 'bot') {
        conversationStatus = 'closed';
        statusIndicator.classList.remove('countdown');
        
        // Disable input and send button
        userInput.disabled = true;
        userInput.placeholder = 'This session has been closed. Please start a new chat.';
        sendBtn.disabled = true;
        
        // Stop polling
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        
        // Hide the "Talk to Librarian" button and show "Start New Chat" button
        requestLibrarianBtn.style.display = 'none';
        newChatBtn.style.display = 'flex';
        
        // Update status to show session is closed
        statusIndicator.innerHTML = '<span class="status-dot" style="background: #6b7280;"></span>Session Closed';
        
        // Show rating modal after a short delay
        setTimeout(() => {
          showFeedbackModal();
        }, 1000);
      }
    }
  } catch (error) {
    console.error('Error checking for new messages:', error);
    consecutiveErrors++;
    
    // Show error indicator after 3 consecutive failures
    if (consecutiveErrors >= 3) {
      statusIndicator.innerHTML = '<span class="status-dot" style="background: #ef4444;"></span>Connection Error';
      statusIndicator.classList.add('error');
    }
  }
}

function startNewChat() {
  // Generate new session ID
  sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // Reset conversation state
  conversationHistory = [];
  conversationStatus = 'bot';
  lastMessageCount = 0;
  
  // Clear messages
  messagesContainer.innerHTML = '';
  
  // Re-enable input
  userInput.disabled = false;
  userInput.placeholder = 'Type your question...';
  userInput.value = '';
  sendBtn.disabled = false;
  
  // Show librarian button, hide new chat button
  requestLibrarianBtn.style.display = 'flex';
  requestLibrarianBtn.disabled = false;
  newChatBtn.style.display = 'none';
  
  // Reset status
  updateStatusIndicator();
  
  // Show welcome message for new chat
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

// Welcome message (only once on page load)
setTimeout(() => {
  // Check if server is awake by making a lightweight request
  fetch('/api/conversation-status/' + sessionId)
    .then(() => {
      // Server is awake, show welcome message
      addMessage('Hello! I\'m your library assistant. How can I help you today?\n\nIf you need personalized help, you can request to speak with a librarian anytime.', false, 'bot');
    })
    .catch(() => {
      // Server might be waking up
      addMessage('Hello! I\'m your library assistant. The service is starting up, please wait a moment...', false, 'bot');
      
      // Retry after 5 seconds
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

// Continuously check for librarian intervention (every 3 seconds)
// Only check if user is still in bot mode
setInterval(() => {
  if (conversationStatus === 'bot' || conversationStatus === 'viewed') {
    checkForLibrarianIntervention();
  }
}, 3000);


// ============================================
// FEEDBACK SYSTEM
// ============================================

let selectedRating = 0;
let messageFeedback = {}; // Store feedback for individual messages

// Add feedback buttons to bot messages
function addMessageWithFeedback(content, isUser, sender = null, messageId = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
  
  if (messageId) {
    messageDiv.setAttribute('data-message-id', messageId);
  }
  
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
  
  // Add feedback buttons for bot messages (not librarian)
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
  
  messagesContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Give feedback on a specific message
function giveFeedback(messageId, type) {
  messageFeedback[messageId] = type;
  
  // Update UI
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    const buttons = messageEl.querySelectorAll('.feedback-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = messageEl.querySelector(`.feedback-btn.thumbs-${type}`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }
  }
  
  // Send feedback to server
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

// Show feedback modal when conversation ends
function showFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('active');
  selectedRating = 0;
  document.getElementById('feedback-comment').value = '';
  
  // Reset stars
  document.querySelectorAll('.star').forEach(star => {
    star.classList.remove('active');
  });
}

// Close feedback modal
function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.remove('active');
}

// Handle star rating
document.addEventListener('DOMContentLoaded', () => {
  const stars = document.querySelectorAll('.star');
  
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.getAttribute('data-rating'));
      
      // Update star display
      stars.forEach((s, index) => {
        if (index < selectedRating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
    
    // Hover effect
    star.addEventListener('mouseenter', () => {
      const rating = parseInt(star.getAttribute('data-rating'));
      stars.forEach((s, index) => {
        if (index < rating) {
          s.style.color = '#ffc107';
        } else {
          s.style.color = '#ddd';
        }
      });
    });
  });
  
  // Reset on mouse leave
  document.querySelector('.star-rating').addEventListener('mouseleave', () => {
    stars.forEach((s, index) => {
      if (index < selectedRating) {
        s.style.color = '#ffc107';
      } else {
        s.style.color = '#ddd';
      }
    });
  });
});

// Submit feedback
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
      // Show thank you message
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
      
      // Auto-close after 3 seconds
      setTimeout(() => {
        closeFeedbackModal();
      }, 3000);
    }
  } catch (error) {
    console.error('Error submitting feedback:', error);
    alert('Failed to submit feedback. Please try again.');
  }
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  const modal = document.getElementById('feedback-modal');
  if (e.target === modal) {
    closeFeedbackModal();
  }
});
