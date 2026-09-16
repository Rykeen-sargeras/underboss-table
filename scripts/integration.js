const { io } = require("socket.io-client");

const base = process.env.TEST_URL || "http://localhost:3000";
const stamp = Date.now().toString(36);
async function register(username) {
  const response = await fetch(`${base}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password: "test-pass-123" }) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
async function guest() {
  const response = await fetch(`${base}/api/auth/guest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
const connect = (token) => new Promise((resolve, reject) => {
  const socket = io(base, { auth: { token }, transports: ["websocket"] });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", reject);
});
const emit = (socket, event, payload) => new Promise((resolve, reject) => socket.emit(event, payload, (reply) => reply.error ? reject(new Error(reply.error)) : resolve(reply)));

(async () => {
  const [a, b] = await Promise.all([register(`qa_boss_${stamp}`), register(`qa_crew_${stamp}`)]);
  const [one, two] = await Promise.all([connect(a.token), connect(b.token)]);
  const created = await emit(one, "table:create", { name: "QA Backroom", maxSeats: 10 });
  await emit(two, "table:join", created.id);
  const nextUpdate = new Promise((resolve) => one.once("table:update", resolve));
  await emit(one, "game:start", {});
  const update = await nextUpdate;
  if (!update.game || update.game.players.length !== 2 || update.table.maxSeats !== 10) throw new Error("Ten-seat game state was not broadcast.");
  one.disconnect(); two.disconnect();
  const [c, d] = await Promise.all([guest(), guest()]);
  const [three, four] = await Promise.all([connect(c.token), connect(d.token)]);
  const turf = await emit(three, "table:create", { name: "QA Turf", maxSeats: 4, gameType: "turf" });
  await emit(four, "table:join", turf.id);
  const turfUpdate = new Promise((resolve) => three.once("table:update", ({ game }) => game?.kind === "turf" && resolve(game)));
  await emit(three, "game:start", {});
  const turfGame = await turfUpdate;
  if (turfGame.board.length !== 28 || turfGame.players.length !== 2) throw new Error("Turf state was not broadcast.");
  const active = turfGame.turnPlayerId === c.user.id ? three : four;
  await emit(active, "turf:roll", {});
  three.disconnect(); four.disconnect();
  console.log("Integration flows passed: card deal and Turf Wars create → join → start → roll");
})().catch((error) => { console.error(error); process.exitCode = 1; });
