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
  infoClose: !!infoClose
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
  
  // Ensure smooth auto-scroll to latest message (works on both mobile and desktop)
  scrollToBottom();
}

// Consistent scroll-to-bottom function for both mobile and desktop
function scrollToBottom() {
  if (!messagesEl) return;
  
  // Simple, reliable scroll approach that works consistently on mobile and desktop
  requestAnimationFrame(() => {
    // Force scroll to absolute bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Double-check after a brief delay (important for mobile)
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  });
}

// Clear loading message
function clearLoading() {
  console.log("🧹 Clearing loading message");
  messagesEl.innerHTML = "";
  // Ensure we're at the right scroll position after clearing
  scrollToBottom();
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
      const handshake = { pub: myPublicKey, lat: latitude, lon: longitude };
      console.log("📤 Sending handshake:", handshake);
      ws.send(JSON.stringify(handshake));
      updateStatus("Connected", true);
      clearLoading();
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

      // New peer list
      if (pkt.type === "peers") {
        console.log("👥 Received peer list:", pkt.pubs);
        
        // Display room info if available
        if (pkt.room_info) {
          const { current_users, max_users, room_hash } = pkt.room_info;
          console.log(`🏠 Room ${room_hash}: ${current_users}/${max_users} users`);
          
          // Update status with room capacity
          const capacityText = `${current_users}/${max_users} users`;
          statusEl.textContent = `Connected (${capacityText})`;
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
      const text = msgInput.value.trim();
      if (!text) {
        console.log("⚠️ Empty message, ignoring");
        return;
      }
      
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
    }
    
    sendBtn.onclick = sendMessage;
    
    msgInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        sendMessage();
      }
    });

  } catch (error) {
    console.error("❌ Failed to initialize chat:", error);
    showError("Failed to initialize encryption");
  }
}

// Handle location button click
console.log("🎯 Setting up location button click handler...");

if (!enableLocationBtn) {
  console.error("❌ Location button not found!");
} else {
  enableLocationBtn.addEventListener("click", () => {
    console.log("🎯 LOCATION BUTTON CLICKED!");
    enableLocationBtn.disabled = true;
    enableLocationBtn.textContent = "Requesting location...";
    
    console.log("📍 Checking geolocation support...");
    if (!navigator.geolocation) {
      console.error("❌ Geolocation not supported");
      showError("Geolocation not supported by this browser");
      enableLocationBtn.disabled = false;
      enableLocationBtn.textContent = "Enable Location & Join Chat";
      return;
    }
    
    console.log("📍 Requesting current position...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        console.log("✅ Location received:", pos.coords);
        const { latitude, longitude } = pos.coords;
        console.log("📍 Coordinates:", latitude, longitude);
        await initializeChat(latitude, longitude);
      },
      (error) => {
        console.error("❌ Location error:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        updateStatus("Location access denied");
        showError("Location access is required to join chat");
        enableLocationBtn.disabled = false;
        enableLocationBtn.textContent = "Enable Location & Join Chat";
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
  
  console.log("✅ Location button click handler set up successfully");
}

// Info modal handlers
if (infoBtn && infoModal && infoClose) {
  // Mobile-optimized modal handling
  function openModal() {
    infoModal.style.display = "flex";
    document.body.classList.add("modal-open");
    
    // Focus trap for accessibility and prevent background scrolling
    const content = infoModal.querySelector('.info-content');
    if (content) {
      content.focus();
    }
  }
  
  function closeModal() {
    infoModal.style.display = "none";
    document.body.classList.remove("modal-open");
  }
  
  infoBtn.addEventListener("click", openModal);
  infoClose.addEventListener("click", closeModal);
  
  // Close on backdrop click
  infoModal.addEventListener("click", (e) => {
    if (e.target === infoModal) {
      closeModal();
    }
  });
  
  // Close on escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && infoModal.style.display === "flex") {
      closeModal();
    }
  });
}

// Mobile keyboard optimizations
if (msgInput) {
  // Prevent zoom on iOS when focusing input
  msgInput.addEventListener("focus", () => {
    // Ensure latest messages are visible when keyboard opens
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  });
  
  // Simple blur handler to ensure messages are visible when keyboard closes
  msgInput.addEventListener("blur", () => {
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  });
  
  // Improved send button handling for mobile
  sendBtn.addEventListener("touchstart", (e) => {
    e.preventDefault(); // Prevent double-tap zoom
  });
}

// Touch improvements for better mobile UX
if ('ontouchstart' in window) {
  // Add active states for better touch feedback
  const touchElements = [
    enableLocationBtn,
    sendBtn,
    infoBtn,
    infoClose
  ].filter(Boolean);
  
  touchElements.forEach(element => {
    if (element) {
      element.addEventListener("touchstart", () => {
        element.style.opacity = "0.7";
      });
      
      element.addEventListener("touchend", () => {
        setTimeout(() => {
          element.style.opacity = "";
        }, 150);
      });
      
      element.addEventListener("touchcancel", () => {
        element.style.opacity = "";
      });
    }
  });
}

// Optimize scroll behavior for mobile
if (messagesEl) {
  messagesEl.addEventListener("touchmove", (e) => {
    e.stopPropagation();
  });
}

// Handle orientation changes
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    // Ensure latest messages are visible after orientation change
    scrollToBottom();
  }, 500);
});

console.log("🏁 Script loaded and ready!");
