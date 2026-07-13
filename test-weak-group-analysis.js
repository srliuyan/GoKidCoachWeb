const assert = require("assert");
const ruleEngine = require("./rule-engine.js");
const audit = require("./evaluation/run-v15-middlegame-audit.js");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function emptyBoard() {
  return Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
}

function set(board, x, y, color) {
  board[y][x] = color;
}

function groupAt(board, x, y) {
  return ruleEngine.groupAt(board, { x, y });
}

function evidence(board, x, y, color = BLACK) {
  return ruleEngine.groupSafetyEvidence(board, groupAt(board, x, y), color);
}

function testLargeCriticalOwnGroupDetected() {
  const board = emptyBoard();
  set(board, 5, 5, BLACK);
  set(board, 5, 6, BLACK);
  set(board, 6, 5, BLACK);
  set(board, 4, 5, WHITE);
  set(board, 5, 4, WHITE);
  set(board, 6, 4, WHITE);
  set(board, 4, 6, WHITE);
  set(board, 6, 6, WHITE);
  const item = evidence(board, 5, 5);
  assert(["critical", "weak"].includes(item.classification));
  assert(item.tacticalCaptureRisk > 0);
}

function testStableGroupNotWeak() {
  const board = emptyBoard();
  set(board, 3, 3, BLACK);
  set(board, 3, 4, BLACK);
  set(board, 4, 3, BLACK);
  set(board, 4, 4, BLACK);
  const item = evidence(board, 3, 3);
  assert.strictEqual(item.classification, "stable");
}

function testDisposableSmallGroupIdentified() {
  const board = emptyBoard();
  set(board, 0, 0, BLACK);
  set(board, 1, 0, WHITE);
  const item = evidence(board, 0, 0);
  assert.strictEqual(item.classification, "disposable_small_group");
}

function testFalseEyeGroupNotStable() {
  const board = emptyBoard();
  set(board, 8, 8, BLACK);
  set(board, 8, 9, BLACK);
  set(board, 7, 8, WHITE);
  set(board, 9, 8, WHITE);
  set(board, 8, 7, WHITE);
  const item = evidence(board, 8, 8);
  assert.notStrictEqual(item.classification, "stable");
  assert(item.falseEyeRisk >= item.eyePotential);
}

function testLowQualityLibertiesReduceSafety() {
  const board = emptyBoard();
  set(board, 10, 10, BLACK);
  set(board, 9, 10, WHITE);
  set(board, 11, 10, WHITE);
  const item = evidence(board, 10, 10);
  assert.strictEqual(item.classification, "weak");
  assert(item.nearbyOpponentPressure > item.nearbyFriendlySupport);
}

function testNearbySupportImprovesSafety() {
  const board = emptyBoard();
  set(board, 10, 10, BLACK);
  set(board, 10, 11, BLACK);
  set(board, 11, 10, BLACK);
  const item = evidence(board, 10, 10);
  assert(item.nearbyFriendlySupport > item.nearbyOpponentPressure);
  assert(["stable", "unsettled"].includes(item.classification));
}

function testSurroundingEnemyStrengthIncreasesRisk() {
  const board = emptyBoard();
  set(board, 10, 10, BLACK);
  set(board, 9, 10, WHITE);
  set(board, 11, 10, WHITE);
  set(board, 10, 9, WHITE);
  const item = evidence(board, 10, 10);
  assert(item.surroundingEnemyStrength > 0);
  assert(item.tacticalCaptureRisk > 0);
}

function testLargeGroupNotSacrificedForTinyGain() {
  const report = audit.candidateCoverageReport();
  const weakCase = report.positions.find(item => item.positionId === "m40_weak_group");
  assert(weakCase);
  assert.strictEqual(weakCase.weakGroupCandidatePresent, true);
  assert(/critical|weak|escape|connection/.test(weakCase.selectedCandidateSource));
}

function run() {
  testLargeCriticalOwnGroupDetected();
  testStableGroupNotWeak();
  testDisposableSmallGroupIdentified();
  testFalseEyeGroupNotStable();
  testLowQualityLibertiesReduceSafety();
  testNearbySupportImprovesSafety();
  testSurroundingEnemyStrengthIncreasesRisk();
  testLargeGroupNotSacrificedForTinyGain();
  console.log("test-weak-group-analysis: ok");
}

run();
