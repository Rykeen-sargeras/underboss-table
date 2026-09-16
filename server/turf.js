const BOARD = [
  { name: "Family HQ", type: "start" },
  { name: "The Docks", type: "property", price: 60, rent: 10, color: "ice" },
  { name: "Street Tax", type: "fee", amount: 50 },
  { name: "The Speakeasy", type: "property", price: 80, rent: 14, color: "orange" },
  { name: "Little Italy", type: "property", price: 100, rent: 18, color: "orange" },
  { name: "Backroom Deal", type: "event" },
  { name: "City Hall", type: "property", price: 140, rent: 24, color: "gold" },
  { name: "The Can", type: "jail" },
  { name: "Casino Row", type: "property", price: 180, rent: 30, color: "blood" },
  { name: "Protection Fee", type: "fee", amount: 75 },
  { name: "Garment District", type: "property", price: 200, rent: 34, color: "cash" },
  { name: "The Nightclub", type: "property", price: 240, rent: 40, color: "blood" },
  { name: "Uptown", type: "property", price: 280, rent: 48, color: "gold" },
  { name: "Backroom Deal", type: "event" },
  { name: "Waterfront", type: "property", price: 350, rent: 60, color: "ice" },
  { name: "Union Hall", type: "property", price: 400, rent: 75, color: "cash" }
];

function startTurfGame(table) {
  table.game = {
    kind: "turf",
    players: table.players.map((player, index) => ({ ...player, cash: 1500, position: 0, bankrupt: false, token: index })),
    owners: {}, turn: Math.floor(Math.random() * table.players.length), phase: "roll", dice: null,
    pendingProperty: null, winner: null, message: "The city is open for business."
  };
  table.status = "playing";
}

function activePlayers(game) { return game.players.filter((player) => !player.bankrupt); }
function current(game) { return game.players[game.turn]; }
function requireTurn(game, userId) {
  if (!game || game.kind !== "turf") throw new Error("This turf war has not started.");
  if (game.winner) throw new Error("The city already has an owner.");
  if (current(game).id !== userId) throw new Error("Wait for your turn.");
}
function checkBankruptcy(game, player) {
  if (player.cash >= 0) return;
  player.bankrupt = true;
  for (const [space, owner] of Object.entries(game.owners)) if (owner === player.id) delete game.owners[space];
  game.message += ` ${player.username} is out of business.`;
}
function advance(game) {
  const survivors = activePlayers(game);
  if (survivors.length === 1 && game.players.length > 1) {
    game.winner = survivors[0].id; game.message = `${survivors[0].username} owns the city.`; return;
  }
  let next = game.turn;
  do { next = (next + 1) % game.players.length; } while (game.players[next].bankrupt);
  game.turn = next; game.phase = "roll"; game.pendingProperty = null;
}
function resolveSpace(game, player) {
  const space = BOARD[player.position];
  if (space.type === "property") {
    const ownerId = game.owners[player.position];
    if (!ownerId) { game.pendingProperty = player.position; game.phase = "buy-or-pass"; game.message = `${player.username} landed on ${space.name}.`; return; }
    if (ownerId !== player.id) {
      const owner = game.players.find((candidate) => candidate.id === ownerId);
      player.cash -= space.rent; if (owner && !owner.bankrupt) owner.cash += space.rent;
      game.message = `${player.username} paid $${space.rent} tribute to ${owner?.username || "the bank"}.`;
      checkBankruptcy(game, player);
    } else game.message = `${player.username} checked on their ${space.name} operation.`;
  } else if (space.type === "fee") {
    player.cash -= space.amount; game.message = `${player.username} paid a $${space.amount} ${space.name}.`; checkBankruptcy(game, player);
  } else if (space.type === "event") {
    const events = [
      { amount: 100, text: "A favor paid off. Collect $100." },
      { amount: -100, text: "The books came up short. Pay $100." },
      { amount: 50, text: "A friendly tip came through. Collect $50." },
      { amount: -50, text: "A witness needed convincing. Pay $50." }
    ];
    const event = events[Math.floor(Math.random() * events.length)]; player.cash += event.amount;
    game.message = `${player.username}: ${event.text}`; checkBankruptcy(game, player);
  } else if (space.type === "jail") game.message = `${player.username} is just visiting The Can.`;
  else game.message = `${player.username} returned to Family HQ.`;
  advance(game);
}

function rollDice(table, userId) {
  const game = table.game; requireTurn(game, userId);
  if (game.phase !== "roll") throw new Error("Settle the property first.");
  const dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  const player = current(game); const old = player.position; player.position = (player.position + dice[0] + dice[1]) % BOARD.length;
  const passedHq = player.position < old;
  if (passedHq) player.cash += 200;
  game.dice = dice; resolveSpace(game, player);
  if (passedHq) game.message += ` ${player.username} collected $200 for passing Family HQ.`;
}
function buyProperty(table, userId) {
  const game = table.game; requireTurn(game, userId);
  if (game.phase !== "buy-or-pass" || game.pendingProperty == null) throw new Error("There is no turf to buy.");
  const player = current(game); const space = BOARD[game.pendingProperty];
  if (player.cash < space.price) throw new Error("You do not have enough cash for this turf.");
  player.cash -= space.price; game.owners[game.pendingProperty] = player.id;
  game.message = `${player.username} bought ${space.name} for $${space.price}.`; advance(game);
}
function passProperty(table, userId) {
  const game = table.game; requireTurn(game, userId);
  if (game.phase !== "buy-or-pass") throw new Error("Roll the dice first.");
  game.message = `${current(game).username} passed on ${BOARD[game.pendingProperty].name}.`; advance(game);
}
function turfPublicState(table) {
  const game = table.game; if (!game) return null;
  return { kind: "turf", board: BOARD, players: game.players.map(({ id, username, avatar, cash, position, bankrupt, token }) => ({ id, username, avatar, cash, position, bankrupt, token })), owners: game.owners, turnPlayerId: current(game)?.id, phase: game.phase, dice: game.dice, pendingProperty: game.pendingProperty, winner: game.winner, message: game.message };
}

module.exports = { BOARD, startTurfGame, rollDice, buyProperty, passProperty, turfPublicState };
