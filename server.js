const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ['GET', 'POST']
  }
});

// Store active rooms and their passwords
const activeRooms = new Map();
const usernames = new Map(); // Store socket.id -> username mapping

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle room join requests
  socket.on('join_room', ({ roomCode, password, username }) => {
    usernames.set(socket.id, username);
    const room = activeRooms.get(roomCode);
    
    if (room && room.password !== password) {
      socket.emit('error', 'Invalid room password');
      return;
    }

    if (!room) {
      activeRooms.set(roomCode, { password, users: new Set([socket.id]) });
    } else {
      room.users.add(socket.id);
    }

    socket.join(roomCode);
    
    // Broadcast user count update
    const userCount = activeRooms.get(roomCode).users.size;
    io.to(roomCode).emit('user_count', userCount);

    // Send system messages
    io.to(roomCode).emit('message', {
      id: Date.now().toString(),
      text: `Room ${roomCode} initialized. Encrypted channel established.`,
      timestamp: new Date().toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      user: 'system',
      color: 'green'
    });
  });

  // Handle chat messages
  socket.on('send_message', ({ roomCode, message }) => {
    if (!message.trim()) return;

    const room = activeRooms.get(roomCode);
    if (!room || !room.users.has(socket.id)) return;

    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    // Send different messages to sender and receivers
    socket.emit('message', {
      id: Date.now().toString(),
      text: message,
      timestamp,
      user: 'me',
      color: 'blue'
    });

    socket.to(roomCode).emit('message', {
      id: Date.now().toString(),
      text: message,
      timestamp,
      user: usernames.get(socket.id),
      color: 'blue'
    });
  });

  // Handle disconnections
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms they were in
    for (const [roomCode, room] of activeRooms.entries()) {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        
        // If room is empty, remove it
        if (room.users.size === 0) {
          activeRooms.delete(roomCode);
        } else {
          // Update user count for remaining users
          io.to(roomCode).emit('user_count', room.users.size);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});