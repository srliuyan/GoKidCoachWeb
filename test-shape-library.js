const assert = require("assert");
const shapes = require("./shape-library.js");
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

function installLibrary(entries) {
  shapes.resetForTests({
    version: 1,
    shapes: entries
  });
}

function defaultEntries() {
  return [
    { shapeType: "tigerMouth", frequency: 100, averageMoveOrder: 20, regionBias: { edge: 0.5, corner: 0.3, center: 0.2 }, tacticalValue: 4, connectionValue: 5, territoryValue: 2, influenceValue: 1, riskPenalty: 0.5, confidence: 0.85 },
    { shapeType: "bambooJoint", frequency: 90, averageMoveOrder: 30, regionBias: { edge: 0.5, corner: 0.3, center: 0.2 }, tacticalValue: 3, connectionValue: 8, territoryValue: 2, influenceValue: 1, riskPenalty: 0, confidence: 0.88 },
    { shapeType: "onePointJump", frequency: 95, averageMoveOrder: 25, regionBias: { edge: 0.45, corner: 0.25, center: 0.3 }, tacticalValue: 2, connectionValue: 4, territoryValue: 2, influenceValue: 2, riskPenalty: 1, confidence: 0.82 },
    { shapeType: "knightMove", frequency: 80, averageMoveOrder: 28, regionBias: { edge: 0.4, corner: 0.2, center: 0.4 }, tacticalValue: 2, connectionValue: 3, territoryValue: 2, influenceValue: 3, riskPenalty: 1.5, confidence: 0.8 },
    { shapeType: "solidConnection", frequency: 120, averageMoveOrder: 35, regionBias: { edge: 0.45, corner: 0.25, center: 0.3 }, tacticalValue: 2, connectionValue: 7, territoryValue: 1, influenceValue: 1, riskPenalty: 0, confidence: 0.9 },
    { shapeType: "emptyTriangle", frequency: 40, averageMoveOrder: 18, regionBias: { edge: 0.4, corner: 0.3, center: 0.3 }, tacticalValue: 1, connectionValue: 1, territoryValue: 0, influenceValue: 0, riskPenalty: 7, confidence: 0.78 }
  ];
}

function testTigerMouth() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 2, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, black);
  const detected = shapes.detectShape({ x: 3, y: 3 }, board, black, { moveNumber: 12 });
  assert(detected.shapes.some(item => item.shapeType === "tigerMouth"));
}

function testBambooJoint() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 5, y: 4 }, black);
  const detected = shapes.detectShape({ x: 3, y: 3 }, board, black, { moveNumber: 16 });
  assert(detected.shapes.some(item => item.shapeType === "bambooJoint"));
}

function testOnePointJump() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 5, y: 3 }, black);
  const detected = shapes.detectShape({ x: 3, y: 3 }, board, black, { moveNumber: 10 });
  assert(detected.shapes.some(item => item.shapeType === "onePointJump"));
}

function testKnightMove() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 5, y: 4 }, black);
  const detected = shapes.detectShape({ x: 3, y: 3 }, board, black, { moveNumber: 14 });
  assert(detected.shapes.some(item => item.shapeType === "knightMove"));
}

function testSolidConnection() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 2, y: 3 }, black);
  setStone(board, { x: 4, y: 3 }, black);
  const detected = shapes.detectShape({ x: 3, y: 3 }, board, black, { moveNumber: 40 });
  assert(detected.shapes.some(item => item.shapeType === "solidConnection"));
}

function testEmptyTrianglePenalty() {
  installLibrary(defaultEntries());
  const board = emptyBoard();
  setStone(board, { x: 2, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, black);
  setStone(board, { x: 2, y: 2 }, black);
  const scored = shapes.scoreShape({ x: 3, y: 3 }, board, black, { moveNumber: 8 });
  assert(scored.detectedShapes.some(item => item.shapeType === "emptyTriangle"));
  assert(scored.shapeScore < 0);
}

function testMissingLibraryFallback() {
  shapes.resetForTests(null);
  const board = emptyBoard();
  const scored = shapes.scoreShape({ x: 3, y: 3 }, board, black, { moveNumber: 0 });
  assert.strictEqual(scored.shapeScore, 0);
  assert.strictEqual(scored.confidence, 0);
}

function testRejectedMoveNeverReEnters() {
  installLibrary(defaultEntries());
  const settings = difficulty.getDifficultySettings({ scores: {} }, [false, false, false]);
  const candidates = [
    { point: { x: 3, y: 3 }, legal: true, ruleLegal: true, policyScore: 10, patternScore: 0, shapeScore: 8, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: 10, moveNumber: 20, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 18 },
    { point: { x: 10, y: 10 }, legal: true, ruleLegal: false, policyScore: 10, patternScore: 0, shapeScore: 50, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: -99999, moveNumber: 20, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 60 }
  ];
  const adjusted = difficulty.adjustMoveCandidates(candidates, settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 3 });
}

function run() {
  testTigerMouth();
  testBambooJoint();
  testOnePointJump();
  testKnightMove();
  testSolidConnection();
  testEmptyTrianglePenalty();
  testMissingLibraryFallback();
  testRejectedMoveNeverReEnters();
  console.log("test-shape-library: ok");
}

run();
