import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import WebSocket
from starlette.websockets import WebSocketState


@dataclass
class Room:
    id: str
    expires_at: datetime
    connections: list[WebSocket] = field(default_factory=list)
    # role is implicit: connections[0] = host, connections[1] = guest


rooms: dict[str, Room] = {}

# Lobby page subscribers (WS /ws/lobby). They receive the joinable-rooms
# list on connect and again whenever it changes.
lobby_watchers: list[WebSocket] = []


def create_room() -> Room:
    room_id = secrets.token_urlsafe(6)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    room = Room(id=room_id, expires_at=expires_at)
    rooms[room_id] = room
    return room


def live_participants(room: Room) -> int:
    return sum(
        1 for c in room.connections
        if c.client_state == WebSocketState.CONNECTED
    )


def joinable_rooms() -> list[dict]:
    """Non-expired rooms with an open seat, as JSON-safe dicts."""
    now = datetime.now(timezone.utc)
    result = []
    for room in rooms.values():
        if room.expires_at < now:
            continue
        n = live_participants(room)
        if n >= 2:
            continue
        result.append({
            "room_id": room.id,
            "status": "waiting",
            "participant_count": n,
            "expires_at": room.expires_at.isoformat(),
        })
    return result


async def broadcast_lobby() -> None:
    """Push the current joinable-rooms list to every lobby watcher."""
    payload = {"type": "rooms", "rooms": joinable_rooms()}
    for ws in list(lobby_watchers):
        try:
            await ws.send_json(payload)
        except Exception:
            try:
                lobby_watchers.remove(ws)
            except ValueError:
                pass
