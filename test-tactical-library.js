const assert = require("assert");
const tactical = require("./tactical-library.js");
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
  tactical.resetForTests({
    version: 1,
    patterns: [
      { category: "capture", frequency: 1000, successFrequency: 0.92, averageMoveNumber: 48, confidence: 0.93, urgency: 0.95, tacticalCategory: "capture", recommendedContinuation: "capture_now" },
      { category: "atari", frequency: 1200, successFrequency: 0.8, averageMoveNumber: 44, confidence: 0.88, urgency: 0.84, tacticalCategory: "atari", recommendedContinuation: "keep_pressure" },
      { category: "doubleAtari", frequency: 320, successFrequency: 0.9, averageMoveNumber: 50, confidence: 0.9, urgency: 0.96, tacticalCategory: "doubleAtari", recommendedContinuation: "force_capture_race" },
      { category: "connection", frequency: 900, successFrequency: 0.78, averageMoveNumber: 52, confidence: 0.85, urgency: 0.72, tacticalCategory: "connection", recommendedContinuation: "connect_groups" },
      { category: "cut", frequency: 850, successFrequency: 0.76, averageMoveNumber: 55, confidence: 0.84, urgency: 0.82, tacticalCategory: "cut", recommendedContinuation: "split_opponent" },
      { category: "falseEye", frequency: 160, successFrequency: 0.65, averageMoveNumber: 90, confidence: 0.77, urgency: 0.67, tacticalCategory: "falseEye", recommendedContinuation: "punish_false_eye" }
    ]
  });
}

function testAtari() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = tactical.detectTacticalPattern({ x: 1, y: 2 }, board, black, { moveNumber: 30 });
  assert(result.patterns.some(item => item.category === "capture" || item.category === "atari"));
}

function testDoubleAtari() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 2, y: 1 }, white);
  setStone(board, { x: 1, y: 2 }, white);
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 2, y: 0 }, black);
  setStone(board, { x: 3, y: 1 }, black);
  setStone(board, { x: 0, y: 2 }, black);
  setStone(board, { x: 1, y: 3 }, black);
  const result = tactical.detectTacticalPattern({ x: 2, y: 2 }, board, black, { moveNumber: 36 });
  assert(result.patterns.some(item => item.category === "doubleAtari"));
}

function testConnection() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  const result = tactical.detectTacticalPattern({ x: 4, y: 3 }, board, black, { moveNumber: 40 });
  assert(result.patterns.some(item => item.category === "connection"));
}

function testCut() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, white);
  setStone(board, { x: 5, y: 3 }, white);
  const result = tactical.detectTacticalPattern({ x: 4, y: 3 }, board, black, { moveNumber: 42 });
  assert(result.patterns.some(item => item.category === "cut"));
}

function testFalseEye() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 1, y: 2 }, black);
  setStone(board, { x: 0, y: 0 }, white);
  setStone(board, { x: 2, y: 0 }, white);
  const result = tactical.detectTacticalPattern({ x: 1, y: 1 }, black ? board : board, black, { moveNumber: 88 });
  assert(result.patterns.some(item => item.category === "falseEye" || item.category === "eyeShape"));
}

function testFallback() {
  tactical.resetForTests(null);
  const board = emptyBoard();
  const result = tactical.scoreTacticalMove({ x: 3, y: 3 }, board, black, { moveNumber: 20 });
  assert.strictEqual(result.tacticalScore, 0);
  assert.strictEqual(result.confidence, 0);
}

function testRejectedMoveNeverReEnters() {
  installDb();
  const settings = difficulty.getDifficultySettings({ scores: {} }, [false, false, false]);
  const candidates = [
    { point: { x: 3, y: 3 }, legal: true, ruleLegal: true, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 9, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: 10, moveNumber: 20, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 19 },
    { point: { x: 10, y: 10 }, legal: true, ruleLegal: false, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 50, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: -99999, moveNumber: 20, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 60 }
  ];
  const adjusted = difficulty.adjustMoveCandidates(candidates, settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 3 });
}

function run() {
  testAtari();
  testDoubleAtari();
  testConnection();
  testCut();
  testFalseEye();
  testFallback();
  testRejectedMoveNeverReEnters();
  console.log("test-tactical-library: ok");
}

run();
