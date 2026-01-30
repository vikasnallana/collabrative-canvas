const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};
const clients = new Map(); // ws -> { roomId, userId }

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = {
      users: {},
      strokes: [],
      redoStack: []
    };
  }
  return rooms[roomId];
}

function broadcastToRoom(roomId, data) {
  const msg = JSON.stringify(data);
  for (const [client, info] of clients.entries()) {
    if (info.roomId === roomId && client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

wss.on("connection", (ws) => {
  clients.set(ws, {});

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    // -------- JOIN --------
    if (data.type === "join") {
      const { roomId, userId, name, color } = data;
      const room = getRoom(roomId);

      room.users[userId] = { name, color };
      clients.set(ws, { roomId, userId });

      // Send full state to new user
      ws.send(JSON.stringify({
        type: "state",
        strokes: room.strokes
      }));

      // Broadcast user list
      broadcastToRoom(roomId, {
        type: "users",
        users: room.users
      });
      return;
    }

    const info = clients.get(ws);
    if (!info || !info.roomId) return;

    const room = getRoom(info.roomId);

    // -------- STROKES STORAGE --------
    if (data.type === "start") {
      room.strokes.push([data]);
      room.redoStack = [];
    }

    if (data.type === "draw") {
      if (room.strokes.length > 0) {
        room.strokes[room.strokes.length - 1].push(data);
      }
    }

    if (data.type === "end") {
      if (room.strokes.length > 0) {
        room.strokes[room.strokes.length - 1].push(data);
      }
    }

    // -------- LIVE RELAY --------
    if (["start", "draw", "end"].includes(data.type)) {
      broadcastToRoom(info.roomId, data);
      return;
    }

    // -------- UNDO / REDO --------
    if (data.type === "undo") {
      if (room.strokes.length > 0) {
        room.redoStack.push(room.strokes.pop());
      }

      broadcastToRoom(info.roomId, {
        type: "state",
        strokes: room.strokes
      });
      return;
    }

    if (data.type === "redo") {
      if (room.redoStack.length > 0) {
        room.strokes.push(room.redoStack.pop());
      }

      broadcastToRoom(info.roomId, {
        type: "state",
        strokes: room.strokes
      });
      return;
    }

    // -------- CLEAR --------
    if (data.type === "clear") {
      room.strokes = [];
      room.redoStack = [];

      broadcastToRoom(info.roomId, {
        type: "state",
        strokes: room.strokes
      });
      return;
    }
  });

  ws.on("close", () => {
    const info = clients.get(ws);
    if (!info || !info.roomId) return;

    const room = rooms[info.roomId];
    if (room && room.users[info.userId]) {
      delete room.users[info.userId];

      broadcastToRoom(info.roomId, {
        type: "users",
        users: room.users
      });
    }

    clients.delete(ws);
  });
});

server.listen(3000, () => {
  console.log("Server running at ws://localhost:3000");
});
