const WebSocket = require('ws');

// roomCode -> Set of sockets in that room. Broadcasts only go to the sender's room.
const createServer = ({ port, supabase }) => {
  const server = new WebSocket.Server({ port });
  const rooms = new Map();

  const broadcast = (roomCode, payload) => {
    const message = JSON.stringify(payload);
    for (const client of rooms.get(roomCode) || []) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  };

  const leave = (roomCode, socket) => {
    const members = rooms.get(roomCode);
    if (!members) return;
    members.delete(socket);
    if (members.size === 0) rooms.delete(roomCode);
  };

  server.on('connection', async (socket, req) => {
    const roomCode = (req.url || '').split('/')[1];
    if (!roomCode) {
      socket.close(1008, 'Room code required');
      return;
    }

    // Join and attach handlers before the history fetch, so nothing sent meanwhile is missed.
    if (!rooms.has(roomCode)) rooms.set(roomCode, new Set());
    rooms.get(roomCode).add(socket);
    console.log('Client connected to room:', roomCode);

    socket.on('message', async (data) => {
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        return;
      }

      if (parsedData.type === 'PLAY_SONG') {
        broadcast(roomCode, { type: 'PLAY_SONG', songId: parsedData.songId });
      } else if (parsedData.type === 'CHAT') {
        const { email, content, full_name, avatar_url } = parsedData;

        const { error } = await supabase
          .from('messages')
          .insert([{ room_code: roomCode, email, content, full_name, avatar_url }]);

        if (error) {
          console.error('Error storing message:', error);
        }

        broadcast(roomCode, { type: 'CHAT', email, content, full_name, avatar_url });
      }
    });

    socket.on('close', () => {
      leave(roomCode, socket);
      console.log('Client disconnected from room:', roomCode);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Send this room's previous messages to the new client
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_code', roomCode)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
    } else if (socket.readyState === WebSocket.OPEN) {
      messages.forEach((message) => {
        socket.send(JSON.stringify({ type: 'CHAT', email: message.email, content: message.content, full_name: message.full_name, avatar_url: message.avatar_url }));
      });
    }
  });

  return server;
};

const clearOldMessages = async (supabase) => {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('messages')
    .delete()
    .lt('created_at', oneHourAgo);

  if (error) {
    console.error('Error clearing old messages:', error);
  } else {
    console.log('Old messages cleared');
  }
};

if (require.main === module) {
  require('dotenv').config();
  const { createClient } = require('@supabase/supabase-js');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  createServer({ port: process.env.PORT || 8080, supabase });

  // Clear messages older than an hour, every hour
  setInterval(() => clearOldMessages(supabase), 60 * 60 * 1000);

  console.log('WebSocket server is running.');
}

module.exports = { createServer };
