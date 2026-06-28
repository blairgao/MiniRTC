# MiniRTC

Share a link, start talking. MiniRTC is a 1:1 browser-based video call product — audio and video flow directly peer-to-peer. The server only handles signaling.

---

## What it does

- Create a room → share the URL
- Two people join the same room → call starts automatically
- Audio required, video optional
- No accounts, no installs, no plugins

**Call controls:** Mute/Unmute · Camera on/off · Leave

---

## Run locally

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:8000
- API docs: http://localhost:8000/docs

---

## Deploy to Render

A `render.yaml` is included at the repo root. Connect the repo to Render and it will create two services automatically:

- `minirtc-api` — Python web service (FastAPI backend)
- `minirtc` — Static site (React frontend)

Update the URLs in `render.yaml` to match your actual Render service names after first deploy.

**Deployed on:** Render free tier — [minirtc.onrender.com](https://minirtc.onrender.com)  
> First load may take ~30s if the backend is cold (Render free tier spins down after 15 min idle).

---

## What Was Skipped and Why

**No TURN server (v1):** Adds operational cost and complexity. STUN covers most users; acceptable for a demo. 

**No database (v1):** Room state is ephemeral.

**No Redis (v1):** Single-process deployment doesn't need it. Redis enters when we scale to multiple FastAPI instances.

**No auth/user accounts:** Room URLs act as capability tokens (knowing the UUIDv4 URL grants access). Adding OAuth would be a worthwhile v2 feature for call history and room ownership.

**No SFU (Selective Forwarding Unit):** SFUs (like mediasoup or LiveKit) are needed for 3+ participant calls because each browser would otherwise need to upload N-1 streams. Not needed for 1:1.