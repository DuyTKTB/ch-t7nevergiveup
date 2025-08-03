require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const geoip = require('geoip-lite');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Cấu hình mã hóa
const CIPHER_KEY = process.env.CIPHER_KEY || crypto.randomBytes(32).toString('hex');
const CIPHER_IV = process.env.CIPHER_IV || crypto.randomBytes(16).toString('hex');

// Hàm mã hóa
function encrypt(text) {
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CIPHER_KEY, 'hex'), Buffer.from(CIPHER_IV, 'hex'));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

// Hàm ghi log bảo mật
function secureLog(message, ip = '') {
  const logDir = path.join(__dirname, 'secure_logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const logPath = path.join(logDir, 'access.log');
  const timestamp = new Date().toISOString();
  const encryptedIP = ip ? ` | IP: ${encrypt(ip)}` : '';

  try {
    fs.appendFileSync(logPath, `[${timestamp}] ${message}${encryptedIP}\n`, {
      encoding: 'utf8',
      flag: 'a'
    });
  } catch (err) {
    console.error('Lỗi ghi log:', err);
  }
}

// Cấu hình upload ảnh
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, 'secure_uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + path.extname(file.originalname);
      cb(null, uniqueName);
    }
  }),
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
app.use(express.static(path.join(__dirname, 'public')));

// Middleware theo dõi IP
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip) || {};
  
  secureLog(`Truy cập HTTP từ ${geo.country || 'Unknown'}/${geo.city || 'Unknown'}`, ip);
  
  // Đính kèm thông tin IP vào request
  req.clientInfo = {
    ip: encrypt(ip),
    location: `${geo.country || 'Unknown'}/${geo.city || 'Unknown'}`
  };
  
  next();
});

// Route upload ảnh
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Không có file được tải lên' });
  }

  const imageUrl = `/secure_uploads/${req.file.filename}`;
  const { name, avatar } = req.body;

  // Gửi ảnh đến tất cả client
  io.emit('chat message', {
    name,
    avatar,
    imageUrl
  });

  secureLog(`User ${name} uploaded image`, req.clientInfo.ip);

  res.json({ imageUrl });
});

// Xử lý lỗi
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    secureLog(`Lỗi upload: ${err.message}`, req.clientInfo.ip);
    return res.status(400).json({ error: err.message });
  } else if (err) {
    secureLog(`Lỗi hệ thống: ${err.message}`, req.clientInfo.ip);
    return res.status(500).json({ error: 'Lỗi server' });
  }
  next();
});

// Quản lý người dùng
const users = {};

// Xử lý Socket.IO
io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const geo = geoip.lookup(ip) || {};
  const encryptedIP = encrypt(ip);
  
  secureLog(`Kết nối Socket từ ${geo.country || 'Unknown'}/${geo.city || 'Unknown'}`, ip);

  socket.on('new user', (userData) => {
    socket.username = userData.username;
    socket.avatar = userData.avatar;
    users[socket.id] = {
      ...userData,
      ip: encryptedIP,
      location: `${geo.country || 'Unknown'}/${geo.city || 'Unknown'}`
    };
    
    secureLog(`User ${userData.username} joined from ${geo.country || 'Unknown'}/${geo.city || 'Unknown'}`, ip);

    io.emit('user joined', {
      username: userData.username,
      avatar: userData.avatar,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on('chat message', (data) => {
    secureLog(`Message from ${socket.username || 'Unknown'}`, users[socket.id]?.ip);
    io.emit('chat message', {
      ...data,
      time: new Date().toLocaleTimeString()
    });
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      secureLog(`User ${socket.username} disconnected`, users[socket.id]?.ip);
      io.emit('user left', {
        username: socket.username,
        time: new Date().toLocaleTimeString()
      });
      delete users[socket.id];
    }
  });
});

// Route quản trị (bảo mật)
app.get('/admin/logs', (req, res) => {
  const adminPass = req.query.password;
  if (adminPass !== process.env.ADMIN_PASSWORD) {
    secureLog('Unauthorized admin access attempt', req.clientInfo.ip);
    return res.status(403).send('Truy cập bị từ chối');
  }

  try {
    const logPath = path.join(__dirname, 'secure_logs', 'access.log');
    if (fs.existsSync(logPath)) {
      const logs = fs.readFileSync(logPath, 'utf8');
      res.type('text/plain').send(logs);
    } else {
      res.status(404).send('Không tìm thấy file log');
    }
  } catch (err) {
    secureLog(`Admin log error: ${err.message}`, req.clientInfo.ip);
    res.status(500).send('Lỗi server');
  }
});

// Xóa log cũ định kỳ
setInterval(() => {
  const logPath = path.join(__dirname, 'secure_logs', 'access.log');
  if (fs.existsSync(logPath)) {
    const stats = fs.statSync(logPath);
    const fileSize = stats.size / (1024 * 1024); // MB
    
    if (fileSize > 10) { // Nếu file log > 10MB
      fs.writeFileSync(logPath, ''); // Xóa nội dung cũ
      secureLog('Đã xóa log cũ do vượt quá kích thước');
    }
  }
}, 24 * 60 * 60 * 1000); // Kiểm tra mỗi 24h

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  secureLog(`Server khởi động trên port ${PORT}`);
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});