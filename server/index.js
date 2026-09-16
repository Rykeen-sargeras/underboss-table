const path = require("path");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const db = require("./db");
const { startGame, playCard, drawAndPass, publicState } = require("./game");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "local-dev-only-change-this-secret";
const app = express();
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket", "polling"] });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype))
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const tokenFor = (user) => jwt.sign({ sub: user.id, username: user.username, guest: !!user.guest }, JWT_SECRET, { expiresIn: user.guest ? "24h" : "30d" });
const guestUser = (decoded) => ({ id: decoded.sub, username: decoded.username, avatar: null, wins: 0, games: 0, guest: true });
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.guest ? guestUser(decoded) : db.findById(decoded.sub);
    if (!req.user) throw new Error("Missing user");
    next();
  } catch { res.status(401).json({ error: "Sign in to continue." }); }
};

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/auth/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ error: "Use 3–20 letters, numbers, or underscores." });
    if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (db.findByUsername(username)) return res.status(409).json({ error: "That name is already taken." });
    const user = db.createUser(username, await bcrypt.hash(password, 12));
    res.status(201).json({ token: tokenFor(user), user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create the account." });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const row = db.findByUsername(String(req.body.username || "").trim());
  if (!row || !(await bcrypt.compare(String(req.body.password || ""), row.password_hash))) {
    return res.status(401).json({ error: "Wrong username or password." });
  }
  const user = db.cleanUser(row);
  res.json({ token: tokenFor(user), user });
});
app.post("/api/auth/guest", (_req, res) => {
  const first = ["Lucky", "Quiet", "Fast", "Velvet", "Tiny", "Sharp", "Midnight", "Silver"];
  const second = ["Capo", "Gambler", "Driver", "Fixer", "Consigliere", "Bookie", "Enforcer", "Rook"];
  const username = `${first[Math.floor(Math.random() * first.length)]}${second[Math.floor(Math.random() * second.length)]}${Math.floor(100 + Math.random() * 900)}`;
  const user = { id: `guest:${require("crypto").randomUUID()}`, username, avatar: null, wins: 0, games: 0, guest: true };
  res.status(201).json({ token: tokenFor(user), user });
});
app.get("/api/me", auth, (req, res) => res.json({ user: req.user.guest ? req.user : db.cleanUser(req.user) }));
app.post("/api/me/avatar", auth, upload.single("avatar"), (req, res) => {
  if (req.user.guest) return res.status(403).json({ error: "Create an account to save a profile picture." });
  if (!req.file) return res.status(400).json({ error: "Choose a JPG, PNG, GIF, or WebP under 1 MB." });
  const avatar = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  res.json({ user: db.updateAvatar(req.user.id, avatar) });
});
app.get("/api/leaderboard", (_req, res) => res.json({ players: db.leaderboard() }));
app.get("/*splat", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "index.html")));

const tables = new Map();
const socketUsers = new Map();
let tableSequence = 100;
const tableSummary = (table) => ({
  id: table.id,
  name: table.name,
  hostId: table.hostId,
  status: table.status,
  seats: table.players.length,
  maxSeats: table.maxSeats,
  players: table.players.map(({ id, username, avatar }) => ({ id, username, avatar }))
});
const broadcastLobby = () => io.emit("lobby:update", [...tables.values()].map(tableSummary));
const emitTable = (table) => {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.tableId !== table.id || !socket.data.user) continue;
    socket.emit("table:update", { table: tableSummary(table), game: publicState(table, socket.data.user.id) });
  }
  broadcastLobby();
};
const leaveCurrentTable = (socket, disconnected = false) => {
  const table = tables.get(socket.data.tableId);
  const user = socket.data.user;
  if (!table || !user) return;
  socket.leave(`table:${table.id}`);
  socket.data.tableId = null;
  if (table.status === "playing") {
    if (!disconnected) socket.emit("toast", { type: "error", message: "You cannot abandon an active deal." });
    return;
  }
  table.players = table.players.filter((p) => p.id !== user.id);
  if (!table.players.length) tables.delete(table.id);
  else if (table.hostId === user.id) table.hostId = table.players[0].id;
  emitTable(table);
};

io.use((socket, next) => {
  try {
    const decoded = jwt.verify(socket.handshake.auth?.token, JWT_SECRET);
    if (decoded.guest) socket.data.user = guestUser(decoded);
    else {
      const row = db.findById(decoded.sub);
      if (!row) throw new Error("Unknown user");
      socket.data.user = db.cleanUser(row);
    }
    next();
  } catch { next(new Error("AUTH_REQUIRED")); }
});

io.on("connection", (socket) => {
  const user = socket.data.user;
  socketUsers.set(socket.id, user.id);
  socket.emit("lobby:update", [...tables.values()].map(tableSummary));

  socket.on("table:create", (payload, reply = () => {}) => {
    if (socket.data.tableId) return reply({ error: "Leave your current table first." });
    const id = String(++tableSequence);
    const table = {
      id,
      name: String(payload?.name || `${user.username}'s Table`).trim().slice(0, 28),
      hostId: user.id,
      maxSeats: Math.max(2, Math.min(6, Number(payload?.maxSeats) || 4)),
      status: "waiting",
      players: [{ ...user, socketId: socket.id }],
      game: null
    };
    tables.set(id, table);
    socket.data.tableId = id;
    socket.join(`table:${id}`);
    emitTable(table);
    reply({ ok: true, id });
  });

  socket.on("table:join", (id, reply = () => {}) => {
    const table = tables.get(String(id));
    if (!table) return reply({ error: "That table is gone." });
    if (table.status !== "waiting") return reply({ error: "That deal is already underway." });
    if (table.players.length >= table.maxSeats) return reply({ error: "That table is full." });
    if (socket.data.tableId && socket.data.tableId !== table.id) leaveCurrentTable(socket);
    if (!table.players.some((p) => p.id === user.id)) table.players.push({ ...user, socketId: socket.id });
    socket.data.tableId = table.id;
    socket.join(`table:${table.id}`);
    emitTable(table);
    reply({ ok: true });
  });

  socket.on("table:leave", (_payload, reply = () => {}) => {
    const table = tables.get(socket.data.tableId);
    if (table?.status === "playing") return reply({ error: "Finish the deal before leaving." });
    leaveCurrentTable(socket);
    reply({ ok: true });
  });

  socket.on("game:start", (_payload, reply = () => {}) => {
    const table = tables.get(socket.data.tableId);
    if (!table || table.hostId !== user.id) return reply({ error: "Only the host can start the deal." });
    if (table.players.length < 2) return reply({ error: "You need at least 2 players." });
    if (table.status === "playing") return reply({ error: "The deal already started." });
    startGame(table);
    emitTable(table);
    reply({ ok: true });
  });

  socket.on("game:play", (payload, reply = () => {}) => {
    const table = tables.get(socket.data.tableId);
    try {
      if (!table) throw new Error("Table not found.");
      const result = playCard(table, user.id, payload?.cardId, payload?.chosenSuit, payload?.targetId);
      if (result.ended) db.recordGame(table.game.players.map((p) => p.id), result.winnerId);
      emitTable(table);
      reply({ ok: true });
    } catch (error) { reply({ error: error.message }); }
  });

  socket.on("game:draw", (_payload, reply = () => {}) => {
    const table = tables.get(socket.data.tableId);
    try {
      if (!table) throw new Error("Table not found.");
      drawAndPass(table, user.id);
      emitTable(table);
      reply({ ok: true });
    } catch (error) { reply({ error: error.message }); }
  });

  socket.on("disconnect", () => {
    socketUsers.delete(socket.id);
    const table = tables.get(socket.data.tableId);
    if (table?.status !== "playing") leaveCurrentTable(socket, true);
  });
});

server.listen(PORT, "0.0.0.0", () => console.log(`Underboss Table listening on http://localhost:${PORT}`));
