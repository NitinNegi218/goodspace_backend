const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const SimplePeer = require('simple-peer');

const app = express();
app.use(cors());

// Serve static files
app.use(express.static(__dirname));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000"
  }
});

// MongoDB connection
mongoose.connect('mongodb+srv://NitinNegi:XBO3OCI7hVD0m3PX@cluster0.wjizxlc.mongodb.net/?retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Defining schema
const conversationSchema = new mongoose.Schema({
  message: String,
});

const Conversation = mongoose.model('Conversation', conversationSchema);

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, './index.html'));
});

io.on('connection', async (socket) => {
  try {
    // Load existing messages from MongoDB and emit to the connected client
    const messages = await Conversation.find({});
    socket.emit('chat history', messages);
  } catch (error) {
    console.error('Error loading chat history:', error);
  }

  socket.on('chat message', async (msg) => {
    try {
      // Save the message to MongoDB
      const newMessage = new Conversation({ message: msg });
      await newMessage.save();

      // Emit the new message to all connected clients
      io.emit('chat message', msg);
    } catch (error) {
      console.error('Error saving chat message:', error);
    }
  });

  // WebRTC setup for video and audio calls
  const peers = {};

  socket.on('join-room', (roomId) => {
    if (!peers[roomId]) peers[roomId] = [];

    // Initialize a new WebRTC peer
    const peer = new SimplePeer({ initiator: true, trickle: false });

    peer.on('signal', (signal) => {
      socket.emit('offer', { signal, roomId });
    });

    // Handle incoming offers and answers
    socket.on('offer', (data) => {
      const incoming = new SimplePeer({ trickle: false });
      incoming.signal(data.signal);

      incoming.on('signal', (signal) => {
        socket.emit('answer', { signal, roomId });
      });

      // Connect the peers
      peer.signal(data.signal);
    });

    peer.on('stream', (stream) => {
      // Broadcast the stream to all clients in the room
      io.to(roomId).emit('user-connected', stream.id);
      peers[roomId].push(peer);
    });

    socket.on('disconnect', () => {
      io.to(roomId).emit('user-disconnected', socket.id);
      const index = peers[roomId].indexOf(peer);
      if (index !== -1) peers[roomId].splice(index, 1);
    });

    socket.on('leave-room', () => {
      io.to(roomId).emit('user-disconnected', socket.id);
      socket.leave(roomId);
    });
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
