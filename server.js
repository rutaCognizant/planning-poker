const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const session = require('express-session');

// Import admin and history modules
const historyLogger = require('./history');
const adminAuth = require('./admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware for admin authentication
app.use(session({
  secret: process.env.SESSION_SECRET || 'rzzrzz-poker-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Admin API Routes
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const isValid = await adminAuth.verifyCredentials(username, password);
    
    if (isValid) {
      req.session.isAdmin = true;
      req.session.adminUsername = username;
      res.json({ success: true, message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/admin/stats', adminAuth.requireAdmin, async (req, res) => {
  try {
    const stats = await historyLogger.getActionsSummary();
    stats.activeRooms = rooms.size;
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

app.get('/api/admin/actions', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { date, user, action, limit = 100 } = req.query;
    let actions = [];

    if (date) {
      actions = await historyLogger.getActionsByDate(date);
    } else if (user) {
      actions = await historyLogger.getActionsByUser(user, parseInt(limit));
    } else {
      actions = await historyLogger.getRecentActions(parseInt(limit));
    }

    // Apply additional filters
    if (action) {
      actions = actions.filter(a => a.action === action);
    }
    if (user && !date) {
      actions = actions.filter(a => a.userName && a.userName.toLowerCase().includes(user.toLowerCase()));
    }

    res.json(actions);
  } catch (error) {
    console.error('Actions error:', error);
    res.status(500).json({ error: 'Failed to load actions' });
  }
});

// In-memory storage for rooms and sessions
const rooms = new Map();

// RzzRzz poker card values (Fibonacci sequence)
const cardValues = ['0', '½', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];

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

  socket.on('create-room', async (data) => {
    const roomId = uuidv4().substring(0, 8);
    const room = new Room(roomId, data.roomName);
    room.addUser(socket.id, data.userName);
    rooms.set(roomId, room);
    
    socket.join(roomId);
    socket.emit('room-created', { roomId, room: getRoomData(room) });
    
    // Log action to history
    await historyLogger.logAction({
      action: 'room_created',
      userName: data.userName,
      roomId: roomId,
      details: { 
        roomName: data.roomName,
        socketId: socket.id 
      },
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });
    
    console.log(`Room created: ${roomId} by ${data.userName}`);
  });

  socket.on('join-room', async (data) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      
      // Log failed join attempt
      await historyLogger.logAction({
        action: 'room_join_failed',
        userName: data.userName,
        roomId: data.roomId,
        details: { reason: 'Room not found', socketId: socket.id },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
      return;
    }

    room.addUser(socket.id, data.userName);
    socket.join(data.roomId);
    
    socket.emit('room-joined', { room: getRoomData(room) });
    io.to(data.roomId).emit('user-joined', { 
      user: room.users.get(socket.id),
      room: getRoomData(room)
    });
    
    // Log successful join
    await historyLogger.logAction({
      action: 'room_joined',
      userName: data.userName,
      roomId: data.roomId,
      details: { 
        roomName: room.name,
        socketId: socket.id,
        usersInRoom: room.users.size
      },
      ip: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });
    
    console.log(`${data.userName} joined room: ${data.roomId}`);
  });

  socket.on('set-story', async (data) => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      room.currentStory = data.story;
      room.clearVotes();
      io.to(room.id).emit('story-updated', { 
        story: data.story,
        room: getRoomData(room)
      });

      // Log story setting
      await historyLogger.logAction({
        action: 'story_set',
        userName: user?.name || 'Unknown',
        roomId: room.id,
        details: { 
          story: data.story,
          roomName: room.name,
          socketId: socket.id
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
    }
  });

  socket.on('cast-vote', async (data) => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      room.castVote(socket.id, data.vote);
      io.to(room.id).emit('vote-cast', { 
        userId: socket.id,
        hasVoted: true,
        room: getRoomData(room)
      });

      // Log vote casting
      await historyLogger.logAction({
        action: 'vote_cast',
        userName: user?.name || 'Unknown',
        roomId: room.id,
        details: { 
          vote: data.vote,
          story: room.currentStory,
          roomName: room.name,
          socketId: socket.id
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
    }
  });

  socket.on('reveal-votes', async () => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      const stats = room.getVotingStats();
      room.revealVotes();
      io.to(room.id).emit('votes-revealed', { 
        room: getRoomData(room),
        stats: stats
      });

      // Log vote revealing
      await historyLogger.logAction({
        action: 'votes_revealed',
        userName: user?.name || 'Unknown',
        roomId: room.id,
        details: { 
          story: room.currentStory,
          roomName: room.name,
          votingStats: stats,
          totalVotes: room.votes.size,
          socketId: socket.id
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
    }
  });

  socket.on('clear-votes', async () => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      room.clearVotes();
      io.to(room.id).emit('votes-cleared', { 
        room: getRoomData(room)
      });

      // Log vote clearing
      await historyLogger.logAction({
        action: 'votes_cleared',
        userName: user?.name || 'Unknown',
        roomId: room.id,
        details: { 
          story: room.currentStory,
          roomName: room.name,
          socketId: socket.id
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
    }
  });

  socket.on('disconnect', async () => {
    const room = getUserRoom(socket.id);
    if (room) {
      const user = room.users.get(socket.id);
      room.removeUser(socket.id);
      
      // Log user disconnect
      await historyLogger.logAction({
        action: 'user_disconnected',
        userName: user?.name || 'Unknown',
        roomId: room.id,
        details: { 
          roomName: room.name,
          remainingUsers: room.users.size,
          socketId: socket.id
        },
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent']
      });
      
      if (room.users.size === 0) {
        // Log room deletion
        await historyLogger.logAction({
          action: 'room_deleted',
          userName: 'System',
          roomId: room.id,
          details: { 
            roomName: room.name,
            reason: 'No users remaining'
          }
        });
        
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

// Initialize database connection and start server
async function startServer() {
  try {
    // Connect to MongoDB for history logging
    await historyLogger.connect();
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`🚀 RzzRzz Poker server running on port ${PORT}`);
      console.log(`🌐 Visit http://localhost:${PORT} to start RzzRzz poker sessions`);
      console.log(`🔧 Admin dashboard: http://localhost:${PORT}/admin.html`);
      console.log(`📊 Default admin credentials: username=admin, password=rzzrzz123`);
      console.log(`⚠️  Remember to change admin password in production!`);
    });

    // Log server startup
    await historyLogger.logAction({
      action: 'server_started',
      userName: 'System',
      roomId: null,
      details: { 
        port: PORT,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  
  await historyLogger.logAction({
    action: 'server_shutdown',
    userName: 'System',
    roomId: null,
    details: { reason: 'SIGTERM received' }
  });
  
  await historyLogger.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  
  await historyLogger.logAction({
    action: 'server_shutdown',
    userName: 'System',
    roomId: null,
    details: { reason: 'SIGINT received' }
  });
  
  await historyLogger.close();
  process.exit(0);
});

// Start the server
startServer(); 