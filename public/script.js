// Lấy room id từ URL, vd: /room/abc123
const roomId = window.location.pathname.split("/room/")[1] || "default";
const socket = io({ query: { room: roomId } });

let username = "";

// Các element DOM
const usernamePopup = document.getElementById("username-popup");
const usernameInput = document.getElementById("username-input");
const enterChatBtn = document.getElementById("enterChatBtn");
const chatContainer = document.querySelector(".chat-container");
const roomHeader = document.getElementById("room-header");
const form = document.getElementById("chat-form");
const input = document.getElementById("msg");
const messages = document.getElementById("messages");
const typingDiv = document.getElementById("typing");
const darkToggle = document.getElementById("darkToggle");
const imageInput = document.getElementById("imageInput");

// Nhập tên người dùng
enterChatBtn.onclick = () => {
  const name = usernameInput.value.trim();
  if (!name) return alert("Bạn cần nhập tên!");
  username = name;
  usernamePopup.style.display = "none";
  chatContainer.style.display = "flex";
  roomHeader.textContent = `💬 Phòng: ${roomId} — Bạn: ${username}`;
};

// Gửi tin nhắn text
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!input.value.trim()) return;
  socket.emit("chat message", { user: username, text: input.value.trim() });
  input.value = "";
});

// Gửi emoji vào input
function addEmoji(emoji) {
  input.value += emoji;
  input.focus();
}

// Nhận tin nhắn text
socket.on("chat message", (msg) => {
  const item = document.createElement("div");
  item.classList.add("message", msg.user === username ? "mine" : "theirs");
  item.innerHTML = `<strong>${msg.user}</strong>: ${escapeHTML(msg.text)}`;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});

// Gửi ảnh
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    socket.emit("chat image", { user: username, image: reader.result });
  };
  reader.readAsDataURL(file);
  // Reset lại input
  imageInput.value = "";
});

// Nhận ảnh
socket.on("chat image", (msg) => {
  const item = document.createElement("div");
  item.classList.add("message", msg.user === username ? "mine" : "theirs");
  item.innerHTML = `<strong>${msg.user}</strong><br>`;
  const img = document.createElement("img");
  img.src = msg.image;
  item.appendChild(img);
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
});

// Gửi trạng thái "đang gõ..."
input.addEventListener("input", () => {
  socket.emit("typing", { user: username });
});

// Nhận trạng thái "đang gõ..."
socket.on("typing", (data) => {
  if (data.user === username) return;
  typingDiv.textContent = `${data.user} đang gõ...`;
  clearTimeout(typingDiv.timeout);
  typingDiv.timeout = setTimeout(() => {
    typingDiv.textContent = "";
  }, 1500);
});

// Toggle Dark Mode
darkToggle.onclick = () => {
  document.body.classList.toggle("dark");
};

// Hàm tránh lỗ hổng XSS đơn giản
function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
// Thêm các biến toàn cục
let selectedAvatar = "https://i.pravatar.cc/80?img=1";
let customAvatarUploaded = false;

// Hàm xử lý chọn avatar
function setupAvatarSelection() {
  const avatarOptions = document.querySelectorAll('.avatar-option:not(.upload-option)');
  const avatarUpload = document.getElementById('avatar-upload');
  
  // Xử lý chọn avatar mặc định
  avatarOptions.forEach(option => {
    option.addEventListener('click', () => {
      // Bỏ chọn tất cả
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      // Chọn avatar hiện tại
      option.classList.add('selected');
      // Lấy URL avatar
      const img = option.querySelector('img');
      selectedAvatar = img.src;
      customAvatarUploaded = false;
    });
  });
  
  // Xử lý upload avatar
  avatarUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Kiểm tra loại file
    if (!file.type.match('image.*')) {
      showNotification('Chỉ được phép tải lên hình ảnh', 'error');
      return;
    }
    
    // Kiểm tra kích thước file
    if (file.size > 2 * 1024 * 1024) { // 2MB
      showNotification('Kích thước ảnh tối đa là 2MB', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      selectedAvatar = event.target.result;
      customAvatarUploaded = true;
      
      // Bỏ chọn tất cả avatar mặc định
      avatarOptions.forEach(opt => opt.classList.remove('selected'));
      
      showNotification('Đã tải lên avatar thành công', 'success');
    };
    reader.readAsDataURL(file);
  });
}

// Cập nhật hàm initializeChat
function initializeChat() {
  // Sử dụng selectedAvatar thay vì tạo ngẫu nhiên
  AVATAR_URL = customAvatarUploaded ? selectedAvatar : selectedAvatar + "&u=" + Math.floor(Math.random() * 1000);
  
  // Phần còn lại giữ nguyên
  socket = io();
  // ...
}

// Thêm vào sự kiện DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  setupAvatarSelection();
  // ...
});
