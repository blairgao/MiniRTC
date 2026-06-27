# MiniRTC

A simple 1:1 browser-based calling product. Share a room URL — two people can audio/video call directly, peer-to-peer.

**Deployed on:** Render free tier — backend Web Service + frontend Static Site

---

## What it does

- Create a room → get a shareable URL
- Two people join the same URL → call starts (audio required, video optional)
- No accounts, no installs, no plugins

**Call UI controls:** Join/Leave · Mute/Unmute · Camera on/off · Connection status

---

## What's inside

| Layer | Technology | Role |
|---|---|---|
| Media | WebRTC | P2P audio/video, encrypted, server-never-sees-it |
| Signaling | WebSocket | Relay SDP + ICE candidates between peers |
| API server | FastAPI (Python) | REST API + WebSocket endpoint, async |
| Models / DB | Django ORM | Room/participant models, migrations, admin UI |
| Database | PostgreSQL | Room state, participant records, expiry |
| Frontend | React + TypeScript | SPA, call UI, WebRTC hooks |

See [DESIGN.md](DESIGN.md) for the full architecture and [DECISIONS.md](DECISIONS.md) for tradeoff explanations.

---

## Run locally

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/blairgao/MiniRTC
cd MiniRTC
cp backend/.env.example backend/.env
docker compose up
```

- Frontend: http://localhost:5173
- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Django admin: http://localhost:8000/admin (user: `admin` / pass: `admin`)

**Without Docker:**

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # set DATABASE_URL to your local Postgres
python django_app/manage.py migrate
uvicorn fastapi_app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

---

## What was skipped

- **TURN server** — v1 uses public STUN only (~85% of users work). See [DECISIONS.md §3](DECISIONS.md#3-nat-traversal-and-turn-in-real-life) for the full TURN plan.
- **User auth** — room UUIDv4 URLs act as capability tokens. Good enough for a demo.
- **Redis** — signaling uses an in-memory dict; fine for single-server. See [DECISIONS.md §2](DECISIONS.md#21-current-single-server-architecture-limits) for when to add it.
- **Screen sharing** — the WebRTC hooks are set up to support it; just needs a `getDisplayMedia()` call wired to a button.
- **>2 participants** — 1:1 only. SFU would be needed for group calls.
