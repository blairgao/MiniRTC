import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fastapi import WebSocket


@dataclass
class Room:
    id: str
    expires_at: datetime
    connections: list[WebSocket] = field(default_factory=list)
    # role is implicit: connections[0] = host, connections[1] = guest


rooms: dict[str, Room] = {}


def create_room() -> Room:
    room_id = secrets.token_urlsafe(6)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    room = Room(id=room_id, expires_at=expires_at)
    rooms[room_id] = room
    return room
