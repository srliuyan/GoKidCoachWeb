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
  const secure = board();
  set(secure, 2, 2, black); set(secure, 2, 3, black); set(secure, 3, 2, black); set(secure, 4, 3, black); set(secure, 3, 4, black);
  assert.strictEqual(endgame.classifyEndgameMove(secure, black, { x: 3, y: 3 }).class, "own_territory_fill");

  const boundary = board();
  set(boundary, 5, 1, black); set(boundary, 5, 2, black); set(boundary, 6, 1, white); set(boundary, 6, 2, white);
  assert.notStrictEqual(endgame.classifyEndgameMove(boundary, black, { x: 5, y: 0 }).class, "meaningless_first_line");

  const firstLine = board();
  set(firstLine, 10, 1, black); set(firstLine, 14, 14, white);
  assert.strictEqual(endgame.classifyEndgameMove(firstLine, black, { x: 10, y: 0 }).class, "meaningless_first_line");

  const secondLine = board();
  set(secondLine, 9, 2, black); set(secondLine, 15, 15, white);
  assert.strictEqual(endgame.classifyEndgameMove(secondLine, black, { x: 9, y: 1 }).class, "low_value_second_line");

  const yose = board();
  set(yose, 10, 10, black); set(yose, 10, 11, black); set(yose, 11, 10, white); set(yose, 11, 11, white); set(yose, 12, 10, white);
  const large = endgame.classifyEndgameMove(yose, black, { x: 11, y: 9 });
  const dame = endgame.classifyEndgameMove(yose, black, { x: 0, y: 10 });
  assert(large.estimate.value > dame.estimate.value);
  assert.notStrictEqual(large.class, "dame");
  assert(large.estimate.followUpSize <= 3);

  const koLike = board();
  set(koLike, 1, 1, white); set(koLike, 0, 1, black); set(koLike, 1, 0, black); set(koLike, 2, 1, black);
  set(koLike, 0, 2, white); set(koLike, 2, 2, white); set(koLike, 1, 3, white);
  assert.strictEqual(endgame.classifyEndgameMove(koLike, black, { x: 1, y: 2 }).class, "uncertain");

  const optionalReply = board();
  set(optionalReply, 3, 3, black); set(optionalReply, 4, 4, white);
  const optional = endgame.classifyEndgameMove(optionalReply, black, { x: 10, y: 10, sourceTags: ["endgame"] });
  assert.strictEqual(optional.sente.replyNecessary, false);
  assert.notStrictEqual(optional.sente.class, "verified_sente");

  console.log("test-endgame-value-classification: ok");
}

run();
