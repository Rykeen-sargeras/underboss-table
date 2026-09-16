const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { token: localStorage.getItem("underboss_token"), user: null, socket: null, table: null, game: null, tables: [], authMode: "login", selectedGame: null, createGameType: "cards", pendingCard: null, pendingTarget: null };

const views = { guest: $("#guestView"), lobby: $("#lobbyView"), table: $("#tableView"), turf: $("#turfView") };
function showView(name) { Object.entries(views).forEach(([key, el]) => el.classList.toggle("hidden", key !== name)); }
function initials(name = "?") { return name.slice(0, 2).toUpperCase(); }
function setAvatar(el, user) {
  if (!el) return;
  el.textContent = user?.avatar ? "" : initials(user?.username);
  el.style.backgroundImage = user?.avatar ? `url("${user.avatar}")` : "";
}
let toastTimer;
function toast(message, type = "") {
  const el = $("#toast"); el.textContent = message; el.className = `toast show ${type}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = "toast", 3000);
}
async function api(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function dialog(id) { return document.getElementById(id); }
function openDialog(id) { const el = dialog(id); if (!el.open) el.showModal(); }
function closeDialogs() { $$('dialog[open]').forEach((el) => el.close()); }

function setAuthenticated(user, token = state.token, navigate = true) {
  state.user = user; state.token = token;
  localStorage.setItem("underboss_token", token);
  $("#signInButton").classList.add("hidden"); $("#profileButton").classList.remove("hidden");
  $("#headerName").textContent = user.username; $("#lobbyName").textContent = user.username; $("#profileName").textContent = user.username;
  $("#lobbyRecord").textContent = user.games ? `${user.wins} wins · ${user.games} deals` : "New to the family";
  $("#profileStats").textContent = user.guest ? "Mobster Casual · temporary session" : `${user.wins} wins · ${user.games} deals played`;
  [$("#headerAvatar"), $("#lobbyAvatar"), $("#profileAvatar")].forEach((el) => setAvatar(el, user));
  $("#avatarForm").classList.toggle("hidden", !!user.guest); $("#casualProfileNote").classList.toggle("hidden", !user.guest);
  connectSocket();
  if (navigate) openSelectedGame(); else showView("guest");
}
function signOut() {
  state.socket?.disconnect(); Object.assign(state, { token: null, user: null, socket: null, table: null, game: null });
  localStorage.removeItem("underboss_token"); closeDialogs();
  $("#signInButton").classList.remove("hidden"); $("#profileButton").classList.add("hidden"); showView("guest");
}
function openSelectedGame() { showView(state.selectedGame === "turf" ? "turf" : "lobby"); }
function chooseGame(game) { state.selectedGame = game; if (state.user) openSelectedGame(); else openAuth("login"); }
function connectSocket() {
  state.socket?.disconnect();
  state.socket = io({ auth: { token: state.token } });
  state.socket.on("connect_error", (error) => { if (error.message === "AUTH_REQUIRED") signOut(); else toast("Could not reach the backroom.", "error"); });
  state.socket.on("lobby:update", (tables) => { state.tables = tables; renderLobby(); renderTurfLobby(); });
  state.socket.on("table:update", ({ table, game }) => {
    state.table = table; state.game = game;
    if (table.type === "turf") { state.selectedGame = "turf"; showView("turf"); renderTurf(); }
    else { state.selectedGame = "cards"; showView("table"); renderTable(); }
  });
  state.socket.on("toast", ({ message, type }) => toast(message, type));
}
function emit(event, payload) {
  return new Promise((resolve) => state.socket.emit(event, payload, (reply) => {
    if (reply?.error) { toast(reply.error, "error"); resolve(false); } else resolve(true);
  }));
}

function renderLobby() {
  const list = $("#tableList");
  const waiting = state.tables.filter((t) => (t.type || "cards") === "cards" && t.status !== "playing" && t.seats < t.maxSeats);
  if (!waiting.length) {
    list.innerHTML = `<div class="empty-tables"><b>No open tables</b>Be the first to call a meeting.</div>`;
    return;
  }
  list.innerHTML = waiting.map((table) => `<article class="table-row">
    <div class="table-title"><span class="mini-seal">♛</span><div><h3>${escapeHtml(table.name)}</h3><p>Table ${table.id}</p></div></div>
    <div class="crew-stack">${table.players.map((p) => `<span class="avatar" style="${avatarStyle(p)}">${p.avatar ? "" : initials(p.username)}</span>`).join("")}</div>
    <div><p class="seat-count">${table.seats}/${table.maxSeats} seated</p><button class="button" data-join="${table.id}">Join</button></div>
  </article>`).join("");
  $$('[data-join]').forEach((button) => button.onclick = () => emit("table:join", button.dataset.join));
}
function renderTurfLobby() {
  const list = $("#turfTableList");
  if (!list) return;
  const waiting = state.tables.filter((t) => t.type === "turf" && t.status !== "playing" && t.seats < t.maxSeats);
  if (!waiting.length) { list.innerHTML = `<div class="empty-tables"><b>No open turf wars</b>Call the first sit-down.</div>`; return; }
  list.innerHTML = waiting.map((table) => `<article class="table-row"><div class="table-title"><span class="mini-seal">♛</span><div><h3>${escapeHtml(table.name)}</h3><p>Table ${table.id}</p></div></div><div class="crew-stack">${table.players.map((p) => `<span class="avatar" style="${avatarStyle(p)}">${p.avatar ? "" : initials(p.username)}</span>`).join("")}</div><div><p class="seat-count">${table.seats}/${table.maxSeats} families</p><button class="button" data-join-turf="${table.id}">Join</button></div></article>`).join("");
  $$('[data-join-turf]').forEach((button) => button.onclick = () => emit("table:join", button.dataset.joinTurf));
}
function avatarStyle(user) { return user.avatar ? `background-image:url('${user.avatar.replaceAll("'", "%27")}')` : ""; }
function escapeHtml(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }

const valueLabel = { "lay-low": "LAY\nLOW", "double-cross": "DOUBLE\nCROSS", shakedown: "SHAKE\nDOWN", "the-don": "THE\nDON", "hit-job": "HIT\nJOB", "trade-hands": "TRADE\nHANDS", "fuck-you-10": "FUCK YOU\n+10" };
const valueSymbol = { "lay-low": "⊘", "double-cross": "↻", shakedown: "+2", "the-don": "♛", "hit-job": "+4", "trade-hands": "⇄", "fuck-you-10": "+10" };
function cardHtml(card, extra = "") {
  if (!card) return "";
  const label = valueLabel[card.value] || card.value;
  const symbol = valueSymbol[card.value] || card.value;
  return `<button class="game-card ${card.suit} ${extra}" data-card-id="${card.id}" data-corner="${escapeHtml(symbol)}"><b>${escapeHtml(symbol)}</b><span>${escapeHtml(label).replace("\n", "<br>")}</span></button>`;
}
function seatPosition(index, count) {
  if (count === 1) return [50, 86];
  const angle = (Math.PI * 2 * index / count) + Math.PI / 2;
  return [50 + Math.cos(angle) * 43, 50 + Math.sin(angle) * 43];
}
function renderTable() {
  if (!state.table) return;
  $("#tableName").textContent = state.table.name; $("#tableCode").textContent = `TABLE ${state.table.id}`;
  const isHost = state.table.hostId === state.user.id;
  const active = state.table.status === "playing";
  $("#startGameButton").classList.toggle("hidden", !isHost || active);
  $("#startGameButton").textContent = state.table.status === "finished" ? "Deal again" : "Start the deal";
  $("#waitingState").classList.toggle("hidden", !!state.game);
  $("#gameCenter").classList.toggle("hidden", !state.game);
  $("#handArea").classList.toggle("hidden", !state.game);

  const players = state.game?.players || state.table.players.map((p) => ({ ...p, cardCount: 0 }));
  $("#playerSeats").innerHTML = players.map((p, index) => {
    const [x, y] = seatPosition(index, players.length);
    return `<div class="player-seat ${p.id === state.user.id ? "me" : ""} ${state.game?.turnPlayerId === p.id ? "active" : ""}" style="left:${x}%;top:${y}%">
      <span class="avatar" style="${avatarStyle(p)}">${p.avatar ? "" : initials(p.username)}</span><div><strong>${escapeHtml(p.username)}</strong><small>${state.game ? `${p.cardCount} cards` : "seated"}</small></div>
    </div>`;
  }).join("");
  if (!state.game) return;

  const myTurn = state.game.turnPlayerId === state.user.id;
  const current = state.game.players.find((p) => p.id === state.game.turnPlayerId);
  $("#turnBanner").textContent = state.game.winner ? `${state.game.players.find((p) => p.id === state.game.winner)?.username} wins` : myTurn ? "Your move" : `${current?.username}'s move`;
  $("#gameMessage").textContent = state.game.message;
  $("#deckCount").textContent = state.game.deckCount;
  $("#discardCard").outerHTML = cardHtml(state.game.topCard).replace("<button", '<div id="discardCard"').replace("</button>", "</div>");
  $("#drawPile").disabled = !myTurn || !!state.game.winner;
  $("#handHint").textContent = myTurn ? "Match the color or rank" : "Wait for your turn";
  const me = state.game.players.find((p) => p.id === state.user.id);
  const top = state.game.topCard;
  $("#hand").innerHTML = (me?.hand || []).map((card, index, all) => {
    const playable = myTurn && !state.game.winner && (card.suit === "wild" || card.suit === state.game.activeSuit || card.value === top.value);
    const rotate = (index - (all.length - 1) / 2) * 2.2;
    return cardHtml(card, playable ? "" : "unplayable").replace('class="game-card', `style="transform:rotate(${rotate}deg)" class="game-card`);
  }).join("");
  $$("#hand .game-card:not(.unplayable)").forEach((button) => button.onclick = () => playSelected(button.dataset.cardId));
}

const turfGrid = [[5,5],[5,4],[5,3],[5,2],[5,1],[4,1],[3,1],[2,1],[1,1],[1,2],[1,3],[1,4],[1,5],[2,5],[3,5],[4,5]];
function renderTurf() {
  const inTable = state.table?.type === "turf";
  $("#turfLobby").classList.toggle("hidden", inTable);
  $("#turfTableArea").classList.toggle("hidden", !inTable);
  $("#createTurfButton").classList.toggle("hidden", inTable);
  if (!inTable) { $("#turfHeader").textContent = "Turf Wars"; $("#turfCode").textContent = "OWN THE CITY"; return; }
  $("#turfHeader").textContent = state.table.name; $("#turfCode").textContent = `TURF TABLE ${state.table.id}`;
  const players = state.game?.players || state.table.players.map((p, token) => ({ ...p, token, cash: 1500, position: 0 }));
  $("#turfPlayerList").innerHTML = players.map((p) => `<div class="turf-player ${state.game?.turnPlayerId === p.id ? "active" : ""} ${p.bankrupt ? "bankrupt" : ""}"><span class="turf-token token-${p.token}">${p.token + 1}</span><div><b>${escapeHtml(p.username)}</b><small>${p.bankrupt ? "OUT OF BUSINESS" : `$${p.cash.toLocaleString()}`}</small></div></div>`).join("");
  const board = state.game?.board || [];
  if (!board.length) {
    $("#turfBoard").innerHTML = `<div class="turf-board-center"><span>♛</span><b>TURF WARS</b><small>WAITING FOR THE FAMILIES</small></div>`;
  } else {
    $("#turfBoard").innerHTML = board.map((space, index) => {
      const [row, col] = turfGrid[index]; const ownerId = state.game.owners[index]; const owner = players.find((p) => p.id === ownerId);
      const tokens = players.filter((p) => !p.bankrupt && p.position === index).map((p) => `<i class="turf-token token-${p.token}">${p.token + 1}</i>`).join("");
      const detail = space.type === "property" ? `$${space.price} · rent $${space.rent}` : space.type === "fee" ? `PAY $${space.amount}` : space.type === "start" ? "COLLECT $200" : space.type === "event" ? "TAKE A CHANCE" : "JUST VISITING";
      return `<div class="turf-space ${space.type} ${space.color || ""} ${state.game.pendingProperty === index ? "pending" : ""}" style="grid-row:${row};grid-column:${col}"><strong>${escapeHtml(space.name)}</strong><small>${detail}</small>${owner ? `<em>Owned by ${escapeHtml(owner.username)}</em>` : ""}<span class="space-tokens">${tokens}</span></div>`;
    }).join("") + `<div class="turf-board-center"><span>♛</span><b>TURF WARS</b><small>OWN THE CITY</small></div>`;
  }
  const isHost = state.table.hostId === state.user.id; const started = !!state.game; const myTurn = state.game?.turnPlayerId === state.user.id; const pending = state.game?.phase === "buy-or-pass";
  $("#turfStartButton").classList.toggle("hidden", !isHost || started);
  $("#turfRollButton").classList.toggle("hidden", !started || !myTurn || state.game.phase !== "roll" || !!state.game.winner);
  $("#turfBuyButton").classList.toggle("hidden", !started || !myTurn || !pending || !!state.game.winner);
  $("#turfPassButton").classList.toggle("hidden", !started || !myTurn || !pending || !!state.game.winner);
  $("#turfDice").textContent = state.game?.dice ? `${state.game.dice[0]}  ·  ${state.game.dice[1]}` : "—  ·  —";
  $("#turfMessage").textContent = state.game?.message || (isHost ? "Start when at least two families are seated." : "Waiting for the host to start.");
  if (pending) { const space = state.game.board[state.game.pendingProperty]; $("#turfBuyButton").textContent = `Buy ${space.name} · $${space.price}`; }
}

async function playSelected(cardId) {
  const card = state.game.players.find((p) => p.id === state.user.id)?.hand.find((c) => c.id === cardId);
  if (!card) return;
  if (card.value === "trade-hands") {
    state.pendingCard = cardId;
    const others = state.game.players.filter((player) => player.id !== state.user.id);
    $("#targetChoices").innerHTML = others.map((player) => `<button data-target="${player.id}"><span class="avatar" style="${avatarStyle(player)}">${player.avatar ? "" : initials(player.username)}</span>${escapeHtml(player.username)}<small>${player.cardCount} cards</small></button>`).join("");
    $$('[data-target]').forEach((button) => button.onclick = () => { state.pendingTarget = Number(button.dataset.target); dialog("targetDialog").close(); openDialog("suitDialog"); });
    return openDialog("targetDialog");
  }
  if (card.suit !== "wild") return emit("game:play", { cardId });
  state.pendingCard = cardId; openDialog("suitDialog");
}

function setAuthMode(mode) {
  state.authMode = mode;
  $("#authTitle").textContent = mode === "login" ? "Welcome back" : "Join the family";
  $("#authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  $$('[data-auth-tab]').forEach((b) => b.classList.toggle("active", b.dataset.authTab === mode));
  $("#authError").textContent = "";
}
function openAuth(mode) { setAuthMode(mode); openDialog("authDialog"); }

$$('[data-open-auth]').forEach((b) => b.onclick = () => openAuth(b.dataset.openAuth));
$$('[data-auth-tab]').forEach((b) => b.onclick = () => setAuthMode(b.dataset.authTab));
$$('[data-close-dialog]').forEach((b) => b.onclick = () => b.closest("dialog").close());
$("#signInButton").onclick = () => openAuth("login");
$("#profileButton").onclick = () => openDialog("profileDialog");
$("#rulesButton").onclick = () => openDialog("rulesDialog");
$("#logoutButton").onclick = signOut;
$("#homeButton").onclick = () => showView("guest");
$$('[data-select-game]').forEach((button) => button.onclick = () => chooseGame(button.dataset.selectGame));
$("#leaveTurfButton").onclick = async () => { if (state.table?.type === "turf" && !(await emit("table:leave", {}))) return; state.table = null; state.game = null; showView("guest"); };
$("#createTableButton").onclick = () => { state.createGameType = "cards"; $("#newTableName").placeholder = "The Gilded Room"; openDialog("createDialog"); };
$("#createTurfButton").onclick = () => { state.createGameType = "turf"; $("#newTableName").placeholder = "The Five Families"; openDialog("createDialog"); };
$("#authForm").onsubmit = async (event) => {
  event.preventDefault(); $("#authError").textContent = "";
  try {
    const body = JSON.stringify({ username: $("#authUsername").value, password: $("#authPassword").value });
    const data = await api(`/api/auth/${state.authMode}`, { method: "POST", body });
    closeDialogs(); setAuthenticated(data.user, data.token);
  } catch (error) { $("#authError").textContent = error.message; }
};
$("#guestLoginButton").onclick = async () => {
  $("#authError").textContent = "";
  try { const data = await api("/api/auth/guest", { method: "POST", body: "{}" }); closeDialogs(); setAuthenticated(data.user, data.token); toast(`Welcome, ${data.user.username}.`); }
  catch (error) { $("#authError").textContent = error.message; }
};
$("#avatarForm").onsubmit = async (event) => {
  event.preventDefault(); $("#avatarError").textContent = "";
  const file = $("#avatarInput").files[0]; if (!file) return $("#avatarError").textContent = "Choose a picture first.";
  try { const form = new FormData(); form.append("avatar", file); const data = await api("/api/me/avatar", { method: "POST", body: form }); closeDialogs(); setAuthenticated(data.user); toast("Profile picture updated."); }
  catch (error) { $("#avatarError").textContent = error.message; }
};
$("#createForm").onsubmit = async (event) => {
  event.preventDefault();
  const ok = await emit("table:create", { name: $("#newTableName").value, maxSeats: Number($("#newTableSeats").value), gameType: state.createGameType });
  if (ok) closeDialogs();
};
$("#leaveTableButton").onclick = async () => { if (await emit("table:leave", {})) { state.table = null; state.game = null; showView("lobby"); } };
$("#startGameButton").onclick = () => emit("game:start", {});
$("#drawPile").onclick = () => emit("game:draw", {});
$("#leaveTurfTableButton").onclick = async () => { if (await emit("table:leave", {})) { state.table = null; state.game = null; renderTurf(); } };
$("#turfStartButton").onclick = () => emit("game:start", {});
$("#turfRollButton").onclick = () => emit("turf:roll", {});
$("#turfBuyButton").onclick = () => emit("turf:buy", {});
$("#turfPassButton").onclick = () => emit("turf:pass", {});
$$('[data-suit]').forEach((button) => button.onclick = async () => { const cardId = state.pendingCard; const targetId = state.pendingTarget; state.pendingCard = null; state.pendingTarget = null; dialog("suitDialog").close(); await emit("game:play", { cardId, targetId, chosenSuit: button.dataset.suit }); });
$$('dialog').forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal && modal.id !== "suitDialog") modal.close(); }));

(async function boot() {
  if (!state.token) return showView("guest");
  try { const data = await api("/api/me"); setAuthenticated(data.user, state.token, false); }
  catch { signOut(); }
})();
