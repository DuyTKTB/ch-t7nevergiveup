require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Cấu hình upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, 'public', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Quản lý người dùng online
let onlineUsers = {};
let onlineCount = 0;

// Route upload ảnh
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ imageUrl });
});

// Xử lý Socket.IO
io.on('connection', (socket) => {
  console.log('Người dùng mới kết nối:', socket.id);

  // Khi người dùng đăng nhập
  socket.on('new user', (userData) => {
    socket.userId = userData.userId || socket.id;
    socket.username = userData.username;
    socket.avatar = userData.avatar;
    
    // Thêm vào danh sách online
    if (!onlineUsers[socket.userId]) {
      onlineUsers[socket.userId] = {
        username: userData.username,
        avatar: userData.avatar
      };
      onlineCount++;
      
      console.log(`${userData.username} đã tham gia. Tổng: ${onlineCount} người online`);
      
      // Gửi thông báo có người mới
      io.emit('user joined', {
        username: userData.username,
        time: new Date().toLocaleTimeString()
      });
      
      // Cập nhật số lượng người online
      updateOnlineUsers();
    }
  });

  // Xử lý tin nhắn chat
  socket.on('chat message', (data) => {
    io.emit('chat message', {
      ...data,
      time: new Date().toLocaleTimeString()
    });
  });

  // Xử lý khi ngắt kết nối
  socket.on('disconnect', () => {
    if (socket.userId && onlineUsers[socket.userId]) {
      const username = onlineUsers[socket.userId].username;
      delete onlineUsers[socket.userId];
      onlineCount--;
      
      console.log(`${username} đã rời đi. Còn ${onlineCount} người online`);
      
      // Gửi thông báo có người rời đi
      io.emit('user left', {
        username: username,
        time: new Date().toLocaleTimeString()
      });
      
      // Cập nhật số lượng người online
      updateOnlineUsers();
    }
  });

  // Hàm cập nhật danh sách người online
  function updateOnlineUsers() {
    io.emit('online update', {
      onlineCount: onlineCount,
      onlineUsers: Object.values(onlineUsers)
    });
  }
});

// Route lấy thông tin online
app.get('/online', (req, res) => {
  res.json({
    onlineCount: onlineCount,
    onlineUsers: Object.values(onlineUsers)
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
});