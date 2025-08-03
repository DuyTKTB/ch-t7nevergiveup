const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// Phục vụ file tĩnh từ thư mục public
app.use(express.static('public'));

// Xử lý các route khác
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('cộng một thằng mới vô');
  
  socket.on('chat message', (msg) => {
    io.emit('chat message', msg);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});