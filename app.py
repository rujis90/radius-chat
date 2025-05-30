from flask import Flask, send_from_directory, request
from flask_sock import Sock
from cryptography.hazmat.primitives import serialization
import geohash2, json, time

app = Flask(__name__, static_url_path="", static_folder="static")
sock = Sock(app)

ROOM_TTL = 15 * 60                 # seconds
rooms = {}                         # {geohash: { sid: websocket }}

def clean_rooms():
    now = time.time()
    expired = [h for h,v in rooms.items() if all(now - s["ts"] > ROOM_TTL for s in v.values())]
    for h in expired:
        del rooms[h]

@app.get("/")
def index():
    return send_from_directory("static", "index.html")

@app.get("/js/<path:filename>")
def serve_js(filename):
    return send_from_directory("js", filename)

@sock.route("/ws")
def ws_route(ws):
    init = json.loads(ws.receive())
    pubkey = init["pub"]
    lat = init["lat"]
    lon = init["lon"]
    room = geohash2.encode(lat, lon, precision=7)     # ~250 m radius

    sid = id(ws)
    entry = {"ws": ws, "pub": pubkey, "ts": time.time()}
    rooms.setdefault(room, {})[sid] = entry

    # Broadcast current peer list to ALL clients in the room (including new one)
    def broadcast_peer_list():
        if room in rooms:
            for k, peer in list(rooms[room].items()):
                try:
                    # Send peer list excluding the recipient's own key
                    other_peers = [v["pub"] for sid2, v in rooms[room].items() if sid2 != k]
                    peer["ws"].send(json.dumps({"type": "peers", "pubs": other_peers}))
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
        # Broadcast updated peer list when someone leaves
        broadcast_peer_list()
        clean_rooms()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
