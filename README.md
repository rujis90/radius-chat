# Radius Chat

A location-based chat application that allows users within ~250 meters of each other to communicate.

## Features

- **Location-based rooms**: Automatically joins chat rooms based on your geographic location (using geohash, approximately 250m radius).
- **Real-time messaging**: WebSocket-based communication for instant message delivery.
- **Room Capacity**: Rooms have a maximum capacity of 25 users. Users attempting to join a full room will be notified.
- **Passive Relay Server**: The server relays messages between users in the same room without inspecting message content.
- **Admin Statistics**: An endpoint (`/admin/stats`) provides real-time statistics about active rooms and users.
- **Automatic Room Cleanup**: Stale rooms are automatically cleaned up after 15 minutes of inactivity.

## Setup

1.  Install Python dependencies:
    ```bash
    pip install -r requirements.txt
    ```

2.  Run the Flask application:
    ```bash
    python app.py
    ```

3.  Open your browser and navigate to `http://localhost:5000`

4.  Allow location access when prompted by your browser.

## How it works

1.  **Location Detection**: The client application (not part of this server code) uses the browser's geolocation API to determine your position.
2.  **Room Assignment**: The client sends its latitude, longitude, and a public key to the server. The server then assigns the client to a chat room based on the geohash of their location (precision 7, ~250m radius).
3.  **Peer Discovery**: Upon joining a room, the server broadcasts the public keys of all users in that room to every client in that room. When a user leaves, the list is updated and rebroadcast.
4.  **Messaging**: Messages sent by a client are relayed by the server to all other clients in the same room. The server does not inspect or store message content.
5.  **Room Management**:
    - Rooms are identified by their geohash.
    - Each room has a maximum capacity (`MAX_ROOM_SIZE` currently set to 25).
    - If a user tries to join a full room, they receive a "room_full" message and the connection is closed.
    - Rooms and user entries have a Time-To-Live (`ROOM_TTL` currently set to 15 minutes). Inactive rooms are periodically cleaned up.

## Endpoints

-   `/`: Serves the main `index.html`.
-   `/js/<path:filename>`: Serves static JavaScript files.
-   `/ws`: WebSocket endpoint for chat communication.
    -   **Initial message from client**: `{"pub": "user_public_key", "lat": latitude, "lon": longitude}`
    -   **Server messages to client**:
        -   `{"type": "peers", "pubs": ["peer1_pubkey", "peer2_pubkey", ...], "room_info": {"current_users": N, "max_users": M, "room_hash": "xxxxxxx"}}`
        -   `{"type": "room_full", "message": "...", "current_users": N, "max_users": M}`
        -   Relayed messages from other users (format defined by clients).
-   `/admin/stats`: (GET) Provides JSON statistics about server and room status, including total users, total rooms, and details for each room (user count, capacity, user IDs, connection times).

## Security Considerations

-   The server itself does **not** implement end-to-end encryption. Any encryption of messages must be handled client-side.
-   The server relays public keys provided by clients but does not validate them.
-   Communication between the client and server is over standard WebSockets (ws://). For production, you would typically run this behind a reverse proxy that provides WSS (TLS/SSL) encryption for the transport layer.

## Requirements

-   Modern web browser with geolocation support.
-   Python 3.7+
-   Flask, Flask-Sock, geohash2 (see `requirements.txt`) 