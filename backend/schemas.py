from datetime import datetime

from pydantic import BaseModel


class RoomCreateResponse(BaseModel):
    room_id: str
    url: str
    expires_at: datetime


class RoomStatusResponse(BaseModel):
    room_id: str
    status: str
    participant_count: int
    expires_at: datetime
