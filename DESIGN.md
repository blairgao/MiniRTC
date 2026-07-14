# Technical Design Document

**Stack:** Python · FastAPI · React · TypeScript · WebRTC

---

## 1. Overview

MiniRTC is a 1:1 browser-based calling product. Two users share a room URL; the backend coordinates the connection setup (signaling), then the browsers stream audio/video directly peer-to-peer. The server is never in the media path.

```
┌─────────────┐   WebSocket (signaling)    ┌─────────────┐
│  Browser A  │ ◄────────────────────────► │  Browser B  │
└──────┬──────┘        FastAPI             └──────┬──────┘
       │                                          │
       └──────────── WebRTC (P2P media) ──────────┘
                   (audio / video / data)
```

---

## 2. Architecture

### 2.1 Component Map

```
                    ┌──────────────────────────────────────────┐
                    │         Single Server Process            │
                    │                                          │
  Browser ── HTTPS ──►  FastAPI (ASGI/Uvicorn)                 │
                    │    ├── REST  /api/rooms/*                │
                    │    └── WS   /ws/{room_id}                │
                    │              │                           │
                    │              ▼                           │
                    │   In-memory state (Python dicts)         │
                    │                                          │
                    └──────────────────────────────────────────┘
```

### 2.2 State Layer: In-Memory

All room and presence state lives in a single module (`backend/state.py`). No database.

```python
# backend/state.py
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from fastapi import WebSocket

@dataclass
class Room:
    id: str                              # 8-char URL-safe token (~48 bits)
    expires_at: datetime                 # created_at + 1h, checked on WS connect
    connections: list[WebSocket] = field(default_factory=list)
    # role is implicit: connections[0] = host, connections[1] = guest

rooms: dict[str, Room] = {}             # room_id → Room
```

Room state is ephemeral by nature — it has no meaningful existence outside an active call. Once both peers disconnect, the room is deleted. There's nothing to persist: if the server restarts, users create a new room. Adding a database here would mean running a separate network service and managing a schema to store data with a lifetime of minutes.

**Lifecycle:**

| Event | State change |
|---|---|
| `POST /api/rooms` | `rooms[id] = Room(id=id, expires_at=now+1h)` |
| WS connect | validate room exists + not expired + `len(connections) < 2` |
| First WS connect | `room.connections.append(ws)` — peer is host |
| Second WS connect | `room.connections.append(ws)` — relay `peer_joined` to host |
| Either peer disconnects | remove from `connections`; if empty, `del rooms[room_id]` |

**Capacity:** `len(room.connections) >= 2` → close with `room_full`.  
**Validation:** WS connect to an unknown `room_id` → close with `room_not_found`.  
**Scale:** See DECISIONS.md §2 for why this breaks under multi-instance and how Redis fixes it.

---

## 3. API Design

### 3.1 REST Endpoints (FastAPI)

**Base path:** `/api/`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/rooms` | Create a new room; returns `room_id` |
| `GET` | `/api/rooms` | List all active rooms (lobby view) |
| `GET` | `/api/rooms/{room_id}` | Get room status and participant count |
| `DELETE` | `/api/rooms/{room_id}` | Manually close a room (host only, future) |

**POST /api/rooms — Response**
```json
{
  "room_id": "xK9mP2qR",
  "url": "https://minirtc.onrender.com/room/xK9mP2qR",
  "expires_at": "2026-06-28T14:30:00Z"
}
```

**GET /api/rooms/{room_id} — Response**
```json
{
  "room_id": "xK9mP2qR",
  "status": "waiting",
  "participant_count": 1,
  "expires_at": "2026-06-28T14:30:00Z"
}
```

Error cases:
- `404` — room not found or expired
- `409` — room already has 2 participants (full)

### 3.2 WebSocket Signaling (`/ws/{room_id}`)

The WebSocket connection is the signaling channel. It carries JSON messages between the two peers. The server does not inspect or modify SDP/ICE payloads.

**Connection lifecycle:**

```
Client                    Server
  │                          │
  ├─── WS Connect ──────────►│  (authenticate room_id, check capacity)
  │◄── {"type":"joined"} ────┤
  │                          │
  │  (second peer joins)     │
  │◄── {"type":"peer_joined"}┤
  │                          │
  ├── {"type":"offer",...} ─►│  (relayed to peer - what media + formats + security)
  │◄─ {"type":"answer",...} ─┤
  │                          │
  ├── {"type":"ice",...} ───►│  (relayed to peer - where to reach me on the network)
  │◄── {"type":"ice",...} ───┤
  │                          │
  │                          │  (call active — no more server involvement in media)
  │                          │
  ├─── WS Close ────────────►│
  │◄── {"type":"peer_left"} ─┤  (sent to remaining peer)
```

**Message schema:**

```typescript
// Outbound from client
type SignalMessage =
  | { type: "offer";   sdp: string }
  | { type: "answer";  sdp: string }
  | { type: "ice";     candidate: RTCIceCandidateInit }
  | { type: "leave" }

// Inbound to client
type ServerMessage =
  | { type: "joined";      role: "host" | "guest"; room_id: string }
  | { type: "peer_joined"; role: "guest" | "host" }
  | { type: "offer";       sdp: string }
  | { type: "answer";      sdp: string }
  | { type: "ice";         candidate: RTCIceCandidateInit }
  | { type: "peer_left" }
  | { type: "error";       code: string; message: string }
  | { type: "room_full" }
  | { type: "room_expired" }
```

---

## 4. WebRTC Call Flow

### 4.1 Signaling Sequence (SDP Exchange)

The "host" (first to join) initiates the offer once the guest arrives.

```
Host Browser           Signaling Server         Guest Browser
     │                        │                       │
     │──── WS connect ───────►│                       │
     │◄─── {joined, host} ────│                       │
     │                        │◄──── WS connect ──────│
     │                        │──── {joined, guest} ─►│
     │◄─── {peer_joined} ─────│                       │
     │                        │                       │
     │  getUserMedia()        │                       │
     │  createOffer()         │                       │
     │──── {offer, sdp} ─────►│                       │
     │                        │──── {offer, sdp} ────►│
     │                        │                       │  setRemoteDescription()
     │                        │                       │  createAnswer()
     │                        │◄─── {answer, sdp} ────│
     │◄─── {answer, sdp} ─────│                       │
     │ setRemoteDescription() │                       │
     │                        │                       │
     │─── {ice, candidate} ──►│──── {ice, ...} ──────►│
     │◄── {ice, candidate} ───│◄─── {ice, ...} ───────│
     │                        │                       │
     │◄════════════ P2P media stream (direct) ═══════►│
```

### 4.2 ICE Configuration

```typescript
const ICE_SERVERS: RTCIceServer[] = [
  // Public STUN — free, works for ~85% of users (symmetric NAT-free)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // TURN — required for symmetric NAT (see DECISIONS.md §3)
  // { urls: "turn:<your-turn-server>:3478", username: "...", credential: "..." }
];
```

### 4.3 Media Constraints

```typescript
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};
```

---

## 5. Security

### 5.1 Room ID Security

Room IDs are 8-character URL-safe tokens from `secrets.token_urlsafe(6)` — 48 bits of cryptographic randomness (~1/2^48 per guess). Short enough to share verbally; no sequential or predictable IDs.

```python
import secrets
room_id = secrets.token_urlsafe(6)  # e.g. "xK9mP2qR"
```

Additional controls:
- **Capacity check:** WS connect rejected when `len(room.connections) >= 2`.
- **Expiry:** `Room.expires_at` is set to `now + 1h` at creation and checked on every WS connect. Stale rooms never accumulate indefinitely in memory.
- **Room listing (lobby):** `GET /api/rooms` enumerates active rooms so users can discover and join open calls. This deliberately trades away the original "room URL as unguessable capability token" model — anyone can find waiting rooms. For private deployments, remove this endpoint (and the `/rooms` page) to restore the secret-URL model.
- **CORS:** Backend allows only the Render frontend origin in production (set via `ALLOWED_ORIGINS` env var).
- **WebSocket origin check:** CORS does not apply to WebSockets, so `/ws/{room_id}` validates the `Origin` header against the same `ALLOWED_ORIGINS` allowlist and rejects the handshake (403) on mismatch, blocking cross-site WebSocket hijacking. Requests without an `Origin` header (non-browser clients) are allowed.
- **Rate limiting:** `slowapi` middleware on `POST /api/rooms` — max 10 rooms/min per IP.

### 5.2 HTTPS / WSS

All traffic served over TLS. WebSocket connections use `wss://`. Browser enforces same-origin policy for WebRTC streams.

---

## 6. Frontend Architecture

### 6.1 Page Structure

```
/minirtc              → Home (create or join a room)
/minirtc/room/:id     → Room page (call UI)
```

### 6.2 Component Tree

```
App
├── HomePage
│   ├── CreateRoomButton
│   └── JoinRoomInput
└── RoomPage
    ├── ConnectionStatus         ← "Connecting..." / "In Call" / "Disconnected"
    ├── VideoGrid
    │   ├── LocalVideo           ← your own stream (muted)
    │   └── RemoteVideo          ← peer's stream
    ├── CallControls
    │   ├── MuteButton           ← toggle audio track enabled
    │   ├── CameraButton         ← toggle video track enabled
    │   └── LeaveButton          ← close streams, WS disconnect, redirect home
    └── ErrorBanner              ← camera denied, room full, room expired
```

### 6.3 Custom Hooks

**`useSignaling(roomId)`**
- Opens WebSocket to `/ws/{roomId}`
- Returns: `{ sendMessage, lastMessage, connectionState }`
- Handles reconnect on transient disconnect (exponential backoff, max 3 attempts)

**`useWebRTC(signaling)`**
- Creates `RTCPeerConnection` with ICE config
- Subscribes to `lastMessage` from `useSignaling`
- Handles offer/answer/ICE exchange state machine
- Returns: `{ localStream, remoteStream, callState, toggleAudio, toggleVideo }`

### 6.4 Call State Machine

```
IDLE → JOINING → WAITING_FOR_PEER → NEGOTIATING → IN_CALL → ENDED
                                                       ↑
                                               (reconnect on ICE failure)
```

State transitions are driven by WebSocket messages and `RTCPeerConnection` events (`iceconnectionstatechange`, `connectionstatechange`).

### 6.5 Error Handling

| Error | UI Response |
|---|---|
| Camera/mic permission denied | Banner: "Please allow camera/microphone access" |
| Room not found (404) | Redirect to home with toast: "Room not found or expired" |
| Room full (409 / `room_full` WS msg) | Banner: "This room is already in use" |
| Room expired | Banner: "This room has expired" |
| Peer disconnected mid-call | Banner: "Peer left the call" + Leave button |
| ICE connection failed | Banner: "Connection failed — check your network" |
| WebSocket closed unexpectedly | Auto-reconnect up to 3×, then show error |

---

## 7. Directory Structure

```
MiniRTC/
├── backend/
│   ├── routers/
│   │   ├── rooms.py                 # POST/GET /api/rooms
│   │   └── signaling.py             # WS /ws/{room_id}
│   ├── state.py                     # In-memory rooms dict + Room dataclass
│   ├── schemas.py                   # Pydantic request/response models
│   ├── main.py                      # FastAPI app factory
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CallControls.tsx
│   │   │   ├── ConnectionStatus.tsx
│   │   │   ├── ErrorBanner.tsx
│   │   │   ├── VideoGrid.tsx
│   │   │   └── LocalVideo.tsx / RemoteVideo.tsx
│   │   ├── hooks/
│   │   │   ├── useSignaling.ts
│   │   │   └── useWebRTC.ts
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   └── RoomPage.tsx
│   │   ├── types/
│   │   │   └── signaling.ts         # TypeScript types for WS messages
│   │   ├── api/
│   │   │   └── rooms.ts             # REST API client (fetch wrappers)
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docker-compose.yml               # backend + frontend
├── nginx.conf                       # Reverse proxy: /api/ and /ws/ → backend
├── README.md
└── DECISIONS.md
```

---

## 8. Deployment

### 8.1 Local Development

```
docker-compose up
```

Services:
- `backend` — Uvicorn (FastAPI) on port 8000
- `frontend` — Vite dev server on port 5173 with HMR

No database service. State is in-memory; a restart clears all rooms, which is fine.

### 8.2 Production (Render)

Deployed on **Render's free tier**:

| Service | Render type | Notes |
|---|---|---|
| FastAPI backend | Web Service (free) | Uvicorn, auto-deploys from `main` |
| React frontend | Static Site (free) | Vite build output, CDN-served |

Render provides HTTPS and WebSocket support out of the box — no nginx config needed. The free tier spins down after 15 minutes of inactivity, so the first request after idle takes ~30s to cold-start. Acceptable for a demo.

**WebSocket caveat:** Render's free Web Service supports WebSocket connections. Long-lived connections (active calls) will stay open. The spin-down only affects new connections during idle periods.

Frontend is configured to point to the Render backend URL:
```typescript
// frontend/src/config.ts
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
export const WS_BASE  = API_BASE.replace(/^http/, "ws")
```

### 8.3 Environment Variables

```bash
# backend/.env
ALLOWED_ORIGINS=https://minirtc.onrender.com
```

---

## 9. Testing Plan

| Layer | Tool | What |
|---|---|---|
| In-memory state | `pytest` | Room creation, capacity enforcement, cleanup on disconnect |
| FastAPI REST | `httpx` + `TestClient` | Room CRUD, 404/409 error cases |
| FastAPI WebSocket | `starlette.testclient` | Signaling relay, room_full enforcement |
---
