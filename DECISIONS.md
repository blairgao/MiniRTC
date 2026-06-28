# Architecture Decisions & Tradeoffs

---

## 1. Transport Choice: WebSocket for Signaling

**Decision:** Use WebSockets as the signaling transport.

**Why WebSockets:**

WebRTC signaling needs to send a handful of messages - an SDP offer, an SDP answer, and a burst of ICE candidatess. We need to do these with the lowest possible latency. The faster signaling completes, the sooner the P2P media stream starts.


| Transport                | Latency                    | Complexity | Notes                                                                                               |
| ------------------------ | -------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| HTTP polling             | High (poll interval delay) | Low        | Each poll is a full HTTP round-trip; you trade latency for simplicity                               |
| Server-Sent Events (SSE) | Medium                     | Medium     | Server→client only; you'd still need HTTP for client→server, making the protocol asymmetric         |
| **WebSocket**            | **Low**                    | **Low**    | Full-duplex, single persistent connection, browser-native, fits signaling message pattern perfectly |
| WebTransport             | Very low                   | High       | QUIC-based, excellent but Safari support is incomplete as of mid-2026                               |
| 3rd-party (Pusher, Ably) | Low                        | Very low   | Works well but adds cost dependency and sends your SDP through an external service                  |


**Why not a dedicated signaling service?**  
Cost. Those services include both signaling AND media relay (TURN). MiniRTC's goal is to own the signaling layer for transparency and cost control. TURN is handled separately.

**FastAPI's async WebSocket support** (`starlette.websockets.WebSocket`) is event-loop-native, allowing thousands of concurrent signaling connections on a single process without thread-per-connection overhead. This is the decisive advantage over **Django** Channels for this use case. Channels adds Redis as a required dependency for its channel layer, which is overkill for a simple 2-participant relay.

---



## 2. State Storage: In-Memory Now, Redis to Scale



### 2.1 Why in-memory

Room and presence state lives in a Python dict in the FastAPI process. No database, no Redis.

I picked this design for this scope. Room state is ephemeral: a room exists only while a call is active. The meaningful lifetime is minutes. There is nothing to persist. If the server restarts, in-progress calls drop, or WebSocket server restarts, users simply create a new room. Reaching for Postgres here would mean running a network service, managing a schema, and writing migration scripts to store data with a lifetime of minutes. That's complexity with no benefit.

Let's assume with 10k rooms/day and a ~20-minute average call. Concurrency depends on how calls cluster.
If traffic spread evenly over a 24h day, Little's Law gives ~140 concurrent rooms
(10,000 × 20 min ÷ 1,440 min). Real traffic concentrates in business hours, so applying
a peak-to-average factor of ~3–5× puts peak at roughly 300–500 concurrent rooms =
600–1,000 open WebSocket connections. A single Uvicorn process handles this comfortably.

### 2.2 Where in-memory breaks: horizontal scaling

The dict is local to one process. The moment you run two FastAPI instances behind a load balancer, a host and guest in the same room can land on different servers. The in-memory dict on server A can't see the WebSocket connection on server B. Signaling silently fails.

This is the real scaling boundary not due to CPU or memory, but shared state across processes.

### 2.3 The Redis fix

Redis plays two roles when we scale to multi-instance:

**Role 1 — Shared presence store:** Replace the local dict with Redis hashes. Every instance reads and writes the same room state.

**Role 2 — Pub/sub relay:** When server A receives a signal from peer 1 and needs to forward it to peer 2 (whose WebSocket is on server B), server A publishes to a Redis channel for that room. Server B is subscribed to that channel and relays the message to its local WebSocket.

```
Peer 1 ──WS──► Server A ──publish──► Redis (room:<id>)
                                           │
                                      ◄──subscribe── Server B ──WS──► Peer 2
```

This makes each FastAPI instance stateless with respect to rooms. They will both refer to Redis for the truth. We can now run as many instances as we want behind a load balancer without sticky sessions.

### 2.4 Media is never a server bottleneck

The most important scaling property of WebRTC: **the server carries zero media bytes**. 10k calls/day at 1 Mbit/s each costs you nothing on the backend. Media travels directly between browsers (P2P), or via TURN if NAT traversal requires it. The signaling server only touches a handful of small JSON messages per call.

### 2.5 Scaling steps in order of impact


| Phase                      | Bottleneck              | Fix                             |
| -------------------------- | ----------------------- | ------------------------------- |
| 1: < 500 concurrent rooms  | Nothing                 | Single server + in-memory dict  |
| 2: 500–5k concurrent rooms | Multi-instance WS relay | Redis pub/sub + shared presence |
| 3: 5k–50k concurrent rooms | TURN bandwidth          | Tiered/regional TURN            |
| 4: 50k+ concurrent rooms   | Redis throughput        | Redis Cluster or Redis Streams  |


---



## 3. NAT Traversal and TURN in Real Life



### What STUN and TURN actually do

Every device on the internet sits behind a NAT router ( home router, firewall, etc.). The private IP (e.g. `192.168.1.5`) isn't reachable from the outside. WebRTC uses the ICE protocol to discover addresses that peers can reach each other on.

**STUN (Session Traversal Utilities for NAT):**  
A STUN server is a tiny reflector. You send it a packet; it tells you what your public IP and port look like from the outside. That public address becomes an ICE candidate. STUN servers carry no media — they're just a lookup. Google's public STUN servers (`stun.l.google.com:19302`) are free and handle this for the vast majority of users.

STUN succeeds when both peers are behind NATs that use a consistent external port (full-cone or port-restricted NAT). This covers roughly 85% of real-world users.

**TURN (Traversal Using Relays around NAT):**  
Some NATs are "symmetric". They assign a different external port for every destination address. STUN fails here because the port you discovered talking to the STUN server is different from the port you'd use talking to your peer. The only way through is a TURN server: both clients connect to TURN, and TURN relays media between them.

TURN actually carries your audio/video traffic. That makes it expensive.

**Why v1 ships without TURN:**  

- STUN handles ~85% of users for free
- TURN requires bandwidth billing (typically $0.40–$1.20 per GB on commercial TURN providers)



### TURN strategy for production

**Option A: Self-hosted coturn**  
Run `coturn` on a small VPS (DigitalOcean $6/mo). Generate time-limited HMAC credentials server-side (so credentials expire and can't be abused). Bandwidth cost is your VPS egress. Works well up to ~100 simultaneous TURN users before the VPS becomes the bottleneck.

```python
# Generate short-lived TURN credentials (valid 24h)
import hmac, hashlib, time, base64

def generate_turn_credentials(user_id: str, secret: str):
    expiry = int(time.time()) + 86400
    username = f"{expiry}:{user_id}"
    password = base64.b64encode(
        hmac.new(secret.encode(), username.encode(), hashlib.sha1).digest()
    ).decode()
    return username, password
```

**Option B: Commercial TURN (Metered, Twilio, Xirsys)**  
Pay per GB. Reasonable for low-volume production. Metered.ca offers a generous free tier. Hand the credentials back to the client via the `/api/rooms/{id}` response — never hardcode TURN credentials in the frontend bundle.

**Option C: Cloudflare Calls**  
Cloudflare's newer product handles both TURN relay and optionally SFU (selective forwarding for >2 participants). Pricing is per participant-minute, not per GB, which makes cost more predictable. Worth evaluating for a production v2.

### ICE candidate policy recommendation

For production, return TURN credentials from the API so the `RTCPeerConnection` ICE config is fully server-driven and can be rotated without a frontend deploy:

```json
{
  "room_id": "...",
  "ice_servers": [
    { "urls": "stun:stun.l.google.com:19302" },
    {
      "urls": "turn:<your-turn-server>:3478",
      "username": "1751234567:user_abc",
      "credential": "base64_hmac_here"
    }
  ]
}
```

---



## 4. Cost Model



### Assumptions (10k rooms/day, average 20-min call, 1 Mbit/s audio+video)


| Component                              | Cost estimate                      |
| -------------------------------------- | ---------------------------------- |
| Backend server                         | ~$6/mo                             |
| Redis (when scaling to multi-instance) | $10–$15/mo                         |
| STUN                                   | $0                                 |
| TURN relay bandwidth                   | ~1.7 TB/mo → ~$1–$3/mo self-hosted |
| Frontend static hosting                | $0                                 |




### How to keep costs sane

**Keep media off the server.** WebRTC is P2P by default. The FastAPI process only relays tiny JSON signaling messages over WebSocket. Our backend server should handles thousands of concurrent rooms because it never touches audio/video.

**STUN first, TURN last.** STUN is free and works for ~85% of users. Ship v1 without TURN; add it only when we need full NAT coverage. When we do, return time-limited HMAC credentials from the API so stolen creds expire and can't be reused to drain our bandwidth.

**Cap blast radius.** Short room expiry (1h), rate limits on room creation, and no room listing mean an attacker can't enumerate or hoard rooms. Two-participant cap keeps per-room TURN relay bounded.

**Self-host TURN** A coturn instance on the same backend server covers low volume at near-zero marginal cost. Move to a dedicated TURN box or a metered provider only when simultaneous relay sessions outgrow one machine (~100 concurrent TURN users is a reasonable coturn ceiling on a small VPS).

**Don't pay for scale that we don't need.** In-memory state, no database, static frontend. Redis and a second backend instance only enter when a single process can't keep up.

### What Was Skipped and Why

**No TURN server (v1):** Adds operational cost and complexity. STUN covers most users; acceptable for a demo. 

**No database (v1):** Room state is ephemeral.

**No Redis (v1):** Single-process deployment doesn't need it. Redis enters when we scale to multiple FastAPI instances.

**No auth/user accounts:** Room URLs act as capability tokens (knowing the UUIDv4 URL grants access). Adding OAuth would be a worthwhile v2 feature for call history and room ownership.

**No SFU (Selective Forwarding Unit):** SFUs (like mediasoup or LiveKit) are needed for 3+ participant calls because each browser would otherwise need to upload N-1 streams. Not needed for 1:1.