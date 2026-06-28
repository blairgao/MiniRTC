export type SignalMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'leave' }

export type ServerMessage =
  | { type: 'joined'; role: 'host' | 'guest'; room_id: string }
  | { type: 'peer_joined'; role: 'guest' | 'host' }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'peer_left' }
  | { type: 'error'; code: string; message: string }
  | { type: 'room_full' }
  | { type: 'room_expired' }
  | { type: 'room_not_found' }
