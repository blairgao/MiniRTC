from datetime import datetime

from pydantic import BaseModel, Field


class RoomCreateRequest(BaseModel):
    # Optional custom room name; becomes the room ID. Alphanumeric only.
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=32,
        pattern=r"^[A-Za-z0-9]+$",
    )


class RoomCreateResponse(BaseModel):
    room_id: str
    url: str
    expires_at: datetime


class RoomStatusResponse(BaseModel):
    room_id: str
    status: str
    participant_count: int
    expires_at: datetime


class RoomListResponse(BaseModel):
    rooms: list[RoomStatusResponse]
