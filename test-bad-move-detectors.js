const assert = require("assert");
const detectors = require("./evaluation/bad-move-detectors.js");
const ruleEngine = require("./rule-engine.js");

const BLACK = 1;
const WHITE = 2;

function emptyBoard() {
  return Array.from({ length: 19 }, () => Array(19).fill(0));
}

function set(board, x, y, color) {
  board[y][x] = color;
}

function position(board, sideToMove = BLACK, moveNumber = 100) {
  return { board, sideToMove, color: sideToMove, moveNumber, phase: "test" };
}

function selection(selectedMove, candidates = []) {
  return { selectedMove, candidates: candidates.map(point => ({ point, source: "test", sourceTags: ["test"] })) };
}

function detectionReasons(board, selectedMove, candidates = [], sideToMove = BLACK) {
  return detectors.detectBadMoves(position(board, sideToMove), selection(selectedMove, candidates)).map(item => item.reason);
}

function testSelfAtariDetected() {
  const board = emptyBoard();
  set(board, 5, 4, WHITE); set(board, 4, 5, WHITE); set(board, 6, 5, WHITE);
  const reasons = detectionReasons(board, { x: 5, y: 5 }, [{ x: 10, y: 10 }]);
  assert(reasons.includes("uncompensated self-atari"));
}

function testCompensatedSacrificeNotFalsePositive() {
  const board = emptyBoard();
  set(board, 5, 4, WHITE); set(board, 4, 5, WHITE); set(board, 6, 5, WHITE); set(board, 5, 6, WHITE);
  set(board, 4, 4, BLACK); set(board, 6, 4, BLACK); set(board, 4, 6, BLACK);
  const reasons = detectionReasons(board, { x: 5, y: 5 }, [{ x: 10, y: 10 }]);
  assert(!reasons.includes("uncompensated self-atari"));
}

function testOwnTerritoryFillDetected() {
  const board = emptyBoard();
  set(board, 4, 5, BLACK); set(board, 6, 5, BLACK); set(board, 5, 4, BLACK); set(board, 5, 6, BLACK);
  set(board, 15, 15, WHITE);
  const reasons = detectionReasons(board, { x: 5, y: 5 }, [{ x: 15, y: 14 }]);
  assert(reasons.includes("own-territory fill"));
}

function testMeaningfulFirstLineYoseNotRejected() {
  const board = emptyBoard();
  set(board, 4, 1, WHITE); set(board, 3, 1, BLACK); set(board, 5, 1, BLACK); set(board, 4, 2, BLACK);
  const reasons = detectionReasons(board, { x: 4, y: 0 }, [{ x: 10, y: 10 }]);
  assert(!reasons.includes("meaningless first-line move"));
}

function testMeaninglessFirstLineDetected() {
  const board = emptyBoard();
  set(board, 10, 2, BLACK); set(board, 15, 15, WHITE);
  const reasons = detectionReasons(board, { x: 10, y: 0 }, [{ x: 10, y: 10 }]);
  assert(reasons.includes("meaningless first-line move"));
}

function testStableGroupRedundantDefenseDetected() {
  const board = emptyBoard();
  set(board, 3, 3, BLACK); set(board, 3, 4, BLACK); set(board, 4, 3, BLACK); set(board, 4, 4, BLACK);
  set(board, 15, 15, WHITE);
  const reasons = detectionReasons(board, { x: 5, y: 4 }, [{ x: 15, y: 14 }]);
  assert(reasons.includes("stable group repeatedly reinforced"));
}

function testCriticalGroupDefenseNotRedundant() {
  const board = emptyBoard();
  set(board, 8, 8, BLACK); set(board, 7, 8, WHITE); set(board, 8, 7, WHITE); set(board, 9, 8, WHITE);
  const reasons = detectionReasons(board, { x: 8, y: 9 }, [{ x: 10, y: 10 }]);
  assert(!reasons.includes("stable group repeatedly reinforced"));
}

function testSmallLocalOverGlobalDetected() {
  const board = emptyBoard();
  set(board, 5, 5, BLACK); set(board, 15, 15, WHITE);
  const candidates = [{ x: 9, y: 9 }, { x: 5, y: 6 }];
  const sel = {
    selectedMove: { x: 5, y: 6 },
    candidates: [
      { point: { x: 9, y: 9 }, source: "large_whole_board_move", sourceTags: ["large_whole_board_move"] },
      { point: { x: 5, y: 6 }, source: "small_local", sourceTags: ["small_local"] }
    ]
  };
  const reasons = detectors.detectBadMoves(position(board), sel).map(item => item.reason);
  assert(reasons.includes("small local move over larger global move"));
  void candidates;
}

function testUrgentLocalOverridesGlobal() {
  const board = emptyBoard();
  set(board, 4, 4, WHITE); set(board, 3, 4, BLACK); set(board, 4, 3, BLACK); set(board, 5, 4, BLACK);
  const reasons = detectionReasons(board, { x: 4, y: 5 }, [{ x: 9, y: 9 }]);
  assert(!reasons.includes("small local move over larger global move"));
}

function testUnsupportedInvasionDetected() {
  const board = emptyBoard();
  set(board, 9, 9, WHITE); set(board, 9, 10, WHITE); set(board, 10, 9, WHITE); set(board, 3, 3, BLACK);
  const reasons = detectionReasons(board, { x: 10, y: 10 }, [{ x: 3, y: 4 }]);
  assert(reasons.includes("unsupported invasion or reduction"));
}

function testSupportedInvasionNotFalsePositive() {
  const board = emptyBoard();
  set(board, 9, 9, WHITE); set(board, 9, 10, WHITE); set(board, 10, 9, WHITE); set(board, 10, 11, BLACK);
  const reasons = detectionReasons(board, { x: 10, y: 10 }, [{ x: 3, y: 4 }]);
  assert(!reasons.includes("unsupported invasion or reduction"));
}

function testFallbackErrorShape() {
  const detection = detectors.detectBadMoves(position(emptyBoard()), { selectedMove: { x: 0, y: 0 }, candidates: [{ point: { x: 10, y: 10 }, source: "large_whole_board_move", sourceTags: ["large_whole_board_move"] }] });
  assert(Array.isArray(detection));
}

function run() {
  testSelfAtariDetected();
  testCompensatedSacrificeNotFalsePositive();
  testOwnTerritoryFillDetected();
  testMeaningfulFirstLineYoseNotRejected();
  testMeaninglessFirstLineDetected();
  testStableGroupRedundantDefenseDetected();
  testCriticalGroupDefenseNotRedundant();
  testSmallLocalOverGlobalDetected();
  testUrgentLocalOverridesGlobal();
  testUnsupportedInvasionDetected();
  testSupportedInvasionNotFalsePositive();
  testFallbackErrorShape();
  assert(ruleEngine.simulateMove(emptyBoard(), { x: 3, y: 3 }, BLACK, []).legal);
  console.log("test-bad-move-detectors: ok");
}

run();
