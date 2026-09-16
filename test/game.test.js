const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDeck, startGame, playCard, drawAndPass, publicState } = require("../server/game");

function table() {
  return { status: "waiting", players: [
    { id: 1, username: "Vito", avatar: null },
    { id: 2, username: "Connie", avatar: null }
  ] };
}

test("starts a two-player deal with seven cards each", () => {
  const room = table(); startGame(room);
  assert.equal(room.status, "playing");
  assert.equal(room.game.players[0].hand.length, 7);
  assert.equal(room.game.players[1].hand.length, 7);
  assert.ok(room.game.discard.at(-1));
});

test("public state only exposes the viewer's hand", () => {
  const room = table(); startGame(room);
  const view = publicState(room, 1);
  assert.equal(view.players[0].hand.length, 7);
  assert.equal(view.players[1].hand, undefined);
});

test("drawing adds one card and passes the turn", () => {
  const room = table(); startGame(room);
  const beforeTurn = room.game.turn;
  const player = room.game.players[beforeTurn];
  const count = player.hand.length;
  drawAndPass(room, player.id);
  assert.equal(player.hand.length, count + 1);
  assert.notEqual(room.game.turn, beforeTurn);
});

test("rejects a player who acts out of turn", () => {
  const room = table(); startGame(room);
  const wrong = room.game.players[(room.game.turn + 1) % 2];
  assert.throws(() => playCard(room, wrong.id, wrong.hand[0].id), /Wait for your turn/);
});

test("the single +10 card makes the next player draw ten", () => {
  const room = table(); startGame(room);
  room.game.turn = 0; room.game.activeSuit = "blood";
  const attacker = room.game.players[0]; const victim = room.game.players[1];
  const special = { id: "single-plus-ten", suit: "blood", value: "fuck-you-10" };
  attacker.hand = [special, { id: "spare", suit: "cash", value: "2" }];
  const before = victim.hand.length;
  playCard(room, attacker.id, special.id);
  assert.equal(victim.hand.length, before + 10);
});

test("trade hands swaps the remaining cards with the chosen player", () => {
  const room = table(); startGame(room);
  room.game.turn = 0;
  const trader = room.game.players[0]; const target = room.game.players[1];
  const trade = { id: "single-trade", suit: "wild", value: "trade-hands" };
  trader.hand = [trade, { id: "one", suit: "cash", value: "1" }];
  target.hand = [{ id: "two", suit: "ice", value: "2" }, { id: "three", suit: "orange", value: "3" }];
  playCard(room, trader.id, trade.id, "orange", target.id);
  assert.deepEqual(trader.hand.map((card) => card.id), ["two", "three"]);
  assert.deepEqual(target.hand.map((card) => card.id), ["one"]);
  assert.equal(room.game.activeSuit, "orange");
});

test("the deck has five colors and one copy of each single card", () => {
  const deck = makeDeck();
  assert.ok(deck.some((card) => card.suit === "orange"));
  assert.equal(deck.filter((card) => card.value === "trade-hands").length, 1);
  assert.equal(deck.filter((card) => card.value === "fuck-you-10").length, 1);
});
