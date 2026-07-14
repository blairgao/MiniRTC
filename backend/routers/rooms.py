import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from schemas import RoomCreateResponse, RoomListResponse, RoomStatusResponse
from state import broadcast_lobby, create_room, joinable_rooms, rooms

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/api")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


@router.post("/rooms", response_model=RoomCreateResponse)
@limiter.limit("10/minute")
async def post_rooms(request: Request):
    room = create_room()
    await broadcast_lobby()
    return RoomCreateResponse(
        room_id=room.id,
        url=f"{FRONTEND_URL}/room/{room.id}",
        expires_at=room.expires_at,
    )


@router.get("/rooms", response_model=RoomListResponse)
async def list_rooms():
    """Lobby view: only rooms a user can join (open seat, not expired)."""
    return RoomListResponse(rooms=joinable_rooms())


@router.get("/rooms/{room_id}", response_model=RoomStatusResponse)
async def get_room(room_id: str):
    room = rooms.get(room_id)
    if room is None or room.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Room not found or expired")
    if len(room.connections) >= 2:
        raise HTTPException(status_code=409, detail="Room is full")
    n = len(room.connections)
    status = "active" if n == 2 else "waiting"
    return RoomStatusResponse(
        room_id=room.id,
        status=status,
        participant_count=n,
        expires_at=room.expires_at,
    )
