const assert = require("assert");
const pattern = require("./policy-pattern.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function installDb(entries) {
  pattern.resetForTests({
    version: 1,
    boardSize: 19,
    patterns: entries
  });
}

function testExtract3x3Pattern() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 2 }, black);
  setStone(board, { x: 2, y: 3 }, white);
  const extracted = pattern.extractLocalPattern(board, { x: 3, y: 3 }, black, { moveNumber: 8 });
  assert.strictEqual(extracted.legal, true);
  assert.strictEqual(extracted.pattern3.length, 9);
}

function testExtract5x5Pattern() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 2 }, black);
  setStone(board, { x: 2, y: 3 }, white);
  setStone(board, { x: 4, y: 3 }, black);
  const extracted = pattern.extractLocalPattern(board, { x: 3, y: 3 }, black, { moveNumber: 24 });
  assert.strictEqual(extracted.legal, true);
  assert.strictEqual(extracted.pattern5.length, 25);
}

function testLookupPatternDb() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 2 }, black);
  const extracted = pattern.extractLocalPattern(board, { x: 3, y: 3 }, black, { moveNumber: 12 });
  installDb([{ k: extracted.key, c: 30, s: 30, t: 12.2, w: 0.62, f: 0.84, q: 18.5 }]);
  const lookedUp = pattern.lookupPatternScore(board, { x: 3, y: 3 }, black, { moveNumber: 12 });
  assert.strictEqual(lookedUp.patternScore, 18.5);
  assert.strictEqual(lookedUp.confidence, 0.84);
}

function testHighFrequencyPatternGetsBonus() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 2 }, black);
  const extracted = pattern.extractLocalPattern(board, { x: 3, y: 3 }, black, { moveNumber: 10 });
  installDb([{ k: extracted.key, c: 120, s: 120, t: 10.5, w: 0.66, f: 0.92, q: 26.4 }]);
  const candidates = pattern.applyPatternScores([
    { point: { x: 3, y: 3 }, combinedScore: 100, moveNumber: 10 }
  ], board, black, { moveNumber: 10 });
  assert(candidates[0].patternScore > 0);
  assert(candidates[0].combinedScore > 100);
}

function testLowConfidencePatternStaysSmall() {
  const board = emptyBoard();
  setStone(board, { x: 10, y: 10 }, black);
  const extracted = pattern.extractLocalPattern(board, { x: 10, y: 11 }, black, { moveNumber: 92 });
  installDb([{ k: extracted.key, c: 4, s: 4, t: 92.1, w: 0.5, f: 0.12, q: 1.8 }]);
  const lookedUp = pattern.lookupPatternScore(board, { x: 10, y: 11 }, black, { moveNumber: 92 });
  assert(lookedUp.patternScore < 5);
  assert(lookedUp.confidence < 0.2);
}

function testMissingDbFallsBackCleanly() {
  pattern.resetForTests(null);
  const board = emptyBoard();
  const lookedUp = pattern.lookupPatternScore(board, { x: 3, y: 3 }, black, { moveNumber: 0 });
  assert.strictEqual(lookedUp.patternScore, 0);
  assert.strictEqual(lookedUp.confidence, 0);
}

function run() {
  testExtract3x3Pattern();
  testExtract5x5Pattern();
  testLookupPatternDb();
  testHighFrequencyPatternGetsBonus();
  testLowConfidencePatternStaysSmall();
  testMissingDbFallsBackCleanly();
  console.log("test-policy-pattern: ok");
}

run();
