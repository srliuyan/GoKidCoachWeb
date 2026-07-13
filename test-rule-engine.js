const assert = require("assert");
const engine = require("./rule-engine.js");

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(engine.empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function evaluate(board, point, color, moveHistory = [], positionHashes = []) {
  return engine.evaluateMove({
    board,
    point,
    color,
    moveHistory,
    positionHashes
  });
}

function testImmediateCapture() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, engine.black);
  setStone(board, { x: 0, y: 1 }, engine.white);
  setStone(board, { x: 1, y: 0 }, engine.white);
  setStone(board, { x: 2, y: 1 }, engine.white);
  const capture = evaluate(board, { x: 1, y: 2 }, engine.white);
  const elsewhere = evaluate(board, { x: 5, y: 5 }, engine.white);
  assert(capture.legal);
  assert(capture.ruleScore >= 1000);
  assert(elsewhere.ruleScore < -1000);
}

function testAtariEscape() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, engine.white);
  setStone(board, { x: 1, y: 0 }, engine.black);
  setStone(board, { x: 0, y: 1 }, engine.black);
  setStone(board, { x: 2, y: 1 }, engine.black);
  const defend = evaluate(board, { x: 1, y: 2 }, engine.white);
  const elsewhere = evaluate(board, { x: 5, y: 5 }, engine.white);
  assert(defend.legal);
  assert(defend.reasons.includes("save_group"));
  assert(defend.ruleScore > elsewhere.ruleScore);
  assert(elsewhere.ruleScore < -1000);
}

function testConnection() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, engine.white);
  setStone(board, { x: 5, y: 3 }, engine.white);
  const connect = evaluate(board, { x: 4, y: 3 }, engine.white);
  assert(connect.legal);
  assert(connect.reasons.includes("connect"));
}

function testSuicideForbidden() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, engine.black);
  setStone(board, { x: 0, y: 1 }, engine.black);
  setStone(board, { x: 2, y: 1 }, engine.black);
  setStone(board, { x: 1, y: 2 }, engine.black);
  const suicide = evaluate(board, { x: 1, y: 1 }, engine.white);
  assert.strictEqual(suicide.legal, false);
  assert(suicide.ruleScore <= -99999);
}

function testObviousGiveaway() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, engine.white);
  setStone(board, { x: 1, y: 0 }, engine.black);
  setStone(board, { x: 0, y: 1 }, engine.black);
  setStone(board, { x: 2, y: 1 }, engine.black);
  setStone(board, { x: 3, y: 2 }, engine.black);
  const bad = evaluate(board, { x: 2, y: 2 }, engine.white);
  assert(bad.legal);
  assert(bad.reasons.includes("obvious_giveaway") || bad.ruleScore <= -1000);
}

function testOpeningNoWeirdFirstLine() {
  const board = emptyBoard();
  const lineOne = evaluate(board, { x: 0, y: 5 }, engine.white, []);
  const star = evaluate(board, { x: 3, y: 3 }, engine.white, []);
  assert(lineOne.legal);
  assert(star.legal);
  assert(lineOne.ruleScore < star.ruleScore);
}

function run() {
  testImmediateCapture();
  testAtariEscape();
  testConnection();
  testSuicideForbidden();
  testObviousGiveaway();
  testOpeningNoWeirdFirstLine();
  console.log("test-rule-engine: ok");
}

run();
