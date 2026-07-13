const assert = require("assert");
const product = require("./product-support.js");
const audit = require("./evaluation/run-v15-middlegame-audit.js");

function report() {
  return audit.run();
}

function testLargeGlobalMoveRemainsInPool() {
  const data = audit.wholeBoardStrategyAudit();
  assert.strictEqual(data.largeGlobalCandidateCoverageRate, 1);
}

function testLargeGlobalOutranksSmallLocalWithoutUrgency() {
  const coverage = audit.candidateCoverageReport();
  const globalCase = coverage.positions.find(item => item.positionId === "m75_global");
  assert(globalCase);
  assert(globalCase.quietGlobalCandidatePresent);
  assert.notStrictEqual(globalCase.selectedCandidateSource, "redundant_defense");
}

function testUrgentRescueOutranksGlobalMove() {
  const coverage = audit.candidateCoverageReport();
  const weakCase = coverage.positions.find(item => item.positionId === "m40_weak_group");
  assert(weakCase);
  assert(/critical|weak|rescue|escape/.test(weakCase.selectedCandidateSource));
}

function testVerifiedProfitableCaptureMayOutrankGlobal() {
  const coverage = audit.candidateCoverageReport();
  const captureCase = coverage.positions.find(item => item.positionId === "m21_capture");
  assert(captureCase);
  assert(/capture/.test(captureCase.selectedCandidateSource));
}

function testStableSmallGroupNotChasedRepeatedly() {
  const data = audit.wholeBoardStrategyAudit();
  assert.strictEqual(data.settledAreaRepetitionCount, 0);
}

function testSettledAreaNotReplayed() {
  const data = audit.wholeBoardStrategyAudit();
  assert.strictEqual(data.rows.some(row => row.entersAlreadySettledRegion), false);
}

function testRedundantDefenseExcluded() {
  const data = audit.wholeBoardStrategyAudit();
  assert.strictEqual(data.redundantDefenseCount, 0);
}

function testInvasionWithoutSupportNotPromoted() {
  const data = audit.wholeBoardStrategyAudit();
  assert(data.rows.every(row => !/unsupported_invasion/.test(row.selectedSource || "")));
}

function testSupportedInvasionReductionSelectable() {
  const data = audit.wholeBoardStrategyAudit();
  assert(data.largeGlobalCandidateCoverageRate >= 1);
}

function testOwnCriticalSafetyBeforeAttacking() {
  const coverage = audit.candidateCoverageReport();
  const weakCase = coverage.positions.find(item => item.positionId === "m40_weak_group");
  assert(/critical|weak|rescue|escape/.test(weakCase.selectedCandidateSource));
}

function testLargeOwnGroupNotSacrificedForTinyCapture() {
  const data = audit.wholeBoardStrategyAudit();
  assert.strictEqual(data.rows.some(row => row.weakOwnGroups > 0 && /small_local/.test(row.selectedSource)), false);
}

function testQuietStrategicCandidateSurvivesLocalReading() {
  const data = audit.wholeBoardStrategyAudit();
  assert(data.rows.every(row => row.quietStrategicAlternatives > 0));
}

function testAdvanced980StrongestValid() {
  assert.strictEqual(product.difficultyModes.advanced.level, 980);
}

function testDeterministicRunsRepeat() {
  const first = audit.wholeBoardStrategyAudit();
  const second = audit.wholeBoardStrategyAudit();
  assert.deepStrictEqual(first, second);
}

function run() {
  report();
  testLargeGlobalMoveRemainsInPool();
  testLargeGlobalOutranksSmallLocalWithoutUrgency();
  testUrgentRescueOutranksGlobalMove();
  testVerifiedProfitableCaptureMayOutrankGlobal();
  testStableSmallGroupNotChasedRepeatedly();
  testSettledAreaNotReplayed();
  testRedundantDefenseExcluded();
  testInvasionWithoutSupportNotPromoted();
  testSupportedInvasionReductionSelectable();
  testOwnCriticalSafetyBeforeAttacking();
  testLargeOwnGroupNotSacrificedForTinyCapture();
  testQuietStrategicCandidateSurvivesLocalReading();
  testAdvanced980StrongestValid();
  testDeterministicRunsRepeat();
  console.log("test-whole-board-strategy: ok");
}

run();
