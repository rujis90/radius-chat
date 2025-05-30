console.log("🚀 Radius Chat starting with Web Crypto API...");

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

// Message management
const MAX_MESSAGES = 50;  // Keep only latest 50 messages

console.log("🔍 UI Elements found:", {
  statusEl: !!statusEl,
  peerCountEl: !!peerCountEl,
  messagesEl: !!messagesEl,
  msgInput: !!msgInput,
  sendBtn: !!sendBtn,
  locationPrompt: !!locationPrompt,
  enableLocationBtn: !!enableLocationBtn
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

// Update status
function updateStatus(text, showPeerCount = false) {
  console.log("📊 Status update:", text, showPeerCount);
  statusEl.textContent = text;
  peerCountEl.style.display = showPeerCount ? "inline" : "none";
}

// Add message to UI
function addMessage(text, isOwn = false) {
  console.log("💬 Adding message:", text, "isOwn:", isOwn);
  const messageDiv = document.createElement("div");
  messageDiv.className = "message";
  
  const timeDiv = document.createElement("div");
  timeDiv.className = "message-time";
  timeDiv.textContent = new Date().toLocaleTimeString();
  
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
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Clear loading message
function clearLoading() {
  console.log("🧹 Clearing loading message");
  messagesEl.innerHTML = "";
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
async function decryptAndRender(pkt, peerSecrets) {
  console.log("🔓 Attempting to decrypt message:", pkt);
  try {
    const { peer, iv, data } = pkt;
    
    // Find the shared secret for this peer
    const sharedKey = peerSecrets[peer];
    if (!sharedKey) {
      console.warn("⚠️ No shared key found for peer:", peer);
      return;
    }
    
    // Decrypt the message
    const message = await crypto.decrypt({ iv, data }, sharedKey);
    console.log("✅ Message decrypted:", message);
    addMessage(message, false);
    
  } catch (error) {
    console.error("❌ Failed to decrypt message:", error);
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

    // 2. WebSocket handshake
    const wsUrl = `ws://${location.host}/ws`;
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

    ws.onmessage = async ({ data }) => {
      console.log("📨 Received message:", data);
      const pkt = JSON.parse(data);
      console.log("📦 Parsed packet:", pkt);

      // New peer list
      if (pkt.type === "peers") {
        console.log("👥 Received peer list:", pkt.pubs);
        
        for (const peerPub of pkt.pubs) {
          if (!peerSecrets[peerPub]) {
            console.log("🤝 Creating shared secret with peer:", peerPub.substring(0, 20) + "...");
            try {
              const peerPublicKey = await crypto.importPublicKey(peerPub);
              const sharedKey = await crypto.deriveSharedSecret(myKeyPair.privateKey, peerPublicKey);
              peerSecrets[peerPub] = sharedKey;
              console.log("✅ Shared secret created");
            } catch (error) {
              console.error("❌ Failed to create shared secret:", error);
            }
          }
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
          addMessage(`Welcome to Radius Chat! ${peerCount === 0 ? 'You are the first person here.' : `${peerCount} other people are nearby.`}`, false);
        }
        
        return;
      }

      // Encrypted message relay
      await decryptAndRender(pkt, peerSecrets);
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
      addMessage(text, true);
      
      // Send encrypted to all peers
      for (const [peerPub, sharedKey] of Object.entries(peerSecrets)) {
        console.log("🔐 Encrypting message for peer:", peerPub.substring(0, 20) + "...");
        try {
          const encrypted = await crypto.encrypt(text, sharedKey);
          const encryptedMsg = { 
            peer: myPublicKey,  // Use sender's key, not recipient's key
            iv: encrypted.iv,
            data: encrypted.data
          };
          console.log("📤 Sending encrypted message:", encryptedMsg);
          ws.send(JSON.stringify(encryptedMsg));
        } catch (error) {
          console.error("❌ Failed to encrypt message:", error);
        }
      }
      
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

console.log("🏁 Script loaded and ready!");
