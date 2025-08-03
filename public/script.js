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
