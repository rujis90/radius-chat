from flask import Flask, send_from_directory, request
from flask_sock import Sock
from cryptography.hazmat.primitives import serialization
import geohash2, json, time

app = Flask(__name__, static_url_path="", static_folder="static")
sock = Sock(app)

ROOM_TTL = 15 * 60                 # seconds
MAX_ROOM_SIZE = 25                 # Maximum users per room
rooms = {}                         # {geohash: { sid: websocket }}

def clean_rooms():
    now = time.time()
    expired = [h for h,v in rooms.items() if all(now - s["ts"] > ROOM_TTL for s in v.values())]
    for h in expired:
        del rooms[h]

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

@app.get("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory("js", filename)

@app.get("/admin/stats")
def admin_stats():
    """Admin endpoint to monitor room statistics"""
    clean_rooms()  # Clean up expired rooms first
    
    total_users = sum(len(room_data) for room_data in rooms.values())
    room_stats = []
    
    for room_hash, room_data in rooms.items():
        room_stats.append({
            'room_hash': room_hash,
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
    room = geohash2.encode(lat, lon, precision=7)     # ~250 m radius

    # Check if room is full
    current_room_size = len(rooms.get(room, {}))
    if current_room_size >= MAX_ROOM_SIZE:
        # Send room full message and close connection
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

    print(f"✅ User joined room {room} ({len(rooms[room])}/{MAX_ROOM_SIZE} users)")

    # Broadcast current peer list to ALL clients in the room (including new one)
    def broadcast_peer_list():
        if room in rooms:
            room_size = len(rooms[room])
            for k, peer in list(rooms[room].items()):
                try:
                    # Send peer list excluding the recipient's own key
                    other_peers = [v["pub"] for sid2, v in rooms[room].items() if sid2 != k]
                    peer["ws"].send(json.dumps({
                        "type": "peers", 
                        "pubs": other_peers,
                        "room_info": {
                            "current_users": room_size,
                            "max_users": MAX_ROOM_SIZE,
                            "room_hash": room[:8]  # First 8 chars for debugging
                        }
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
        print(f"❌ User left room {room} ({len(rooms.get(room, {}))}/{MAX_ROOM_SIZE} users)")
        # Broadcast updated peer list when someone leaves
        broadcast_peer_list()
        clean_rooms()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
