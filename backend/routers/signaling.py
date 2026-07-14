import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from state import rooms

router = APIRouter()

ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
}


@router.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str):
    # CORS does not apply to WebSockets, so enforce the origin allowlist
    # manually to block cross-site WebSocket hijacking. Browsers always send
    # Origin on WS upgrades; requests without one (curl, test clients) pass.
    origin = websocket.headers.get("origin")
    if origin is not None and origin not in ALLOWED_ORIGINS:
        # Close before accept → handshake rejected with HTTP 403.
        await websocket.close(code=4003)
        return

    room = rooms.get(room_id)

    if room is None:
        await websocket.accept()
        await websocket.send_json({"type": "room_not_found"})
        await websocket.close(code=4004)
        return

    if room.expires_at < datetime.now(timezone.utc):
        await websocket.accept()
        await websocket.send_json({"type": "room_expired"})
        await websocket.close(code=4010)
        rooms.pop(room_id, None)
        return

    # Drop any stale connections left over from abrupt disconnects.
    room.connections = [
        c for c in room.connections
        if c.client_state == WebSocketState.CONNECTED
    ]

    if len(room.connections) >= 2:
        await websocket.accept()
        await websocket.send_json({"type": "room_full"})
        await websocket.close(code=4009)
        return

    await websocket.accept()
    is_host = len(room.connections) == 0
    role = "host" if is_host else "guest"
    room.connections.append(websocket)

    try:
        await websocket.send_json({"type": "joined", "role": role, "room_id": room_id})

        if not is_host:
            host = room.connections[0]
            await host.send_json({"type": "peer_joined", "role": "guest"})

        while True:
            data = await websocket.receive_text()

            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            if msg.get("type") == "leave":
                break

            if msg.get("type") in ("offer", "answer", "ice"):
                peer = next((c for c in room.connections if c is not websocket), None)
                if peer:
                    try:
                        await peer.send_json(msg)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        room.connections = [c for c in room.connections if c is not websocket]

        for peer in room.connections:
            try:
                await peer.send_json({"type": "peer_left"})
            except Exception:
                pass

        # Don't delete the room on empty connections — let expires_at handle
        # cleanup. Deleting here causes a race with reconnects (e.g. React
        # StrictMode unmounts/remounts effects, closing and reopening the WS).
