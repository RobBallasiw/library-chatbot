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

// New elements for features
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const filePreviewImg = document.getElementById('file-preview-img');
const filePreviewInfo = document.getElementById('file-preview-info');
const removeFileBtn = document.getElementById('remove-file-btn');
const typingPreview = document.getElementById('typing-preview');
const themeToggle = document.getElementById('theme-toggle');
const quickReplies = document.getElementById('quick-replies');

// Debug: Log element status
console.log('=== FILE UPLOAD DEBUG ===');
console.log('attachBtn:', attachBtn);
console.log('fileInput:', fileInput);
console.log('filePreview:', filePreview);
console.log('filePreviewInfo:', filePreviewInfo);
console.log('removeFileBtn:', removeFileBtn);
console.log('========================');

let conversationHistory = [];
let isFirstOpen = true;
let sessionId = generateSessionId();
let conversationStatus = 'bot';
let selectedFile = null;
let typingPreviewTimeout = null;
let messageReactions = {}; // Store reactions per message

// Generate human-friendly session ID
function generateSessionId() {
  const adjectives = ['happy', 'bright', 'swift', 'calm', 'wise', 'kind', 'bold', 'cool', 'warm', 'smart'];
  const nouns = ['panda', 'tiger', 'eagle', 'dolphin', 'fox', 'owl', 'bear', 'wolf', 'lion', 'hawk'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9999);
  
  return `${adj}-${noun}-${num}`;
}
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

// File upload functionality
console.log('Setting up file upload...');

if (attachBtn && fileInput) {
  console.log('✓ Attach button and file input found');
  
  // Method 1: Direct click handler
  attachBtn.onclick = function(e) {
    console.log('>>> Attach button clicked (onclick)');
    e.preventDefault();
    e.stopPropagation();
    fileInput.click();
    return false;
  };
  
  // Method 2: Event listener (backup)
  attachBtn.addEventListener('click', function(e) {
    console.log('>>> Attach button clicked (addEventListener)');
    e.preventDefault();
    e.stopPropagation();
    fileInput.click();
  }, true); // Use capture phase

  fileInput.addEventListener('change', (e) => {
    console.log('>>> File input changed');
    const file = e.target.files[0];
    if (file) {
      console.log('>>> File selected:', file.name, file.size, file.type);
      handleFileSelection(file);
    } else {
      console.log('>>> No file selected');
    }
  });
  
  console.log('✓ Event listeners attached');
} else {
  console.error('✗ Missing elements:', { 
    attachBtn: !!attachBtn, 
    fileInput: !!fileInput 
  });
}

if (removeFileBtn) {
  removeFileBtn.addEventListener('click', () => {
    console.log('>>> Remove file clicked');
    clearFileSelection();
  });
} else {
  console.error('✗ Remove file button not found');
}

// Drag and Drop functionality
const dropZone = document.getElementById('chat-container');
const dropOverlay = document.getElementById('drop-overlay');

if (dropZone) {
  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Highlight drop zone when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('drag-over');
      if (dropOverlay) dropOverlay.style.display = 'flex';
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('drag-over');
      if (dropOverlay) dropOverlay.style.display = 'none';
    }, false);
  });

  // Handle dropped files
  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
      console.log('File dropped:', files[0].name);
      handleFileSelection(files[0]);
    }
  }, false);
} else {
  console.error('Drop zone not found');
}

function handleFileSelection(file) {
  console.log('handleFileSelection called with file:', file);
  
  // Check file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    alert('File size must be less than 5MB');
    return;
  }

  selectedFile = file;
  
  if (!filePreview) {
    console.error('filePreview element not found');
    return;
  }
  
  filePreview.style.display = 'block';

  // Show file info
  const fileName = filePreviewInfo.querySelector('.file-name');
  const fileSize = filePreviewInfo.querySelector('.file-size');
  
  if (fileName && fileSize) {
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
  } else {
    console.error('fileName or fileSize element not found');
  }

  // Show image preview if it's an image
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      filePreviewImg.src = e.target.result;
      filePreviewImg.style.display = 'block';
      const fileIcon = filePreviewInfo.querySelector('.file-icon');
      if (fileIcon) fileIcon.style.display = 'none';
    };
    reader.readAsDataURL(file);
  } else {
    filePreviewImg.style.display = 'none';
    const fileIcon = filePreviewInfo.querySelector('.file-icon');
    if (fileIcon) fileIcon.style.display = 'block';
  }
  
  console.log('File preview should now be visible');
}

function clearFileSelection() {
  selectedFile = null;
  fileInput.value = '';
  filePreview.style.display = 'none';
  filePreviewImg.src = '';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Typing preview functionality
userInput.addEventListener('input', () => {
  const text = userInput.value.trim();
  
  if (text.length > 0) {
    // Show typing preview
    typingPreview.style.display = 'flex';
    typingPreview.querySelector('.typing-preview-text').textContent = text;
    
    // Clear previous timeout
    if (typingPreviewTimeout) {
      clearTimeout(typingPreviewTimeout);
    }
    
    // Hide preview after 2 seconds of no typing
    typingPreviewTimeout = setTimeout(() => {
      typingPreview.style.display = 'none';
    }, 2000);
  } else {
    typingPreview.style.display = 'none';
  }
});

// Hide typing preview on Enter
userInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    typingPreview.style.display = 'none';
    if (typingPreviewTimeout) {
      clearTimeout(typingPreviewTimeout);
    }
  }
});

function addMessage(content, isUser, sender = null, attachment = null) {
  const messageId = isUser ? `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addMessageWithFeedback(content, isUser, sender, messageId, attachment);
  
  // Update message status for user messages
  if (isUser) {
    setTimeout(() => updateMessageStatus(messageId, 'sent'), 500);
    setTimeout(() => updateMessageStatus(messageId, 'delivered'), 1000);
  }
}

function updateMessageStatus(messageId, status) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) return;
  
  const statusEl = messageEl.querySelector('.message-status');
  if (!statusEl) return;
  
  const icons = {
    sending: '○',
    sent: '✓',
    delivered: '✓✓',
    read: '✓✓'
  };
  
  const classes = {
    sending: 'status-sending',
    sent: 'status-sent',
    delivered: 'status-delivered',
    read: 'status-read'
  };
  
  statusEl.innerHTML = `<span class="status-icon ${classes[status]}">${icons[status]}</span>`;
}

function showTypingIndicator(customText = null) {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message typing-indicator';
  typingDiv.id = 'typing';
  
  if (customText) {
    typingDiv.innerHTML = `<span class="typing-label">${customText}</span><span></span><span></span><span></span>`;
  } else {
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
  }
  
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
  if (!message && !selectedFile) return;

  // Stop typing indicator when sending
  if (isUserTyping) {
    isUserTyping = false;
    sendTypingStatus(false);
  }
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  // Prepare attachment data
  let attachmentData = null;
  if (selectedFile) {
    const reader = new FileReader();
    const fileData = await new Promise((resolve) => {
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(selectedFile);
    });
    
    attachmentData = {
      name: selectedFile.name,
      type: selectedFile.type,
      size: selectedFile.size,
      data: fileData
    };
  }

  addMessage(message || '📎 Sent a file', true, null, attachmentData);
  userInput.value = '';
  clearFileSelection();
  sendBtn.disabled = true;
  
  // Show special indicator for image analysis
  if (attachmentData && attachmentData.type.startsWith('image/')) {
    showTypingIndicator('🖼️ Analyzing image...');
  } else {
    showTypingIndicator();
  }

  try {
    // Add timeout for slow server response (Render wake-up)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    const requestBody = { 
      message: message || '📎 File attached',
      history: conversationHistory,
      sessionId
    };
    
    // Add attachment with full data
    if (attachmentData) {
      requestBody.attachment = {
        name: attachmentData.name,
        type: attachmentData.type,
        size: attachmentData.size,
        data: attachmentData.data // Include the base64 data
      };
    }

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
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
    
    // Silently ignore 404 (conversation not created yet) and other errors
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
            // Debug log
            console.log('📨 Loading librarian message from history:', {
              content: msg.content,
              hasAttachment: !!msg.attachment,
              attachment: msg.attachment
            });
            
            // Pass attachment if present
            const attachmentData = msg.attachment ? {
              name: msg.attachment.name,
              type: msg.attachment.type,
              size: msg.attachment.size,
              data: msg.attachment.data
            } : null;
            
            addMessage(msg.content, false, 'librarian', attachmentData);
            conversationHistory.push({ role: 'assistant', content: msg.content });
          });
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }, 1500);
        
        lastMessageCount = data.messages.length;
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      
      // Start polling for librarian messages
      if (!pollingInterval) {
        pollingInterval = setInterval(checkForNewMessages, 5000); // Changed from 3s to 5s
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
      pollingInterval = setInterval(checkForNewMessages, 5000); // Changed from 3s to 5s
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
          // Debug log
          console.log('📨 Received librarian message:', {
            content: msg.content,
            hasAttachment: !!msg.attachment,
            attachment: msg.attachment
          });
          
          // Pass attachment if present
          const attachmentData = msg.attachment ? {
            name: msg.attachment.name,
            type: msg.attachment.type,
            size: msg.attachment.size,
            data: msg.attachment.data
          } : null;
          
          addMessage(msg.content, false, 'librarian', attachmentData);
          conversationHistory.push({ role: 'assistant', content: msg.content });
          
          // Update status to show connected to librarian
          if (conversationStatus !== 'responded') {
            conversationStatus = 'responded';
            statusIndicator.innerHTML = '<span class="status-dot human"></span>Connected to Librarian';
            requestLibrarianBtn.style.display = 'none';
            
            // Start polling if not already polling
            if (!pollingInterval) {
              pollingInterval = setInterval(checkForNewMessages, 5000); // Changed from 3s to 5s
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
  sessionId = generateSessionId();
  
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

// Typing indicator functionality
let typingTimeout = null;
let isUserTyping = false;

userInput.addEventListener('input', () => {
  // Only send typing indicator if connected to librarian
  if (conversationStatus !== 'human' && conversationStatus !== 'responded') {
    return;
  }
  
  const hasText = userInput.value.trim().length > 0;
  
  if (hasText && !isUserTyping) {
    isUserTyping = true;
    sendTypingStatus(true);
  }
  
  // Clear existing timeout
  if (typingTimeout) {
    clearTimeout(typingTimeout);
  }
  
  // Set new timeout to stop typing indicator
  typingTimeout = setTimeout(() => {
    if (isUserTyping) {
      isUserTyping = false;
      sendTypingStatus(false);
    }
  }, 3000); // Stop after 3 seconds of no typing
});

// Send typing status to server
async function sendTypingStatus(isTyping) {
  try {
    await fetch(`/api/typing/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isTyping, role: 'user' })
    });
  } catch (error) {
    console.error('Error sending typing status:', error);
  }
}

// Check for librarian typing status
function checkLibrarianTyping() {
  // Only check if connected to librarian
  if (conversationStatus !== 'human' && conversationStatus !== 'responded') {
    return;
  }
  
  fetch(`/api/typing/${sessionId}`)
    .then(res => res.json())
    .then(data => {
      if (data.librarian) {
        showLibrarianTyping();
      } else {
        hideLibrarianTyping();
      }
    })
    .catch(error => {
      console.error('Error checking typing status:', error);
    });
}

// Show librarian typing indicator
function showLibrarianTyping() {
  // Remove existing typing indicator if any
  hideLibrarianTyping();
  
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message bot-message typing-indicator';
  typingDiv.id = 'librarian-typing';
  typingDiv.innerHTML = '<span class="typing-label">Librarian is typing</span><span></span><span></span><span></span>';
  messagesContainer.appendChild(typingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide librarian typing indicator
function hideLibrarianTyping() {
  const typing = document.getElementById('librarian-typing');
  if (typing) typing.remove();
}

// Check for librarian typing every 2 seconds when connected
setInterval(() => {
  if (conversationStatus === 'human' || conversationStatus === 'responded') {
    checkLibrarianTyping();
  }
}, 4000); // Changed from 2s to 4s to reduce server load


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
function addMessageWithFeedback(content, isUser, sender = null, messageId = null, attachment = null) {
  // Debug log
  console.log('💬 addMessageWithFeedback called:', {
    content,
    isUser,
    sender,
    hasAttachment: !!attachment,
    attachment
  });
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'} new-message`;
  
  // Remove new-message class after animation
  setTimeout(() => messageDiv.classList.remove('new-message'), 1000);
  
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
  contentDiv.className = 'message-content';
  // Use innerHTML to preserve line breaks and formatting
  // Convert newlines to <br> tags and preserve formatting
  let formattedContent = content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold: **text**
    .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic: *text*
  
  // Convert bullet points to proper format
  formattedContent = formattedContent
    .replace(/^• (.+)$/gm, '<div style="margin-left: 16px; margin-top: 4px;">• $1</div>')
    .replace(/^- (.+)$/gm, '<div style="margin-left: 16px; margin-top: 4px;">• $1</div>')
    .replace(/^\d+\. (.+)$/gm, '<div style="margin-left: 16px; margin-top: 4px;">$&</div>');
  
  contentDiv.innerHTML = formattedContent;
  messageDiv.appendChild(contentDiv);
  
  // Add attachment if present
  if (attachment) {
    console.log('📎 Adding attachment to message:', attachment);
    const attachmentDiv = document.createElement('div');
    attachmentDiv.className = 'message-attachment';
    
    if (attachment.type.startsWith('image/')) {
      console.log('🖼️ Creating image element for attachment');
      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'attachment-image-wrapper';
      
      const img = document.createElement('img');
      img.src = attachment.data;
      img.alt = attachment.name;
      img.className = 'attachment-image';
      img.onclick = () => openImageModal(attachment.data, attachment.name);
      
      imgWrapper.appendChild(img);
      attachmentDiv.appendChild(imgWrapper);
      
      // Add filename below image
      const filenameDiv = document.createElement('div');
      filenameDiv.className = 'attachment-filename';
      filenameDiv.textContent = attachment.name;
      attachmentDiv.appendChild(filenameDiv);
    } else if (attachment.type === 'application/pdf') {
      console.log('📄 Creating PDF preview for attachment');
      const pdfWrapper = document.createElement('div');
      pdfWrapper.className = 'attachment-pdf-wrapper';
      
      const pdfIcon = document.createElement('div');
      pdfIcon.className = 'pdf-icon';
      pdfIcon.textContent = '📄';
      
      const pdfInfo = document.createElement('div');
      pdfInfo.className = 'attachment-info';
      pdfInfo.innerHTML = `
        <div class="attachment-name">${attachment.name}</div>
        <div class="attachment-size">${formatFileSize(attachment.size)}</div>
      `;
      
      const viewBtn = document.createElement('button');
      viewBtn.className = 'view-pdf-btn';
      viewBtn.textContent = 'View PDF';
      viewBtn.onclick = () => openPDFModal(attachment.data, attachment.name);
      
      pdfWrapper.appendChild(pdfIcon);
      pdfWrapper.appendChild(pdfInfo);
      pdfWrapper.appendChild(viewBtn);
      attachmentDiv.appendChild(pdfWrapper);
    } else {
      console.log('📄 Creating file element for attachment');
      attachmentDiv.innerHTML = `
        <span class="attachment-icon">📄</span>
        <div class="attachment-info">
          <div class="attachment-name">${attachment.name}</div>
          <div class="attachment-size">${formatFileSize(attachment.size)}</div>
        </div>
      `;
    }
    
    messageDiv.appendChild(attachmentDiv);
  }
  
  // Add message status for user messages
  if (isUser) {
    const statusDiv = document.createElement('div');
    statusDiv.className = 'message-status';
    statusDiv.innerHTML = '<span class="status-icon status-sending">○</span>';
    messageDiv.appendChild(statusDiv);
  }
  
  // Add feedback buttons for AI bot messages only (thumbs up/down for AI quality)
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
  
  // Add emoji reactions for librarian messages only (more personal/emotional)
  if (!isUser && sender === 'librarian' && messageId) {
    addReactionButtonToMessage(messageDiv, messageId);
  }
  
  messagesContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Add emoji reaction button to message
function addReactionButtonToMessage(messageDiv, messageId) {
  const reactionsDiv = document.createElement('div');
  reactionsDiv.className = 'message-reactions';
  reactionsDiv.id = `reactions-${messageId}`;
  
  // Add "+" button to add reactions
  const addReactionBtn = document.createElement('button');
  addReactionBtn.className = 'add-reaction-btn';
  addReactionBtn.textContent = '+';
  addReactionBtn.title = 'Add reaction';
  addReactionBtn.onclick = (e) => {
    e.stopPropagation();
    showReactionPicker(messageId, addReactionBtn);
  };
  
  reactionsDiv.appendChild(addReactionBtn);
  messageDiv.appendChild(reactionsDiv);
}

// Show reaction picker
function showReactionPicker(messageId, buttonElement) {
  // Remove any existing picker
  const existingPicker = document.querySelector('.reaction-picker');
  if (existingPicker) {
    existingPicker.remove();
  }
  
  const picker = document.createElement('div');
  picker.className = 'reaction-picker active';
  
  const emojis = ['❤️', '👍', '😊', '😂', '😮', '😢', '🎉', '🔥'];
  
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'reaction-option';
    btn.textContent = emoji;
    btn.onclick = (e) => {
      e.stopPropagation();
      addReaction(messageId, emoji);
      picker.remove();
    };
    picker.appendChild(btn);
  });
  
  // Position picker relative to button
  const reactionsDiv = document.getElementById(`reactions-${messageId}`);
  reactionsDiv.appendChild(picker);
  
  // Close picker when clicking outside
  setTimeout(() => {
    document.addEventListener('click', function closePickerHandler(e) {
      if (!picker.contains(e.target) && e.target !== buttonElement) {
        picker.remove();
        document.removeEventListener('click', closePickerHandler);
      }
    });
  }, 100);
}

// Add reaction to message
async function addReaction(messageId, emoji) {
  try {
    const response = await fetch('/api/feedback/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        messageId,
        emoji
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      updateReactionsDisplay(messageId, data.reactions);
    }
  } catch (error) {
    console.error('Error adding reaction:', error);
  }
}

// Update reactions display
function updateReactionsDisplay(messageId, reactions) {
  const reactionsDiv = document.getElementById(`reactions-${messageId}`);
  if (!reactionsDiv) return;
  
  // Clear existing reactions (except add button)
  const addBtn = reactionsDiv.querySelector('.add-reaction-btn');
  reactionsDiv.innerHTML = '';
  
  // Add reaction buttons with counts
  Object.entries(reactions).forEach(([emoji, count]) => {
    if (count > 0) {
      const reactionBtn = document.createElement('button');
      reactionBtn.className = 'reaction-btn';
      reactionBtn.innerHTML = `${emoji} <span class="reaction-count">${count}</span>`;
      reactionBtn.onclick = () => addReaction(messageId, emoji);
      reactionsDiv.appendChild(reactionBtn);
    }
  });
  
  // Re-add the add button
  if (addBtn) {
    reactionsDiv.appendChild(addBtn);
  }
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


// ===== DARK/LIGHT MODE TOGGLE =====
function loadTheme() {
  const savedTheme = localStorage.getItem('chatTheme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    document.querySelector('.sun-icon').style.display = 'none';
    document.querySelector('.moon-icon').style.display = 'block';
  }
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    // Toggle icons
    document.querySelector('.sun-icon').style.display = isDark ? 'none' : 'block';
    document.querySelector('.moon-icon').style.display = isDark ? 'block' : 'none';
    
    // Save preference
    localStorage.setItem('chatTheme', isDark ? 'dark' : 'light');
  });
}

// Load theme on page load
loadTheme();

// ===== QUICK REPLIES =====
if (quickReplies) {
  const quickReplyButtons = quickReplies.querySelectorAll('.quick-reply-btn');
  
  quickReplyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const message = btn.getAttribute('data-message');
      userInput.value = message;
      sendMessage();
      
      // Hide quick replies after first use
      quickReplies.classList.add('hidden');
    });
  });
  
  // Hide quick replies when user starts typing
  userInput.addEventListener('input', () => {
    if (userInput.value.trim().length > 0) {
      quickReplies.classList.add('hidden');
    }
  });
  
  // Show quick replies when input is empty and no messages
  userInput.addEventListener('focus', () => {
    if (userInput.value.trim().length === 0 && messagesContainer.children.length === 0) {
      quickReplies.classList.remove('hidden');
    }
  });
}



// Image and PDF Modal Functions
function openImageModal(imageSrc, imageName) {
  const modal = document.createElement('div');
  modal.className = 'file-modal';
  modal.innerHTML = `
    <div class="file-modal-content">
      <div class="file-modal-header">
        <span class="file-modal-title">${imageName}</span>
        <button class="file-modal-close" onclick="this.closest('.file-modal').remove()">✕</button>
      </div>
      <div class="file-modal-body">
        <img src="${imageSrc}" alt="${imageName}" class="modal-image">
      </div>
      <div class="file-modal-footer">
        <a href="${imageSrc}" download="${imageName}" class="download-btn">
          <span>⬇️</span>
          <span>Download</span>
        </a>
      </div>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.appendChild(modal);
}

function openPDFModal(pdfData, pdfName) {
  const modal = document.createElement('div');
  modal.className = 'file-modal';
  modal.innerHTML = `
    <div class="file-modal-content">
      <div class="file-modal-header">
        <span class="file-modal-title">${pdfName}</span>
        <button class="file-modal-close" onclick="this.closest('.file-modal').remove()">✕</button>
      </div>
      <div class="file-modal-body">
        <iframe src="${pdfData}" class="modal-pdf" frameborder="0"></iframe>
      </div>
      <div class="file-modal-footer">
        <a href="${pdfData}" download="${pdfName}" class="download-btn">
          <span>⬇️</span>
          <span>Download</span>
        </a>
      </div>
    </div>
  `;
  
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  
  document.body.appendChild(modal);
}
