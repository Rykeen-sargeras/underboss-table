const test = require("node:test");
const assert = require("node:assert/strict");
const { BOARD, startTurfGame, rollDice, buyProperty, passProperty, turfPublicState } = require("../server/turf");

function table() {
  return { status: "waiting", players: [
    { id: 1, username: "Vito", avatar: null },
    { id: 2, username: "Connie", avatar: null }
  ] };
}

test("starts Turf Wars with cash, tokens, and the full board", () => {
  const room = table(); startTurfGame(room); const view = turfPublicState(room);
  assert.equal(room.status, "playing");
  assert.equal(view.board.length, 16);
  assert.equal(view.players.length, 2);
  assert.ok(view.players.every((player) => player.cash === 1500 && player.position === 0));
  assert.equal(view.phase, "roll");
});

test("current player can buy an available property", () => {
  const room = table(); startTurfGame(room);
  room.game.turn = 0; room.game.phase = "buy-or-pass"; room.game.pendingProperty = 1;
  buyProperty(room, 1);
  assert.equal(room.game.owners[1], 1);
  assert.equal(room.game.players[0].cash, 1500 - BOARD[1].price);
  assert.equal(room.game.turn, 1);
  assert.equal(room.game.phase, "roll");
});

test("passing an available property advances the turn", () => {
  const room = table(); startTurfGame(room);
  room.game.turn = 0; room.game.phase = "buy-or-pass"; room.game.pendingProperty = 3;
  passProperty(room, 1);
  assert.equal(room.game.owners[3], undefined);
  assert.equal(room.game.turn, 1);
});

test("only the current family can roll", () => {
  const room = table(); startTurfGame(room); room.game.turn = 0;
  assert.throws(() => rollDice(room, 2), /Wait for your turn/);
});
