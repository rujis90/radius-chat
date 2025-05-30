# Radius Chat

A location-based encrypted chat application that allows users within ~250 meters of each other to communicate securely.

## Features

- **Location-based rooms**: Automatically joins chat rooms based on your geographic location
- **End-to-end encryption**: Messages are encrypted using libsodium with Curve25519 key exchange
- **Real-time messaging**: WebSocket-based communication
- **Privacy-focused**: Server acts as a passive relay without inspecting message content

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the Flask application:
```bash
python app.py
```

3. Open your browser and navigate to `http://localhost:5000`

4. Allow location access when prompted

## How it works

1. **Location Detection**: Uses browser geolocation API to determine your position
2. **Room Assignment**: Creates/joins a chat room based on geohash of your location (~250m radius)
3. **Key Exchange**: Generates Curve25519 keypairs and exchanges public keys with nearby peers
4. **Encrypted Messaging**: All messages are encrypted end-to-end using ChaCha20-Poly1305

## Security

- Messages are encrypted client-side before transmission
- Server cannot decrypt or read message content
- Each peer-to-peer connection uses unique shared secrets
- Room membership expires after 15 minutes of inactivity

## Requirements

- Modern web browser with geolocation support
- HTTPS required for geolocation in production (use HTTP for local development)
- Python 3.7+ 