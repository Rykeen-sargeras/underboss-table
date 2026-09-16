const SUITS = ["blood", "cash", "gold", "ice", "orange"];
const SPECIALS = ["lay-low", "double-cross", "shakedown"];
const ACTION_VALUES = [...SPECIALS, "trade-hands", "fuck-you-10"];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    deck.push(card(suit, "0"));
    for (let n = 1; n <= 9; n++) {
      deck.push(card(suit, String(n)), card(suit, String(n)));
    }
    for (const value of SPECIALS) deck.push(card(suit, value), card(suit, value));
  }
  for (let i = 0; i < 4; i++) deck.push(card("wild", "the-don"), card("wild", "hit-job"));
  deck.push(card("wild", "trade-hands"));
  deck.push(card("blood", "fuck-you-10"));
  return shuffle(deck);
}

function card(suit, value) {
  return { id: `${suit}-${value}-${Math.random().toString(36).slice(2, 10)}`, suit, value };
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function nextIndex(game, steps = 1) {
  const count = game.players.length;
  return (game.turn + game.direction * steps + count * 10) % count;
}

function refill(game) {
  if (game.deck.length) return;
  const top = game.discard.pop();
  game.deck = shuffle(game.discard.splice(0));
  game.discard.push(top);
}

function draw(game, player, amount = 1) {
  for (let i = 0; i < amount; i++) {
    refill(game);
    if (game.deck.length) player.hand.push(game.deck.pop());
  }
}

function startGame(table) {
  const game = {
    deck: makeDeck(),
    discard: [],
    players: table.players.map((p) => ({ ...p, hand: [] })),
    turn: Math.floor(Math.random() * table.players.length),
    direction: 1,
    activeSuit: null,
    winner: null,
    message: "The deal is on."
  };
  for (const player of game.players) draw(game, player, 7);
  let opener;
  do {
    opener = game.deck.pop();
    if (opener.suit === "wild" || ACTION_VALUES.includes(opener.value)) game.deck.unshift(opener);
  } while (!opener || opener.suit === "wild" || ACTION_VALUES.includes(opener.value));
  game.discard.push(opener);
  game.activeSuit = opener.suit;
  table.game = game;
  table.status = "playing";
  return game;
}

function canPlay(game, candidate) {
  const top = game.discard.at(-1);
  return candidate.suit === "wild" || candidate.suit === game.activeSuit || candidate.value === top.value;
}

function playCard(table, userId, cardId, chosenSuit, targetId) {
  const game = table.game;
  if (!game || game.winner) throw new Error("This deal is already over.");
  const player = game.players[game.turn];
  if (player.id !== userId) throw new Error("Wait for your turn.");
  const index = player.hand.findIndex((c) => c.id === cardId);
  if (index < 0) throw new Error("That card is not in your hand.");
  const played = player.hand[index];
  if (!canPlay(game, played)) throw new Error("Match the family color or the rank.");
  if (played.suit === "wild" && !SUITS.includes(chosenSuit)) throw new Error("Choose a family color.");
  let tradeTarget;
  if (played.value === "trade-hands") {
    tradeTarget = game.players.find((candidate) => candidate.id === Number(targetId) && candidate.id !== userId);
    if (!tradeTarget) throw new Error("Choose a player to trade hands with.");
  }
  player.hand.splice(index, 1);
  game.discard.push(played);
  game.activeSuit = played.suit === "wild" ? chosenSuit : played.suit;
  game.message = `${player.username} played ${played.value.replaceAll("-", " ")}.`;

  if (played.value === "double-cross") {
    game.direction *= -1;
    if (game.players.length === 2) game.turn = nextIndex(game);
  }
  if (played.value === "lay-low") game.turn = nextIndex(game);
  if (["shakedown", "hit-job", "fuck-you-10"].includes(played.value)) {
    const victimIndex = nextIndex(game);
    const amount = played.value === "fuck-you-10" ? 10 : played.value === "hit-job" ? 4 : 2;
    draw(game, game.players[victimIndex], amount);
    game.message += ` ${game.players[victimIndex].username} picks up the tab.`;
    game.turn = victimIndex;
  }
  if (played.value === "trade-hands") {
    [player.hand, tradeTarget.hand] = [tradeTarget.hand, player.hand];
    game.message += ` ${player.username} traded hands with ${tradeTarget.username}.`;
  }
  const emptyPlayer = game.players.find((candidate) => candidate.hand.length === 0);
  if (emptyPlayer) {
    game.winner = emptyPlayer.id;
    game.message = `${emptyPlayer.username} takes the city.`;
    table.status = "finished";
    return { ended: true, winnerId: emptyPlayer.id };
  }
  game.turn = nextIndex(game);
  return { ended: false };
}

function drawAndPass(table, userId) {
  const game = table.game;
  if (!game || game.winner) throw new Error("This deal is already over.");
  const player = game.players[game.turn];
  if (player.id !== userId) throw new Error("Wait for your turn.");
  draw(game, player, 1);
  game.message = `${player.username} drew a card and passed.`;
  game.turn = nextIndex(game);
}

function publicState(table, viewerId) {
  const game = table.game;
  if (!game) return null;
  return {
    players: game.players.map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      cardCount: p.hand.length,
      hand: p.id === viewerId ? p.hand : undefined
    })),
    turnPlayerId: game.players[game.turn]?.id,
    direction: game.direction,
    activeSuit: game.activeSuit,
    topCard: game.discard.at(-1),
    deckCount: game.deck.length,
    winner: game.winner,
    message: game.message
  };
}

module.exports = { SUITS, makeDeck, startGame, playCard, drawAndPass, publicState };
