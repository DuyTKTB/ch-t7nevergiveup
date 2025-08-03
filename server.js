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

// Route upload ảnh
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  const { name, avatar } = req.body;

  // Gửi ảnh đến tất cả client
  io.emit('chat message', {
    name,
    avatar,
    imageUrl
  });

  res.json({ imageUrl });
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

// Theo dõi người dùng
const users = {};

// Xử lý kết nối Socket.IO
io.on('connection', (socket) => {
  console.log('Người dùng mới kết nối');

  // Khi người dùng đăng nhập
  socket.on('new user', (userData) => {
    socket.username = userData.username;
    socket.avatar = userData.avatar;
    users[socket.id] = userData;
    
    // Thông báo có người dùng mới
    io.emit('user joined', {
      username: userData.username,
      avatar: userData.avatar,
      time: new Date().toLocaleTimeString()
    });
    
    console.log(`${userData.username} đã tham gia phòng chat`);
  });

  // Xử lý tin nhắn chat
  socket.on('chat message', (data) => {
    io.emit('chat message', {
      ...data,
      time: new Date().toLocaleTimeString()
    });
  });

  // Xử lý khi có người đang gõ
  socket.on('typing', (name) => {
    socket.broadcast.emit('typing', name);
  });

  // Xử lý khi ngừng gõ
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing');
  });

  // Xử lý khi ngắt kết nối
  socket.on('disconnect', () => {
    if (socket.username) {
      // Thông báo có người rời khỏi
      io.emit('user left', {
        username: socket.username,
        time: new Date().toLocaleTimeString()
      });
      
      console.log(`${socket.username} đã rời khỏi phòng chat`);
      delete users[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server đang chạy trên port ${PORT}`);
});
// Thêm route xử lý upload avatar
app.post('/upload-avatar', upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  
  // Tạo thư mục avatars nếu chưa có
  const avatarDir = 'public/uploads/avatars/';
  if (!fs.existsSync(avatarDir)) {
    fs.mkdirSync(avatarDir, { recursive: true });
  }

  // Di chuyển file vào thư mục avatars
  fs.renameSync(req.file.path, avatarDir + req.file.filename);

  res.json({ avatarUrl });
});
// Thêm middleware để log IP
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`IP truy cập: ${ip} - Thời gian: ${new Date().toISOString()}`);
  next();
});

// Socket.IO connection
io.on('connection', (socket) => {
  const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  console.log(`Người dùng kết nối từ IP: ${clientIp}`);
  
  // Lưu IP vào object socket
  socket.clientIp = clientIp;
  
  // ... phần xử lý kết nối hiện có
});
// Thêm model IP (nếu dùng database)
const mongoose = require('mongoose');
const ipSchema = new mongoose.Schema({
  ip: String,
  timestamp: { type: Date, default: Date.now },
  userAgent: String
});
const IpModel = mongoose.model('IpLog', ipSchema);

// Middleware lưu IP
app.use(async (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  await IpModel.create({
    ip,
    userAgent: req.headers['user-agent']
  });
  next();
});
// Thêm route admin (bảo mật bằng password)
app.get('/admin/ips', async (req, res) => {
  // Kiểm tra auth
  if (req.query.password !== 'YOUR_SECURE_PASSWORD') {
    return res.status(403).send('Truy cập bị từ chối');
  }
  
  const ips = await IpModel.find().sort({ timestamp: -1 });
  res.json(ips);
});