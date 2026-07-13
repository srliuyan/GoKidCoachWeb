const assert = require("assert");
const joseki = require("./joseki-library.js");
const difficulty = require("./difficulty-controller.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function installDb() {
  joseki.resetForTests({
    version: 1,
    entries: [
      {
        k: "star|0000000000000000000000002000000000000000000000000|B3,3",
        f: 40,
        m: 8.2,
        c: 0.86,
        r: 0.4,
        w: 0.61,
        g: "corner",
        n: [{ k: "W5,3", c: 18 }, { k: "W3,5", c: 12 }]
      }
    ]
  });
}

function sampleBoard() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  return board;
}

function testDatabaseLoads() {
  installDb();
  assert(joseki.state.map instanceof Map);
  assert(joseki.state.map.size >= 1);
}

function testCornerPatternNormalizes() {
  installDb();
  const board = sampleBoard();
  const normalized = joseki.normalizeCornerPattern(board, { x: 5, y: 3 }, white, {
    moveHistory: [{ x: 3, y: 3, color: black, pass: false }]
  });
  assert.strictEqual(normalized.anchor, "star");
}

function testSymmetricCornersMatch() {
  installDb();
  const boardA = emptyBoard();
  setStone(boardA, { x: 3, y: 3 }, black);
  const a = joseki.normalizeCornerPattern(boardA, { x: 5, y: 3 }, white, {
    moveHistory: [{ x: 3, y: 3, color: black, pass: false }]
  });

  const boardB = emptyBoard();
  setStone(boardB, { x: 15, y: 3 }, black);
  const b = joseki.normalizeCornerPattern(boardB, { x: 13, y: 3 }, white, {
    moveHistory: [{ x: 15, y: 3, color: black, pass: false }]
  });
  assert.strictEqual(a.anchor, b.anchor);
}

function testCommonJosekiGetsPositiveScore() {
  installDb();
  const board = sampleBoard();
  const scored = joseki.scoreJosekiMove({ x: 5, y: 3 }, board, white, {
    moveNumber: 6,
    moveHistory: [{ x: 3, y: 3, color: black, pass: false }]
  });
  assert(scored.josekiScore > 0);
  assert(scored.confidence > 0);
}

function testLowConfidenceDoesNotOverrideSafety() {
  joseki.resetForTests({
    version: 1,
    entries: [{ k: "star|0000000000000000000000002000000000000000000000000|B3,3", f: 12, m: 9, c: 0.18, r: 1.2, w: 0.5, g: "corner", n: [{ k: "W5,3", c: 2 }] }]
  });
  const board = sampleBoard();
  const scored = joseki.scoreJosekiMove({ x: 5, y: 3 }, board, white, {
    moveNumber: 6,
    moveHistory: [{ x: 3, y: 3, color: black, pass: false }]
  });
  assert(scored.josekiScore < 20);
}

function testRejectedNeverReturns() {
  installDb();
  const settings = difficulty.getDifficultySettings({ scores: {} }, [false, false, false]);
  const candidates = [
    { point: { x: 5, y: 3 }, legal: true, ruleLegal: true, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 0, josekiScore: 8, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: 10, moveNumber: 8, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 18 },
    { point: { x: 10, y: 10 }, legal: true, ruleLegal: false, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 0, josekiScore: 60, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: -99999, moveNumber: 8, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 70 }
  ];
  const adjusted = difficulty.adjustMoveCandidates(candidates, settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 5, y: 3 });
}

function testMissingFallback() {
  joseki.resetForTests(null);
  const board = sampleBoard();
  const scored = joseki.scoreJosekiMove({ x: 5, y: 3 }, board, white, {
    moveNumber: 6,
    moveHistory: [{ x: 3, y: 3, color: black, pass: false }]
  });
  assert.strictEqual(scored.josekiScore, 0);
  assert.strictEqual(scored.confidence, 0);
}

function run() {
  testDatabaseLoads();
  testCornerPatternNormalizes();
  testSymmetricCornersMatch();
  testCommonJosekiGetsPositiveScore();
  testLowConfidenceDoesNotOverrideSafety();
  testRejectedNeverReturns();
  testMissingFallback();
  console.log("test-joseki-library: ok");
}

run();
