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

// Cấu hình upload ảnh
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'public/uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ được phép tải lên hình ảnh'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Middleware log IP
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`IP truy cập: ${ip} - ${new Date().toISOString()}`);
  next();
});

// Route upload ảnh chat
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  const { name, avatar } = req.body;

  io.emit('chat message', {
    name,
    avatar,
    imageUrl
  });

  res.json({ imageUrl });
});

// Route upload avatar cá nhân
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const avatarDir = 'public/uploads/avatars/';
  if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  fs.renameSync(req.file.path, avatarDir + req.file.filename);

  res.json({ avatarUrl });
});

// Xử lý lỗi upload
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  } else if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// Quản lý người dùng
const users = {};

// Xử lý kết nối Socket.IO
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log(`Người dùng kết nối từ IP: ${clientIp}`);
  
  socket.on('new user', (userData) => {
    socket.username = userData.username;
    socket.avatar = userData.avatar;
    users[socket.id] = userData;
    
    io.emit('user joined', {
      username: userData.username,
      avatar: userData.avatar,
      time: new Date().toLocaleTimeString()
    });
    
    console.log(`${userData.username} (${clientIp}) đã tham gia phòng chat`);
  });

  socket.on('chat message', (data) => {
    io.emit('chat message', {
      ...data,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on('typing', (name) => {
    socket.broadcast.emit('typing', name);
  });

  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing');
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      io.emit('user left', {
        username: socket.username,
        time: new Date().toLocaleTimeString()
      });
      
      console.log(`${socket.username} đã rời khỏi phòng chat`);
      delete users[socket.id];
    }
  });
});

// Route admin đơn giản (không dùng database)
app.get('/admin/ips', (req, res) => {
  // Kiểm tra auth đơn giản
  if (req.query.password !== process.env.ADMIN_PASSWORD) {
    return res.status(403).send('Truy cập bị từ chối');
  }
  
  // Trả về thông báo vì không dùng database
  res.send('Chức năng xem IP đã được log trong console server');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
});