const assert = require("assert");
const fs = require("fs");
const path = require("path");
const audit = require("./evaluation/run-v15-middlegame-audit.js");
const v14 = require("./evaluation/run-v14-audits.js");
const longGame = require("./evaluation/run-long-game-performance.js");
const product = require("./product-support.js");

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "evaluation", name), "utf8"));
}

function ensureReports() {
  audit.run();
}

function testProfileResultsDeterministic() {
  const first = audit.v151ProfileReport(audit.candidateCoverageReport(), audit.tacticalOpportunityCoverage(), audit.wholeBoardStrategyAudit());
  const second = audit.v151ProfileReport(audit.candidateCoverageReport(), audit.tacticalOpportunityCoverage(), audit.wholeBoardStrategyAudit());
  assert.deepStrictEqual(first, second);
}

function testBestProfilePassesGates() {
  const gate = load("v151-gate-result.json");
  assert.strictEqual(gate.bestProfile, "full_candidate_coverage_conservative");
  assert.strictEqual(gate.passed, true);
  assert.deepStrictEqual(gate.failedGates, []);
  assert.strictEqual(gate.runtimeIntegrationRecommended, true);
  assert.strictEqual(gate.runtimeIntegrationAllowed, true);
  assert.strictEqual(gate.deploymentOccurred, false);
}

function testCoverageTargetsMet() {
  const report = load("v151-profile-report.json");
  const best = report.profiles.full_candidate_coverage_conservative;
  assert.strictEqual(best.coherentCandidateCoverageRate, 1);
  assert(best.urgentCandidateCoverageRate >= 0.95);
  assert(best.weakGroupCandidateCoverageRate >= 0.95);
  assert(best.tacticalCandidateCoverageRate >= 0.95);
  assert(best.top8TacticalCoverageRate >= 0.95);
  assert.strictEqual(best.missedImmediateCaptureCount, 0);
  assert.strictEqual(best.missedAtariRescueCount, 0);
  assert.strictEqual(best.falseTacticalProtectionCount, 0);
}

function testStrategyAndRankingTargetsMet() {
  const report = load("v151-profile-report.json");
  const best = report.profiles.full_candidate_coverage_conservative;
  assert(best.selectedCoherentMoveRate >= 0.93);
  assert.strictEqual(best.largeWeakGroupIgnoredCount, 0);
  assert(best.weakGroupIgnoredCount <= 1);
  assert.strictEqual(best.smallLocalOverGlobalCount, 0);
  assert.strictEqual(best.localTunnelVisionCount, 0);
  assert.strictEqual(best.settledAreaRepetitionCount, 0);
  assert.strictEqual(best.redundantDefenseCount, 0);
}

function testBenchmarkAndGuardrails() {
  const report = load("v151-profile-report.json");
  const best = report.profiles.full_candidate_coverage_conservative;
  assert.strictEqual(best.benchmark.goodOrBetterRate, 0.216);
  assert.strictEqual(best.benchmark.endgameGoodOrBetterRate, 0.108);
  assert.strictEqual(best.benchmark.averageScoreLossFromBest, 9.513055);
  assert.strictEqual(best.benchmark.rejectedMoveRate, 0);
  assert.strictEqual(v14.buildConsistencyAudit().passed, true);
  assert.strictEqual(v14.exportIntegrityReport().passed, true);
  assert.strictEqual(v14.phaseTransitionAudit().passed, true);
  assert.strictEqual(longGame.run().report.performanceAcceptance.passed, true);
}

function testAdvancedAndNoFallback() {
  const ranking = load("v151-final-ranking-audit.json");
  assert.strictEqual(product.difficultyModes.advanced.level, 980);
  assert.strictEqual(ranking.advancedRespectsPostReadingRank, true);
  assert.strictEqual(ranking.oldFallbackBypassCount, 0);
}

function run() {
  ensureReports();
  testProfileResultsDeterministic();
  testBestProfilePassesGates();
  testCoverageTargetsMet();
  testStrategyAndRankingTargetsMet();
  testBenchmarkAndGuardrails();
  testAdvancedAndNoFallback();
  console.log("test-v151-profile-runner: ok");
}

run();
