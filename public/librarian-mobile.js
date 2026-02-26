let currentSessionId = null;
let allConversations = [];
let filteredConversations = [];
let lastNotificationCount = 0;
let cannedResponses = { categories: [] };
let quickRepliesCollapsed = true;

// Load canned responses
async function loadCannedResponses() {
  try {
    const response = await fetch('/api/canned-responses');
    const data = await response.json();
    cannedResponses = data;
    renderQuickReplies();
  } catch (error) {
    console.error('Error loading canned responses:', error);
  }
}

// Load notifications and conversations
async function loadNotifications() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  
  try {
    const response = await fetch('/api/librarian/notifications');
    const data = await response.json();
    
    allConversations = data.activeConversations;
    updateStats(data);
    filterConversations();
    
    // Check for new librarian requests
    const pendingCount = data.activeConversations.filter(c => c.status === 'human').length;
    if (pendingCount > lastNotificationCount && lastNotificationCount > 0) {
      showNotificationBadge(pendingCount);
      playNotificationSound();
    }
    lastNotificationCount = pendingCount;
    
  } catch (error) {
    console.error('Error loading notifications:', error);
  } finally {
    btn.classList.remove('spinning');
  }
}

// Update stats
function updateStats(data) {
  const totalActive = data.activeConversations.length;
  const totalPending = data.activeConversations.filter(c => c.status === 'human').length;
  const totalMessages = data.activeConversations.reduce((sum, c) => sum + c.messageCount, 0);
  
  document.getElementById('active-count').textContent = totalActive;
  document.getElementById('pending-count').textContent = totalPending;
  document.getElementById('message-count').textContent = totalMessages;
}

// Filter conversations
function filterConversations() {
  const statusFilter = document.getElementById('status-filter').value;
  const sortBy = document.getElementById('sort-by').value;
  
  let filtered = [...allConversations];
  
  // Apply status filter
  if (statusFilter !== 'all') {
    filtered = filtered.filter(conv => conv.status === statusFilter);
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.startTime) - new Date(a.startTime);
    } else {
      return new Date(a.startTime) - new Date(b.startTime);
    }
  });
  
  filteredConversations = filtered;
  renderConversations();
}

// Render conversations list
function renderConversations() {
  const container = document.getElementById('conversation-list');
  
  if (filteredConversations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>No conversations found</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filteredConversations.map(conv => {
    const lastMsg = conv.lastMessage?.content || 'No messages yet';
    const timeAgo = getTimeAgo(new Date(conv.startTime));
    const statusClass = conv.status === 'human' ? 'waiting' : conv.status === 'responded' ? 'responded' : '';
    
    return `
      <div class="conversation-card ${statusClass}" onclick="openConversation('${conv.sessionId}')">
        <div class="conversation-header">
          <div class="session-id">${conv.sessionId}</div>
          <span class="status-tag ${conv.status}">${getStatusLabel(conv.status)}</span>
        </div>
        <div class="conversation-preview">${lastMsg}</div>
        <div class="conversation-meta">
          <span>${timeAgo}</span>
          <span class="message-count">💬 ${conv.messageCount}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Get status label
function getStatusLabel(status) {
  const labels = {
    bot: '🤖 Bot',
    human: '⏳ Waiting',
    viewed: '👁️ Viewed',
    responded: '✅ Active',
    closed: '🔒 Closed'
  };
  return labels[status] || status;
}

// Get time ago
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// Open conversation
async function openConversation(sessionId) {
  currentSessionId = sessionId;
  
  try {
    const response = await fetch(`/api/conversation/${sessionId}`);
    const data = await response.json();
    
    // Update modal header
    document.getElementById('modal-session-id').textContent = sessionId;
    document.getElementById('modal-status').textContent = getStatusLabel(data.status);
    document.getElementById('modal-status').className = `modal-status status-tag ${data.status}`;
    
    // Render messages
    renderMessages(data.messages);
    
    // Show modal
    document.getElementById('conversation-modal').classList.add('active');
    
    // Scroll to bottom
    setTimeout(() => {
      const messagesContainer = document.getElementById('modal-messages');
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
    
  } catch (error) {
    console.error('Error loading conversation:', error);
    alert('Failed to load conversation');
  }
}

// Render messages
function renderMessages(messages) {
  const container = document.getElementById('modal-messages');
  
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No messages yet</p></div>';
    return;
  }
  
  container.innerHTML = messages.map(msg => {
    const roleClass = msg.role === 'user' ? 'user' : msg.role === 'librarian' ? 'librarian' : 'bot';
    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'librarian' ? 'You' : 'Bot';
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return `
      <div class="message ${roleClass}">
        <div class="message-role">${roleLabel}</div>
        <div class="message-content">${msg.content}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }).join('');
}

// Close modal
function closeModal() {
  document.getElementById('conversation-modal').classList.remove('active');
  currentSessionId = null;
  document.getElementById('response-input').value = '';
}

// Toggle action menu
function toggleActionMenu() {
  const menu = document.getElementById('action-menu');
  menu.classList.toggle('active');
}

// Send response
async function sendResponse() {
  const input = document.getElementById('response-input');
  const message = input.value.trim();
  
  if (!message || !currentSessionId) return;
  
  try {
    const response = await fetch('/api/librarian/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: message
      })
    });
    
    if (response.ok) {
      input.value = '';
      // Reload conversation
      await openConversation(currentSessionId);
      // Reload list
      await loadNotifications();
    } else {
      alert('Failed to send message');
    }
  } catch (error) {
    console.error('Error sending response:', error);
    alert('Failed to send message');
  }
}

// Send warning
async function sendWarning() {
  if (!currentSessionId) return;
  
  const warningMessage = "⚠️ This session will end in 10 seconds. Please let me know if you need more help!";
  
  try {
    // Send warning message
    await fetch('/api/librarian/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        message: warningMessage
      })
    });
    
    // Set countdown
    await fetch('/api/librarian/set-countdown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: currentSessionId,
        countdown: 10
      })
    });
    
    // Wait 10 seconds then end session
    setTimeout(async () => {
      await endSession();
    }, 10000);
    
    alert('Warning sent! Session will end in 10 seconds.');
    
  } catch (error) {
    console.error('Error sending warning:', error);
    alert('Failed to send warning');
  }
}

// End session
async function endSession() {
  if (!currentSessionId) return;
  
  if (!confirm('End this session?')) return;
  
  try {
    const response = await fetch('/api/librarian/end-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    
    if (response.ok) {
      closeModal();
      await loadNotifications();
    } else {
      alert('Failed to end session');
    }
  } catch (error) {
    console.error('Error ending session:', error);
    alert('Failed to end session');
  }
}

// Toggle quick replies
function toggleQuickReplies() {
  const quickReplies = document.getElementById('quick-replies');
  quickReplies.classList.toggle('collapsed');
  quickRepliesCollapsed = !quickRepliesCollapsed;
}

// Render quick replies
function renderQuickReplies() {
  const container = document.getElementById('quick-replies-content');
  
  if (!cannedResponses.categories || cannedResponses.categories.length === 0) {
    container.innerHTML = '<p style="color: #999; text-align: center; padding: 1rem;">No quick replies available</p>';
    return;
  }
  
  container.innerHTML = cannedResponses.categories.map(category => `
    <div class="quick-reply-category">
      <div class="category-title">${category.icon} ${category.name}</div>
      ${category.templates.map(template => `
        <button class="quick-reply-btn" onclick="useQuickReply(\`${template.text.replace(/`/g, '\\`')}\`)">
          ${template.name}
        </button>
      `).join('')}
    </div>
  `).join('');
}

// Use quick reply
function useQuickReply(text) {
  document.getElementById('response-input').value = text;
  if (quickRepliesCollapsed) {
    toggleQuickReplies();
  }
}

// Show notification badge
function showNotificationBadge(count) {
  const badge = document.getElementById('notification-badge');
  document.getElementById('notification-count').textContent = count;
  badge.style.display = 'flex';
  
  setTimeout(() => {
    badge.style.display = 'none';
  }, 5000);
}

// Play notification sound
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    console.log('Could not play sound:', error);
  }
}

// Auto-refresh every 2 seconds
setInterval(loadNotifications, 2000);

// Initial load
loadNotifications();
loadCannedResponses();

// Collapse quick replies by default
document.getElementById('quick-replies').classList.add('collapsed');

// Handle textarea auto-resize
document.getElementById('response-input').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Handle Enter key to send (Shift+Enter for new line)
document.getElementById('response-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendResponse();
  }
});

// Close action menu when clicking outside
document.addEventListener('click', function(e) {
  const menu = document.getElementById('action-menu');
  const menuBtn = document.querySelector('.menu-btn');
  
  if (menu.classList.contains('active') && !menu.contains(e.target) && e.target !== menuBtn) {
    menu.classList.remove('active');
  }
});
