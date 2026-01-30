// ============================
// ROOM + USER SETUP
// ============================
const params = new URLSearchParams(window.location.search);
let roomId = params.get("room");

if (!roomId) {
  roomId = Math.random().toString(36).substring(2, 7);
  window.location.search = `?room=${roomId}`;
}

const userName = prompt("Enter your name:") || "Guest";
const userColor = "#" + Math.floor(Math.random() * 16777215).toString(16);
const userId = Math.random().toString(36).substring(2, 9);

// ============================
// DOM ELEMENTS
// ============================
document.getElementById("roomId").textContent = roomId;
const userListEl = document.getElementById("userList");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// ============================
// SOCKET
// ============================
const socket = new WebSocket("wss://collaborative-canvas-server.onrender.com");

// ============================
// RESIZE
// ============================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 60;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// ============================
// TOOLBAR
// ============================
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const brushBtn = document.getElementById("brush");
const eraserBtn = document.getElementById("eraser");
const clearBtn = document.getElementById("clear");
const undoBtn = document.getElementById("undo");
const redoBtn = document.getElementById("redo");

// ============================
// STATE
// ============================
let drawing = false;
let currentColor = "#000000";
let currentSize = 4;

// ============================
// UI HELPERS
// ============================
function setActive(btn) {
  brushBtn.classList.remove("active");
  eraserBtn.classList.remove("active");
  btn.classList.add("active");
}

// ============================
// USER LIST RENDER
// ============================
function renderUsers(users) {
  userListEl.innerHTML = "";

  Object.values(users).forEach((user) => {
    const li = document.createElement("li");

    const dot = document.createElement("div");
    dot.className = "userDot";
    dot.style.background = user.color;

    li.appendChild(dot);
    li.appendChild(document.createTextNode(user.name));

    userListEl.appendChild(li);
  });
}

// ============================
// TOOLBAR EVENTS
// ============================
colorPicker.addEventListener("change", (e) => {
  currentColor = e.target.value;
  setActive(brushBtn);
});

brushSize.addEventListener("change", (e) => {
  currentSize = e.target.value;
});

brushBtn.addEventListener("click", () => setActive(brushBtn));
eraserBtn.addEventListener("click", () => setActive(eraserBtn));

clearBtn.addEventListener("click", () => {
  clearCanvas();
  socket.send(JSON.stringify({ type: "clear" }));
});

undoBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "undo" }));
});

redoBtn.addEventListener("click", () => {
  socket.send(JSON.stringify({ type: "redo" }));
});

// ============================
// KEYBOARD SHORTCUTS
// ============================
document.addEventListener("keydown", (e) => {
  const isCtrl = e.ctrlKey || e.metaKey;
  if (!isCtrl) return;

  if (e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    socket.send(JSON.stringify({ type: "undo" }));
  }

  if (
    e.key.toLowerCase() === "y" ||
    (e.key.toLowerCase() === "z" && e.shiftKey)
  ) {
    e.preventDefault();
    socket.send(JSON.stringify({ type: "redo" }));
  }
});

// ============================
// SOCKET HANDLING
// ============================
socket.onopen = () => {
  socket.send(JSON.stringify({
    type: "join",
    roomId,
    userId,
    name: userName,
    color: userColor
  }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "users") {
    renderUsers(data.users);
    return;
  }

  if (data.type === "state") {
    redrawAll(data.strokes);
  }
};

// ============================
// DRAW EVENTS
// ============================
canvas.addEventListener("mousedown", (e) => {
  drawing = true;

  const data = {
    type: "start",
    x: e.offsetX,
    y: e.offsetY,
    color: currentColor,
    size: currentSize,
    tool: eraserBtn.classList.contains("active") ? "eraser" : "brush"
  };

  startStroke(data);
  socket.send(JSON.stringify(data));
});

canvas.addEventListener("mousemove", (e) => {
  if (!drawing) return;

  const data = {
    type: "draw",
    x: e.offsetX,
    y: e.offsetY
  };

  continueStroke(data);
  socket.send(JSON.stringify(data));
});

canvas.addEventListener("mouseup", () => {
  if (!drawing) return;
  drawing = false;

  endStroke();
  socket.send(JSON.stringify({ type: "end" }));
});

canvas.addEventListener("mouseleave", () => {
  drawing = false;
  endStroke();
});

// ============================
// DRAW FUNCTIONS
// ============================
function startStroke(data) {
  ctx.beginPath();
  ctx.moveTo(data.x, data.y);

  ctx.globalCompositeOperation = "source-over";

  if (data.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
  } else {
    ctx.strokeStyle = data.color;
  }

  ctx.lineWidth = data.size;
  ctx.lineCap = "round";
}

function continueStroke(data) {
  ctx.lineTo(data.x, data.y);
  ctx.stroke();
}

function endStroke() {
  ctx.closePath();
  ctx.globalCompositeOperation = "source-over";
}

// ============================
// CANVAS RENDER
// ============================
function clearCanvas() {
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
}

function redrawAll(strokes) {
  clearCanvas();

  strokes.forEach((stroke) => {
    let started = false;

    stroke.forEach((event, index) => {
      if (event.type === "start") {
        started = true;
        startStroke(event);
        return;
      }

      if (!started) return;

      if (event.type === "draw") {
        continueStroke(event);
      }

      if (event.type === "end" || index === stroke.length - 1) {
        endStroke();
      }
    });
  });
}
