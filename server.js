const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const server = new WebSocket.Server({ port: 8080 });

const clearOldMessages = async () => {
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

// Schedule the clearOldMessages function to run every hour
setInterval(clearOldMessages, 60 * 60 * 1000);

server.on('connection', async (socket, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const roomCode = urlParams.get('roomCode');
  console.log('Client connected to room:', roomCode);

  // Fetch previous messages from Supabase
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('room_code', roomCode)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
  } else {
    // Send all previous messages to the new client
    messages.forEach((message) => {
      socket.send(JSON.stringify({ type: 'CHAT', email: message.email, content: message.content, full_name: message.full_name, avatar_url: message.avatar_url }));
    });
  }

  socket.on('message', async (data) => {
    const parsedData = JSON.parse(data);
    console.log('Received:', parsedData);

    if (parsedData.type === 'PLAY_SONG') {
      // Broadcast the PLAY_SONG message to all connected clients
      server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'PLAY_SONG', songId: parsedData.songId }));
        }
      });
    } else if (parsedData.type === 'CHAT') {
      const { email, content, full_name, avatar_url } = parsedData;

      // Store the message in Supabase
      const { error } = await supabase
        .from('messages')
        .insert([{ room_code: roomCode, email, content, full_name, avatar_url }]);

      if (error) {
        console.error('Error storing message:', error);
      }

      // Broadcast the message to all connected clients
      server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'CHAT', email, content, full_name, avatar_url }));
        }
      });
    }
  });

  socket.on('close', () => {
    console.log('Client disconnected');
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log('WebSocket server is running on ws://localhost:8080');
