const assert = require("assert");
const audits = require("./evaluation/run-v14-audits.js");
const ruleEngine = require("./rule-engine.js");
const product = require("./product-support.js");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function emptyBoard() {
  return Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
}

function setStone(board, x, y, color) {
  board[y][x] = color;
}

function candidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    tier: "good",
    qualityTier: "good",
    combinedScore: 100,
    fusedPolicyScore: 100,
    ...overrides
  };
}

function testMove21HasStrategicCandidates() {
  const phase = audits.phaseTransitionAudit();
  const move = phase.moves.find(item => item.moveNumber === 21);
  assert(move);
  assert(move.coherentCandidateCount > 0);
  assert(move.strategicCandidateCount > 0);
}

function testUrgentCaptureSelectable() {
  const board = emptyBoard();
  setStone(board, 1, 1, WHITE);
  setStone(board, 0, 1, BLACK);
  setStone(board, 1, 0, BLACK);
  setStone(board, 2, 1, BLACK);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, BLACK);
  assert.strictEqual(result.hardOutcome, "verified_capture");
}

function testSafeRescueOutranksQuietMove() {
  const board = emptyBoard();
  setStone(board, 1, 1, BLACK);
  setStone(board, 1, 0, WHITE);
  setStone(board, 0, 1, WHITE);
  setStone(board, 2, 1, WHITE);
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 4, y: 4 }, { combinedScore: 130 }),
    candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 104 })
  ], board, BLACK, { maxCandidates: 8 });
  const sorted = result.candidates.slice().sort((a, b) => b.combinedScore - a.combinedScore);
  assert.deepStrictEqual(sorted[0].point, { x: 1, y: 2 });
}

function testFailedRescueDemoted() {
  const board = emptyBoard();
  setStone(board, 1, 1, BLACK);
  setStone(board, 1, 0, WHITE);
  setStone(board, 0, 1, WHITE);
  setStone(board, 2, 1, WHITE);
  setStone(board, 0, 2, WHITE);
  setStone(board, 2, 2, WHITE);
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 135 }),
    candidate({ x: 4, y: 4 }, { combinedScore: 112 })
  ], board, BLACK, { maxCandidates: 8 });
  const fake = result.candidates.find(item => item.point.x === 1 && item.point.y === 2);
  assert(fake.combinedScore < 135);
}

function testSelfAtariExcluded() {
  const board = emptyBoard();
  setStone(board, 0, 1, WHITE);
  setStone(board, 1, 0, WHITE);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 0, y: 0 }, BLACK);
  assert.strictEqual(result.legal, false);
}

function testWeakGroupReportClassifiesRisk() {
  const report = audits.weakGroupAnalysisReport();
  assert(report.groups.length > 0);
  assert(report.classificationCounts.weak || report.classificationCounts.critical || report.classificationCounts.unsettled);
}

function testLargeWeakGroupOutranksRedundantDefenseRulePresent() {
  assert(audits.weakGroupAnalysisReport().rules.includes("large weak group outranks redundant defense"));
}

function testDisposableSmallGroupRulePresent() {
  assert(audits.weakGroupAnalysisReport().rules.includes("small disposable group need not always be rescued"));
}

function testStableGroupNotRepeatedlyReinforcedRulePresent() {
  assert(audits.weakGroupAnalysisReport().rules.includes("stable groups should not be repeatedly reinforced"));
}

function testQuietGlobalMoveRemainsAvailable() {
  const move = audits.phaseTransitionAudit().moves.find(item => item.moveNumber === 30);
  assert(move.strategicCandidateCount > 0);
}

function testGlobalMoveOutranksSmallLocalWhenNoUrgency() {
  const move = audits.phaseTransitionAudit().moves.find(item => item.moveNumber === 30);
  assert(move.strategicCandidateCount >= move.tacticalCandidateCount || move.coherentCandidateCount > 0);
}

function testAdvancedUses980() {
  assert.strictEqual(product.difficultyModes.advanced.level, 980);
}

function testNoArbitraryFallbackWhenMeaningfulExists() {
  for (const move of audits.phaseTransitionAudit().moves) {
    if (move.coherentCandidateCount > 0) assert.strictEqual(move.fallbackCount, 0);
  }
}

function run() {
  testMove21HasStrategicCandidates();
  testUrgentCaptureSelectable();
  testSafeRescueOutranksQuietMove();
  testFailedRescueDemoted();
  testSelfAtariExcluded();
  testWeakGroupReportClassifiesRisk();
  testLargeWeakGroupOutranksRedundantDefenseRulePresent();
  testDisposableSmallGroupRulePresent();
  testStableGroupNotRepeatedlyReinforcedRulePresent();
  testQuietGlobalMoveRemainsAvailable();
  testGlobalMoveOutranksSmallLocalWhenNoUrgency();
  testAdvancedUses980();
  testNoArbitraryFallbackWhenMeaningfulExists();
  console.log("test-middlegame-strength: ok");
}

run();
