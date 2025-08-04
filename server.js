const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage for rooms and sessions
const rooms = new Map();

// RzzRzz poker card values (Fibonacci sequence)
const cardValues = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

class Room {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.users = new Map();
    this.currentStory = '';
    this.votes = new Map();
    this.votingRevealed = false;
    this.createdAt = new Date();
  }

  addUser(socketId, userName) {
    this.users.set(socketId, {
      id: socketId,
      name: userName,
      isSpectator: false
    });
  }

  removeUser(socketId) {
    this.users.delete(socketId);
    this.votes.delete(socketId);
  }

  castVote(socketId, vote) {
    if (this.users.has(socketId) && !this.users.get(socketId).isSpectator) {
      this.votes.set(socketId, vote);
    }
  }

  clearVotes() {
    this.votes.clear();
    this.votingRevealed = false;
  }

  revealVotes() {
    this.votingRevealed = true;
  }

  getVotingStats() {
    if (!this.votingRevealed) return null;
    
    const votes = Array.from(this.votes.values()).filter(v => v !== '?' && v !== '☕');
    const numericVotes = votes.map(v => parseInt(v)).filter(v => !isNaN(v));
    
    if (numericVotes.length === 0) return null;
    
    const average = numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length;
    const sortedVotes = [...numericVotes].sort((a, b) => a - b);
    const median = sortedVotes.length % 2 === 0 
      ? (sortedVotes[sortedVotes.length / 2 - 1] + sortedVotes[sortedVotes.length / 2]) / 2
      : sortedVotes[Math.floor(sortedVotes.length / 2)];
    
    return {
      average: Math.round(average * 10) / 10,
      median,
      min: Math.min(...numericVotes),
      max: Math.max(...numericVotes),
      totalVotes: this.votes.size
    };
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', (data) => {
    const roomId = uuidv4().substring(0, 8);
    const room = new Room(roomId, data.roomName);
    room.addUser(socket.id, data.userName);
    rooms.set(roomId, room);
    
    socket.join(roomId);
    socket.emit('room-created', { roomId, room: getRoomData(room) });
    
    console.log(`Room created: ${roomId} by ${data.userName}`);
  });

  socket.on('join-room', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    room.addUser(socket.id, data.userName);
    socket.join(data.roomId);
    
    socket.emit('room-joined', { room: getRoomData(room) });
    io.to(data.roomId).emit('user-joined', { 
      user: room.users.get(socket.id),
      room: getRoomData(room)
    });
    
    console.log(`${data.userName} joined room: ${data.roomId}`);
  });

  socket.on('set-story', (data) => {
    const room = getUserRoom(socket.id);
    if (room) {
      room.currentStory = data.story;
      room.clearVotes();
      io.to(room.id).emit('story-updated', { 
        story: data.story,
        room: getRoomData(room)
      });
    }
  });

  socket.on('cast-vote', (data) => {
    const room = getUserRoom(socket.id);
    if (room) {
      room.castVote(socket.id, data.vote);
      io.to(room.id).emit('vote-cast', { 
        userId: socket.id,
        hasVoted: true,
        room: getRoomData(room)
      });
    }
  });

  socket.on('reveal-votes', () => {
    const room = getUserRoom(socket.id);
    if (room) {
      room.revealVotes();
      io.to(room.id).emit('votes-revealed', { 
        room: getRoomData(room),
        stats: room.getVotingStats()
      });
    }
  });

  socket.on('clear-votes', () => {
    const room = getUserRoom(socket.id);
    if (room) {
      room.clearVotes();
      io.to(room.id).emit('votes-cleared', { 
        room: getRoomData(room)
      });
    }
  });

  socket.on('disconnect', () => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      room.removeUser(socket.id);
      
      if (room.users.size === 0) {
        rooms.delete(room.id);
        console.log(`Room ${room.id} deleted - no users remaining`);
      } else {
        io.to(room.id).emit('user-left', { 
          userId: socket.id,
          userName: user?.name,
          room: getRoomData(room)
        });
      }
    }
    console.log('User disconnected:', socket.id);
  });

  function getUserRoom(socketId) {
    for (const room of rooms.values()) {
      if (room.users.has(socketId)) {
        return room;
      }
    }
    return null;
  }

  function getRoomData(room) {
    return {
      id: room.id,
      name: room.name,
      users: Array.from(room.users.values()),
      currentStory: room.currentStory,
      votes: room.votingRevealed ? Object.fromEntries(room.votes) : 
             Object.fromEntries(Array.from(room.votes.keys()).map(key => [key, '***'])),
      votingRevealed: room.votingRevealed,
      cardValues
    };
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RzzRzz Poker server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to start RzzRzz poker sessions`);
}); 