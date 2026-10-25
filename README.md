# Spotify 2.O: Backend

WebSocket server for the shared listening rooms in [Spotify 2.O](https://github.com/DevVaradPatil/spotify-2.O).
It relays room chat and "play this song" events between listeners and keeps chat history in
Supabase.

## How it works

- Clients connect to `ws://<host>:8080/<roomCode>`.
- On connect, the server sends that room's chat history from the Supabase `messages` table.
- `CHAT` messages are stored in Supabase and broadcast to connected clients.
- `PLAY_SONG` messages are broadcast so everyone switches to the same track.
- Messages older than one hour are deleted every hour.

### Message format

```jsonc
// client → server
{ "type": "CHAT", "email": "...", "content": "...", "full_name": "...", "avatar_url": "..." }
{ "type": "PLAY_SONG", "songId": "..." }

// server → client
{ "type": "CHAT", "email": "...", "content": "...", "full_name": "...", "avatar_url": "..." }
{ "type": "PLAY_SONG", "songId": "..." }
```

### Supabase table

`messages`: `room_code`, `email`, `content`, `full_name`, `avatar_url`, `created_at`

## Running locally

```bash
npm install
npm start          # listens on port 8080
```

Create a `.env` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The service-role key bypasses row-level security, so keep it server-side only.

## Known limitation

Broadcasts currently go to every connected client, not only clients in the same room. Room
isolation needs a per-room client map.

Built with Node.js, [`ws`](https://github.com/websockets/ws) and Supabase.
