from flask import Flask, send_from_directory, request
from flask_sock import Sock
from cryptography.hazmat.primitives import serialization
import geohash2, json, time, secrets, math

app = Flask(__name__, static_url_path="", static_folder="static")
sock = Sock(app)

ROOM_TTL = 15 * 60                 # seconds
MAX_ROOM_SIZE = 25                 # Maximum users per room
rooms = {}                         # {geohash: { sid: websocket }}
INVITES = {}                       # {token: invite_data}

def clean_rooms():
    now = time.time()
    expired = [h for h,v in rooms.items() if all(now - s["ts"] > ROOM_TTL for s in v.values())]
    for h in expired:
        del rooms[h]

def clean_invites():
    """Clean expired invites"""
    now = time.time()
    expired_tokens = [token for token, invite in INVITES.items() 
                     if now - invite["created"] > invite["expires"]]
    for token in expired_tokens:
        del INVITES[token]
        # Also clean the associated room
        invite_room = f"invite_{token}"
        if invite_room in rooms:
            del rooms[invite_room]

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in meters using Haversine formula"""
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) * math.sin(delta_lat / 2) +
         math.cos(lat1_rad) * math.cos(lat2_rad) *
         math.sin(delta_lon / 2) * math.sin(delta_lon / 2))
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def get_room_stats():
    """Get statistics about current rooms"""
    stats = {}
    for room_hash, room_data in rooms.items():
        stats[room_hash] = {
            'user_count': len(room_data),
            'is_full': len(room_data) >= MAX_ROOM_SIZE
        }
    return stats

@app.get("/")
def index():
    return send_from_directory("static", "index.html")

@app.get("/j/<token>")
def join_invite(token):
    """Join page for invite links"""
    clean_invites()
    
    if token not in INVITES:
        return f"""
        <html><body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Invalid Invite</h2>
            <p>This invite link is invalid or has expired.</p>
            <a href="/">← Go to main app</a>
        </body></html>
        """, 404
    
    invite = INVITES[token]
    return f"""
    <html>
    <head>
        <title>Join ne4rby Chat</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ font-family: Arial; text-align: center; padding: 20px; background: #f5f5f5; }}
            .card {{ background: white; border-radius: 12px; padding: 30px; max-width: 400px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .btn {{ background: #007bff; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; text-decoration: none; display: inline-block; }}
            .btn:hover {{ background: #0056b3; }}
            .info {{ background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }}
        </style>
    </head>
    <body>
        <div class="card">
            <h2>🎯 You're Invited!</h2>
            <p>Someone wants to chat with you at this location.</p>
            <div class="info">
                <strong>📍 Radius:</strong> {invite['radius']} meters<br>
                <strong>⏰ Expires:</strong> {time.strftime('%Y-%m-%d %H:%M', time.localtime(invite['created'] + invite['expires']))}
            </div>
            <button class="btn" onclick="joinChat()">Join Chat</button>
            <br><br>
            <a href="/">← Go to main app</a>
        </div>
        
        <script>
            async function joinChat() {{
                try {{
                    const position = await new Promise((resolve, reject) => {{
                        navigator.geolocation.getCurrentPosition(resolve, reject);
                    }});
                    
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    
                    // Redirect to main app with invite token and location
                    const url = new URL('/', window.location.origin);
                    url.searchParams.set('invite', '{token}');
                    url.searchParams.set('lat', lat);
                    url.searchParams.set('lon', lon);
                    window.location.href = url.toString();
                    
                }} catch (error) {{
                    alert('Location access is required to join this chat. Please allow location access and try again.');
                }}
            }}
        </script>
    </body>
    </html>
    """

@app.get("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory("js", filename)

@app.post("/api/invite")
def create_invite():
    """Create an invite link for a specific location"""
    data = request.json
    center = data["center"]          # host location [lat, lon]
    radius = data.get("radius", 120) # default two minute walk (120m)
    ttl_days = data.get("ttl_days", 2) # default two days

    token = secrets.token_urlsafe(6)      # ~36 bits entropy
    INVITES[token] = {
        "center": center,
        "radius": radius,
        "expires": ttl_days * 86400,
        "created": time.time(),
    }
    
    link = f"{request.host_url}j/{token}"
    return {"link": link, "token": token, "expires_at": time.time() + (ttl_days * 86400)}

@app.get("/admin/stats")
def admin_stats():
    """Admin endpoint to monitor room statistics"""
    clean_rooms()
    clean_invites()
    
    total_users = sum(len(room_data) for room_data in rooms.values())
    room_stats = []
    
    for room_hash, room_data in rooms.items():
        room_type = "invite" if room_hash.startswith("invite_") else "automatic"
        invite_info = {}
        
        if room_type == "invite":
            token = room_hash.replace("invite_", "")
            if token in INVITES:
                invite_info = {
                    "radius": INVITES[token]["radius"],
                    "expires_at": INVITES[token]["created"] + INVITES[token]["expires"],
                    "center": INVITES[token]["center"]
                }
        
        room_stats.append({
            'room_hash': room_hash,
            'room_type': room_type,
            'invite_info': invite_info,
            'user_count': len(room_data),
            'is_full': len(room_data) >= MAX_ROOM_SIZE,
            'capacity_percentage': round((len(room_data) / MAX_ROOM_SIZE) * 100, 1),
            'users': [
                {
                    'user_id': user_data['pub'][:20] + '...',
                    'connected_since': time.time() - user_data['ts']
                }
                for user_data in room_data.values()
            ]
        })
    
    # Sort by user count (busiest first)
    room_stats.sort(key=lambda x: x['user_count'], reverse=True)
    
    return {
        'server_stats': {
            'total_rooms': len(rooms),
            'total_users': total_users,
            'active_invites': len(INVITES),
            'max_room_size': MAX_ROOM_SIZE,
            'room_ttl_minutes': ROOM_TTL // 60
        },
        'rooms': room_stats
    }

@sock.route("/ws")
def ws_route(ws):
    init = json.loads(ws.receive())
    pubkey = init["pub"]
    lat = init["lat"]
    lon = init["lon"]
    invite_token = init.get("invite_token")  # Optional invite token
    
    # Determine room based on invite or location
    if invite_token:
        clean_invites()
        if invite_token not in INVITES:
            ws.send(json.dumps({
                "type": "error",
                "message": "Invalid or expired invite link"
            }))
            ws.close()
            return
        
        invite = INVITES[invite_token]
        center_lat, center_lon = invite["center"]
        distance = calculate_distance(lat, lon, center_lat, center_lon)
        
        if distance > invite["radius"]:
            ws.send(json.dumps({
                "type": "location_error",
                "message": f"You are {int(distance)}m away from the meeting point. You need to be within {invite['radius']}m to join.",
                "distance": int(distance),
                "required_radius": invite["radius"]
            }))
            ws.close()
            return
        
        room = f"invite_{invite_token}"
        print(f"✅ User joining invite room {room} (distance: {int(distance)}m/{invite['radius']}m)")
    else:
        # Standard geohash room
        room = geohash2.encode(lat, lon, precision=7)
        print(f"✅ User joining automatic room {room}")

    # Check if room is full
    current_room_size = len(rooms.get(room, {}))
    if current_room_size >= MAX_ROOM_SIZE:
        ws.send(json.dumps({
            "type": "room_full",
            "message": f"This location has reached the maximum capacity of {MAX_ROOM_SIZE} users. Please try again later.",
            "current_users": current_room_size,
            "max_users": MAX_ROOM_SIZE
        }))
        ws.close()
        return

    sid = id(ws)
    entry = {"ws": ws, "pub": pubkey, "ts": time.time()}
    rooms.setdefault(room, {})[sid] = entry

    room_type = "invite" if room.startswith("invite_") else "automatic"
    print(f"✅ User joined {room_type} room {room} ({len(rooms[room])}/{MAX_ROOM_SIZE} users)")

    # Broadcast current peer list to ALL clients in the room (including new one)
    def broadcast_peer_list():
        if room in rooms:
            room_size = len(rooms[room])
            room_info = {
                "current_users": room_size,
                "max_users": MAX_ROOM_SIZE,
                "room_hash": room[:8],
                "room_type": room_type
            }
            
            # Add invite-specific info
            if room_type == "invite":
                token = room.replace("invite_", "")
                if token in INVITES:
                    room_info["invite_radius"] = INVITES[token]["radius"]
            
            for k, peer in list(rooms[room].items()):
                try:
                    # Send peer list excluding the recipient's own key
                    other_peers = [v["pub"] for sid2, v in rooms[room].items() if sid2 != k]
                    peer["ws"].send(json.dumps({
                        "type": "peers", 
                        "pubs": other_peers,
                        "room_info": room_info
                    }))
                except:
                    # Remove disconnected peer
                    rooms[room].pop(k, None)
    
    broadcast_peer_list()

    try:
        while True:
            msg = ws.receive()
            # Passive relay, do not inspect payload
            for k, peer in list(rooms[room].items()):
                if k != sid:
                    try:
                        peer["ws"].send(msg)
                    except:
                        # Remove disconnected peer
                        rooms[room].pop(k, None)
    except:
        pass
    finally:
        rooms[room].pop(sid, None)
        print(f"❌ User left {room_type} room {room} ({len(rooms.get(room, {}))}/{MAX_ROOM_SIZE} users)")
        # Broadcast updated peer list when someone leaves
        broadcast_peer_list()
        clean_rooms()
        clean_invites()

if __name__ == '__main__':
    app.run(debug=True)
