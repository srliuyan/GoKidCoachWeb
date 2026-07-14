const assert = require("assert");
const endgame = require("./evaluation/endgame-value-detectors.js");

const empty = 0;
const black = 1;
const white = 2;

function board() {
  return Array.from({ length: 19 }, () => Array(19).fill(empty));
}

function set(b, x, y, color) {
  b[y][x] = color;
}

function run() {
  const sente = board();
  set(sente, 5, 5, black); set(sente, 4, 4, black); set(sente, 6, 4, white); set(sente, 5, 3, white);
  const senteClass = endgame.classifySenteGote(sente, black, { x: 5, y: 4 });
  assert(["verified_sente", "likely_sente", "reverse_sente"].includes(senteClass.class));
  assert.notStrictEqual(senteClass.class, "gote");

  const gote = board();
  set(gote, 3, 3, black); set(gote, 15, 15, white);
  const goteClass = endgame.classifySenteGote(gote, black, { x: 9, y: 9 });
  assert.strictEqual(goteClass.class, "gote");
  assert.strictEqual(goteClass.replyNecessary, false);

  const reverse = board();
  set(reverse, 5, 5, black); set(reverse, 4, 4, black); set(reverse, 6, 4, white);
  const reverseClass = endgame.classifySenteGote(reverse, black, { x: 5, y: 4 });
  assert.strictEqual(reverseClass.class, "reverse_sente");
  assert.strictEqual(reverseClass.reverseSente, true);

  const koLike = board();
  set(koLike, 1, 1, white); set(koLike, 0, 1, black); set(koLike, 1, 0, black); set(koLike, 2, 1, black);
  set(koLike, 0, 2, white); set(koLike, 2, 2, white); set(koLike, 1, 3, white);
  const koMove = endgame.classifyEndgameMove(koLike, black, { x: 1, y: 2 });
  assert.strictEqual(koMove.class, "uncertain");

  const optionalReply = board();
  set(optionalReply, 3, 3, black); set(optionalReply, 4, 4, white);
  const optionalClass = endgame.classifySenteGote(optionalReply, black, { x: 10, y: 10 });
  assert.strictEqual(optionalClass.opponentHasDirectLocalReply, true);
  assert.strictEqual(optionalClass.replyNecessary, false);
  assert.strictEqual(optionalClass.class, "gote");

  console.log("test-sente-gote: ok");
}

run();
