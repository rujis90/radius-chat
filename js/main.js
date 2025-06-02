console.log("🚀 ne4rby starting with Web Crypto API...");

// Check if Web Crypto API is available
if (!window.crypto || !window.crypto.subtle) {
  console.error("❌ Web Crypto API not available");
  document.querySelector("#status").textContent = "Crypto not supported";
  throw new Error("Web Crypto API not supported");
}

console.log("✅ Web Crypto API available");

// UI elements
const statusEl = document.querySelector("#status");
const peerCountEl = document.querySelector("#peer-count");
const messagesEl = document.querySelector("#messages");
const msgInput = document.querySelector("#msg");
const sendBtn = document.querySelector("#send");
const locationPrompt = document.querySelector("#location-prompt");
const enableLocationBtn = document.querySelector("#enable-location");
const infoBtn = document.querySelector("#info-btn");
const infoModal = document.querySelector("#info-modal");
const infoClose = document.querySelector("#info-close");
const inviteBtn = document.querySelector("#invite-btn");
const inviteModal = document.querySelector("#invite-modal");
const inviteClose = document.querySelector("#invite-close");

// Parse URL parameters for invite functionality
const urlParams = new URLSearchParams(window.location.search);
const inviteToken = urlParams.get('invite');
const paramLat = urlParams.get('lat');
const paramLon = urlParams.get('lon');

// Global state
let currentLocation = null;

// Message management
const MAX_MESSAGES = 20;  // Keep only latest 20 messages

console.log("🔍 UI Elements found:", {
  statusEl: !!statusEl,
  peerCountEl: !!peerCountEl,
  messagesEl: !!messagesEl,
  msgInput: !!msgInput,
  sendBtn: !!sendBtn,
  locationPrompt: !!locationPrompt,
  enableLocationBtn: !!enableLocationBtn,
  infoBtn: !!infoBtn,
  infoModal: !!infoModal,
  infoClose: !!infoClose,
  inviteBtn: !!inviteBtn,
  inviteModal: !!inviteModal,
  inviteClose: !!inviteClose
});

// Crypto utilities using Web Crypto API
const crypto = {
  // Generate ECDH key pair
  async generateKeyPair() {
    return await window.crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      false, // not extractable
      ["deriveKey"]
    );
  },

  // Export public key to base64
  async exportPublicKey(keyPair) {
    const exported = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  },

  // Import public key from base64
  async importPublicKey(base64Key) {
    const keyData = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
    return await window.crypto.subtle.importKey(
      "spki",
      keyData,
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      false,
      []
    );
  },

  // Derive shared secret
  async deriveSharedSecret(privateKey, publicKey) {
    return await window.crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: publicKey
      },
      privateKey,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt", "decrypt"]
    );
  },

  // Encrypt message
  async encrypt(message, sharedKey) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      sharedKey,
      data
    );

    return {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
    };
  },

  // Decrypt message
  async decrypt(encryptedData, sharedKey) {
    const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encryptedData.data), c => c.charCodeAt(0));
    
    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      sharedKey,
      data
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
};

// Generate unique user ID from public key (15 hex characters)
async function generateUserId(publicKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(publicKey);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert first 8 bytes to hex (16 chars) then take first 15
  const hexString = Array.from(hashArray.slice(0, 8))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return hexString.substring(0, 15);
}

// Update status
function updateStatus(text, showPeerCount = false) {
  console.log("📊 Status update:", text, showPeerCount);
  statusEl.textContent = text;
  peerCountEl.style.display = showPeerCount ? "inline" : "none";
}

// Add message to UI
function addMessage(text, isOwn = false, userId = null) {
  console.log("💬 Adding message:", text, "isOwn:", isOwn, "userId:", userId);
  const messageDiv = document.createElement("div");
  messageDiv.className = "message";
  
  const timeDiv = document.createElement("div");
  timeDiv.className = "message-time";
  timeDiv.textContent = new Date().toLocaleTimeString();
  
  // Add user ID if provided
  if (userId) {
    const userSpan = document.createElement("span");
    userSpan.style.color = isOwn ? "#38a169" : "#667eea";
    userSpan.style.fontWeight = "bold";
    userSpan.style.marginLeft = "8px";
    userSpan.textContent = `#${userId}`;
    timeDiv.appendChild(userSpan);
  }
  
  const textDiv = document.createElement("div");
  textDiv.className = "message-text";
  textDiv.textContent = text;
  
  messageDiv.appendChild(timeDiv);
  messageDiv.appendChild(textDiv);
  
  if (isOwn) {
    messageDiv.style.background = "#e6fffa";
    messageDiv.style.marginLeft = "20px";
  }
  
  messagesEl.appendChild(messageDiv);
  
  // Remove old messages if we exceed the limit
  const messages = messagesEl.querySelectorAll(".message");
  if (messages.length > MAX_MESSAGES) {
    const messagesToRemove = messages.length - MAX_MESSAGES;
    for (let i = 0; i < messagesToRemove; i++) {
      messages[i].remove();
    }
    console.log(`🧹 Removed ${messagesToRemove} old messages (keeping latest ${MAX_MESSAGES})`);
  }
  
  // WhatsApp-style auto-scroll: only scroll if user was at bottom or it's their own message
  const shouldAutoScroll = isAtBottom() || isOwn;
  if (shouldAutoScroll) {
    scrollToBottom();
  } else {
    console.log("📱 User reading old messages, not auto-scrolling");
  }
}

// Simple chat scroll - like Telegram/WhatsApp
function isAtBottom() {
  if (!messagesEl) return true;
  const threshold = 100; // pixels from bottom
  return messagesEl.scrollTop >= (messagesEl.scrollHeight - messagesEl.offsetHeight - threshold);
}

function scrollToBottom() {
  if (!messagesEl) return;
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Auto-scroll only if user is at bottom (like all good chat apps)
function autoScrollIfAtBottom() {
  if (isAtBottom()) {
    scrollToBottom();
  }
}

// Clear loading message
function clearLoading() {
  console.log("🧹 Clearing loading message");
  messagesEl.innerHTML = "";
  scrollToBottom(); // Always scroll to bottom when clearing
}

// Show loading state
function showLoading(message) {
  console.log("⏳ Showing loading:", message);
  messagesEl.innerHTML = `
    <div class="loading">
      <p>🔐 ${message}</p>
    </div>
  `;
}

// Show error state
function showError(message) {
  console.log("❌ Showing error:", message);
  messagesEl.innerHTML = `
    <div class="loading">
      <p>❌ ${message}</p>
      <button class="location-btn" onclick="location.reload()">Try Again</button>
    </div>
  `;
}

// Decrypt and render incoming message
async function decryptAndRender(pkt, peerSecrets, peerIds) {
  console.log("🔓 Attempting to decrypt message:", pkt);
  try {
    const { peer, iv, data } = pkt;
    
    // Find the shared secret for this peer
    const sharedKey = peerSecrets[peer];
    if (!sharedKey) {
      console.warn("⚠️ No shared key found for peer:", peer.substring(0, 20) + "...");
      return;
    }
    
    console.log("🔑 Using shared key for peer:", peer.substring(0, 20) + "...");
    console.log("🔐 Decrypting with IV:", iv, "data length:", data.length);
    
    // Decrypt the message
    const message = await crypto.decrypt({ iv, data }, sharedKey);
    console.log("✅ Message decrypted:", message);
    addMessage(message, false, peerIds[peer]);
    
  } catch (error) {
    console.error("❌ Failed to decrypt message:", error);
    console.error("❌ Error details:", {
      name: error.name,
      message: error.message,
      peer: pkt.peer?.substring(0, 20) + "...",
      hasSharedKey: !!peerSecrets[pkt.peer],
      ivLength: pkt.iv?.length,
      dataLength: pkt.data?.length
    });
  }
}

// Initialize chat connection
async function initializeChat(latitude, longitude) {
  console.log("🌐 Initializing chat with location:", latitude, longitude);
  updateStatus("Connecting to chat...");
  showLoading("Initializing secure connection...");

  // Store location globally for invite creation
  currentLocation = { lat: latitude, lon: longitude };

  try {
    // 1. Generate key pair
    console.log("🔑 Generating key pair...");
    const myKeyPair = await crypto.generateKeyPair();
    const myPublicKey = await crypto.exportPublicKey(myKeyPair);
    console.log("✅ Key pair generated, public key:", myPublicKey.substring(0, 20) + "...");

    // Generate unique user ID from public key (15 hex chars)
    const myUserId = await generateUserId(myPublicKey);
    console.log("🆔 My user ID:", myUserId);

    // 2. WebSocket handshake
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log("🔌 Connecting to WebSocket:", wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.addEventListener("open", () => {
      console.log("✅ WebSocket connected, sending handshake...");
      const handshake = { 
        pub: myPublicKey, 
        lat: latitude, 
        lon: longitude
      };
      
      // Include invite token if present
      if (inviteToken) {
        handshake.invite_token = inviteToken;
        console.log("📨 Including invite token in handshake:", inviteToken);
      }
      
      console.log("📤 Sending handshake:", handshake);
      ws.send(JSON.stringify(handshake));
      updateStatus("Connected", true);
      clearLoading();
      
      // Show invite button after successful connection
      inviteBtn.style.display = "inline";
    });

    ws.addEventListener("close", (event) => {
      console.log("❌ WebSocket closed:", event.code, event.reason);
      updateStatus("Disconnected");
      sendBtn.disabled = true;
      msgInput.disabled = true;
      showError("Connection lost");
    });

    ws.addEventListener("error", (error) => {
      console.error("❌ WebSocket error:", error);
      updateStatus("Connection error");
      showError("Failed to connect to server");
    });

    // 3. Peer management
    const peerSecrets = {};       // peerPub -> CryptoKey
    const peerIds = {};           // peerPub -> userId
    const pendingMessages = [];   // Queue for messages that arrive before shared secrets

    // Process any pending messages after establishing shared secrets
    async function processPendingMessages() {
      console.log(`📬 Processing ${pendingMessages.length} pending messages...`);
      const messagesToProcess = [...pendingMessages];
      pendingMessages.length = 0; // Clear the queue
      
      for (const pkt of messagesToProcess) {
        await decryptAndRender(pkt, peerSecrets, peerIds);
      }
    }

    ws.onmessage = async ({ data }) => {
      console.log("📨 Received message:", data);
      const pkt = JSON.parse(data);
      console.log("📦 Parsed packet:", pkt);

      // Room full message
      if (pkt.type === "room_full") {
        console.log("🚫 Room is full:", pkt.message);
        updateStatus("Room full");
        showError(`This location is full (${pkt.current_users}/${pkt.max_users} users). Try again later or move to a different area.`);
        return;
      }

      // Handle invite-specific errors
      if (pkt.type === "error" || pkt.type === "location_error") {
        console.log("❌ Invite error:", pkt.message);
        updateStatus("Connection error");
        showError(pkt.message);
        return;
      }

      // New peer list
      if (pkt.type === "peers") {
        console.log("👥 Received peer list:", pkt.pubs);
        
        // Display room info if available
        if (pkt.room_info) {
          const { current_users, max_users, room_hash, room_type, invite_radius } = pkt.room_info;
          console.log(`🏠 Room ${room_hash}: ${current_users}/${max_users} users (${room_type})`);
          
          // Update status with room capacity and type
          let capacityText = `${current_users}/${max_users} users`;
          if (room_type === "invite") {
            capacityText += ` (invite room)`;
          }
          statusEl.textContent = `Connected (${capacityText})`;
          
          // Show invite radius info if in invite room
          if (room_type === "invite" && invite_radius) {
            console.log(`📍 Invite room radius: ${invite_radius}m`);
          }
        }
        
        let newSecretsCreated = false;
        
        for (const peerPub of pkt.pubs) {
          if (!peerSecrets[peerPub]) {
            console.log("🤝 Creating shared secret with peer:", peerPub.substring(0, 20) + "...");
            try {
              const peerPublicKey = await crypto.importPublicKey(peerPub);
              const sharedKey = await crypto.deriveSharedSecret(myKeyPair.privateKey, peerPublicKey);
              peerSecrets[peerPub] = sharedKey;
              
              // Generate and store peer ID
              const peerId = await generateUserId(peerPub);
              peerIds[peerPub] = peerId;
              console.log("✅ Shared secret created for peer:", peerId);
              newSecretsCreated = true;
            } catch (error) {
              console.error("❌ Failed to create shared secret:", error);
            }
          }
        }
        
        // Process any pending messages if we created new secrets
        if (newSecretsCreated && pendingMessages.length > 0) {
          await processPendingMessages();
        }
        
        // Update peer count
        const peerCount = Object.keys(peerSecrets).length;
        console.log("📊 Peer count:", peerCount);
        peerCountEl.textContent = `${peerCount} peer${peerCount !== 1 ? 's' : ''}`;
        
        // Enable input if we have the connection
        msgInput.disabled = false;
        sendBtn.disabled = false;
        
        // Show welcome message if this is the first connection
        if (messagesEl.children.length === 0) {
          const welcomeMsg = peerCount === 0 
            ? 'You are the first person here.' 
            : `${peerCount} other people are nearby.`;
          addMessage(`Welcome to ne4rby! ${welcomeMsg}`, false);
          
          // Show capacity info if room is getting full
          if (pkt.room_info && pkt.room_info.current_users >= pkt.room_info.max_users * 0.8) {
            addMessage(`⚠️ This location is getting busy (${pkt.room_info.current_users}/${pkt.room_info.max_users} users)`, false);
          }
        }
        
        return;
      }

      // Multi-encrypted message
      if (pkt.type === "multi_encrypted") {
        console.log("📨 Received multi-encrypted message from:", pkt.sender.substring(0, 20) + "...");
        
        // Find our encrypted version
        const myEncryptedVersion = pkt.versions[myPublicKey];
        if (!myEncryptedVersion) {
          console.log("⚠️ No encrypted version for us in this message");
          return;
        }
        
        // Decrypt our version
        const messageForUs = {
          peer: pkt.sender,
          iv: myEncryptedVersion.iv,
          data: myEncryptedVersion.data
        };
        
        await decryptAndRender(messageForUs, peerSecrets, peerIds);
        return;
      }

      // Legacy single encrypted message (for backward compatibility)
      const { peer } = pkt;
      if (!peerSecrets[peer]) {
        console.log("⏳ Message from unknown peer, queuing for later:", peer.substring(0, 20) + "...");
        pendingMessages.push(pkt);
        return;
      }
      
      await decryptAndRender(pkt, peerSecrets, peerIds);
    };

    // 4. Send a message
    async function sendMessage() {
      console.log("📤 Send message triggered");
      console.log("📱 User agent:", navigator.userAgent);
      console.log("📱 Touch support:", 'ontouchstart' in window);
      
      const text = msgInput.value.trim();
      if (!text) {
        console.log("⚠️ Empty message, ignoring");
        return;
      }
      
      // Temporarily disable send button to prevent double sends
      sendBtn.disabled = true;
      
      try {
        const peerCount = Object.keys(peerSecrets).length;
        console.log("👥 Sending to", peerCount, "peers");
        
        if (peerCount === 0) {
          addMessage("No peers nearby to send message to", false);
          msgInput.value = "";
          return;
        }
        
        // Add to our own UI
        addMessage(text, true, myUserId);
        
        // Create encrypted versions for each peer
        const encryptedVersions = {};
        for (const [peerPub, sharedKey] of Object.entries(peerSecrets)) {
          console.log("🔐 Encrypting message for peer:", peerPub.substring(0, 20) + "...");
          try {
            const encrypted = await crypto.encrypt(text, sharedKey);
            encryptedVersions[peerPub] = {
              iv: encrypted.iv,
              data: encrypted.data
            };
          } catch (error) {
            console.error("❌ Failed to encrypt message:", error);
          }
        }
        
        // Send one message with all encrypted versions
        const multiMessage = {
          type: "multi_encrypted",
          sender: myPublicKey,
          versions: encryptedVersions
        };
        
        console.log("📤 Sending multi-encrypted message:", multiMessage);
        ws.send(JSON.stringify(multiMessage));
        
        msgInput.value = "";
        console.log("✅ Message sent successfully");
        
      } catch (error) {
        console.error("❌ Error sending message:", error);
        addMessage("Failed to send message", false);
      } finally {
        // Re-enable send button
        sendBtn.disabled = false;
      }
    }
    
    // Mobile-compatible send button handling
    function setupSendButton() {
      // Remove any existing onclick handler
      sendBtn.onclick = null;
      
      // Add touch-compatible event listeners
      sendBtn.addEventListener("click", sendMessage);
      sendBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendMessage();
      });
    }
    
    setupSendButton();
    
    msgInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });

  } catch (error) {
    console.error("❌ Failed to initialize chat:", error);
    showError("Failed to initialize encryption");
  }
}

// Main initialization
console.log("🎯 Starting main initialization...");

// Enable location button handler
enableLocationBtn.addEventListener("click", async () => {
  console.log("📍 Location button clicked");
  
  try {
    if (inviteToken && paramLat && paramLon) {
      // Use coordinates from invite link
      console.log("📨 Using invite coordinates:", paramLat, paramLon);
      await initializeChat(parseFloat(paramLat), parseFloat(paramLon));
    } else {
      // Request location permission
      console.log("🌐 Requesting location permission...");
      showLoading("Getting your location...");
      
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });
      
      const { latitude, longitude } = position.coords;
      console.log("✅ Location obtained:", latitude, longitude);
      
      await initializeChat(latitude, longitude);
    }
  } catch (error) {
    console.error("❌ Location error:", error);
    clearLoading();
    
    if (error.code === 1) {
      showError("Location access denied. Please allow location access and refresh the page.");
    } else if (error.code === 2) {
      showError("Location unavailable. Please check your connection and try again.");
    } else if (error.code === 3) {
      showError("Location request timed out. Please try again.");
    } else {
      showError("Failed to get location. Please try again.");
    }
  }
});

// Invite functionality
inviteBtn?.addEventListener("click", () => {
  console.log("📨 Invite button clicked");
  inviteModal.classList.add("show");
});

inviteClose?.addEventListener("click", () => {
  inviteModal.classList.remove("show");
  // Reset the modal
  document.querySelector("#invite-result").style.display = "none";
  document.querySelector("#create-invite-btn").style.display = "block";
});

// Create invite functionality
document.querySelector("#create-invite-btn")?.addEventListener("click", async () => {
  if (!currentLocation) {
    showError("Location not available. Please reconnect.");
    return;
  }
  
  const radius = parseInt(document.querySelector("#invite-radius").value);
  const ttlHours = parseInt(document.querySelector("#invite-ttl").value);
  const ttlDays = ttlHours / 24;
  
  console.log("📨 Creating invite:", { radius, ttlDays, location: currentLocation });
  
  try {
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        center: [currentLocation.lat, currentLocation.lon],
        radius: radius,
        ttl_days: ttlDays
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const result = await response.json();
    console.log("✅ Invite created:", result);
    
    // Show result
    document.querySelector("#invite-link").value = result.link;
    document.querySelector("#invite-radius-display").textContent = radius;
    document.querySelector("#invite-result").style.display = "block";
    document.querySelector("#create-invite-btn").style.display = "none";
    
  } catch (error) {
    console.error("❌ Failed to create invite:", error);
    showError("Failed to create invite link. Please try again.");
  }
});

// Copy invite link functionality
document.querySelector("#copy-invite-btn")?.addEventListener("click", async () => {
  const linkInput = document.querySelector("#invite-link");
  
  try {
    await navigator.clipboard.writeText(linkInput.value);
    
    // Visual feedback
    const btn = document.querySelector("#copy-invite-btn");
    const originalText = btn.textContent;
    btn.textContent = "✅ Copied!";
    btn.style.background = "#38a169";
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = "";
    }, 2000);
    
  } catch (error) {
    console.error("❌ Failed to copy:", error);
    
    // Fallback: select text
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    
    showError("Please copy the link manually");
  }
});

// Info modal functionality  
function openModal() {
  console.log("ℹ️ Opening info modal");
  infoModal.classList.add("show");
}

function closeModal() {
  console.log("ℹ️ Closing info modal");  
  infoModal.classList.remove("show");
}

infoBtn?.addEventListener("click", openModal);
infoClose?.addEventListener("click", closeModal);

// Handle invite link in URL
if (inviteToken) {
  console.log("📨 Invite token detected:", inviteToken);
  
  // Update location prompt for invite
  if (paramLat && paramLon) {
    locationPrompt.innerHTML = `
      <div class="icon">🎯</div>
      <h3>Join Private Chat</h3>
      <p>You've been invited to join a location-based chat room.</p>
      <p><strong>🔐 End-to-end encrypted</strong> - only people with this invite link can join.</p>
      <button class="location-btn" id="enable-location">🚀 Join Private Chat</button>
      <p style="font-size: 0.8rem; margin-top: 10px; opacity: 0.7;">
        You'll need to be within the specified radius to join
      </p>
    `;
    
    // Re-bind the location button
    const newLocationBtn = document.querySelector("#enable-location");
    newLocationBtn.addEventListener("click", async () => {
      console.log("📨 Joining invite chat with provided coordinates");
      await initializeChat(parseFloat(paramLat), parseFloat(paramLon));
    });
  }
}

// Handle viewport changes for mobile
if (/Mobi|Android/i.test(navigator.userAgent)) {
  console.log("📱 Mobile device detected, setting up viewport handling");
  
  let initialViewportHeight = window.innerHeight;
  
  const updateKeyboardHeight = () => {
    const currentHeight = window.innerHeight;
    const heightDiff = initialViewportHeight - currentHeight;
    
    if (heightDiff > 150) {
      console.log("⌨️ Keyboard detected (height diff:", heightDiff + "px)");
      document.body.style.setProperty('--keyboard-height', heightDiff + 'px');
      
      setTimeout(() => {
        if (msgInput === document.activeElement) {
          msgInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    } else {
      console.log("⌨️ Keyboard hidden");
      document.body.style.removeProperty('--keyboard-height');
    }
  };
  
  window.addEventListener('resize', updateKeyboardHeight);
  document.addEventListener('focusin', (e) => {
    if (e.target === msgInput) {
      setTimeout(updateKeyboardHeight, 300);
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target === msgInput) {
      setTimeout(updateKeyboardHeight, 300);
    }
  });
}

console.log("✅ Main initialization complete");
