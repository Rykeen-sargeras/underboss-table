const path = require("path");
const fs = require("fs");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "data", "underboss.json");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
let store = { nextId: 1, users: [] };

function save() {
  const temp = `${dbPath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store));
  fs.renameSync(temp, dbPath);
}
try { store = JSON.parse(fs.readFileSync(dbPath, "utf8")); } catch { save(); }

const cleanUser = (row) => row && ({
  id: row.id,
  username: row.username,
  avatar: row.avatar,
  wins: row.wins,
  games: row.games,
  createdAt: row.created_at
});

module.exports = {
  findByUsername(username) {
    return store.users.find((user) => user.username.toLowerCase() === String(username).toLowerCase());
  },
  findById(id) {
    return store.users.find((user) => user.id === Number(id));
  },
  createUser(username, passwordHash) {
    const user = { id: store.nextId++, username, password_hash: passwordHash, avatar: null, wins: 0, games: 0, created_at: new Date().toISOString() };
    store.users.push(user); save(); return cleanUser(user);
  },
  updateAvatar(id, avatar) {
    const user = store.users.find((item) => item.id === Number(id));
    if (user) { user.avatar = avatar; save(); }
    return cleanUser(user);
  },
  recordGame(playerIds, winnerId) {
    for (const id of playerIds) {
      const user = store.users.find((item) => item.id === Number(id));
      if (user) user.games += 1;
    }
    const winner = store.users.find((item) => item.id === Number(winnerId));
    if (winner) winner.wins += 1;
    save();
  },
  cleanUser,
  leaderboard() {
    return store.users.filter((user) => user.games > 0).sort((a, b) => b.wins - a.wins || a.games - b.games).slice(0, 10).map(cleanUser);
  }
};
