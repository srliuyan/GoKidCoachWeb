const assert = require("assert");
const fs = require("fs");
const path = require("path");

const audit = require("./evaluation/run-v15-middlegame-audit.js");
const v14 = require("./evaluation/run-v14-audits.js");
const longGame = require("./evaluation/run-long-game-performance.js");

let reports = null;

function ensureReports() {
  reports = audit.run();
}

function testProfileRunnerUsesRealJsEngine() {
  const report = reports.profiles;
  assert.strictEqual(report.usesRealJavaScriptEngine, true);
  assert.strictEqual(report.limits.maxDepth, 3);
  assert.strictEqual(report.limits.maxCandidates, 8);
  assert.strictEqual(report.limits.maxOpponentReplies, 4);
  assert.strictEqual(report.limits.maxAiContinuations, 3);
}

function testBaselineV14Unchanged() {
  const report = reports.profiles;
  const baseline = report.profiles.baseline_v14;
  assert.strictEqual(baseline.overall.goodOrBetterRate, 0.216);
  assert.strictEqual(baseline.overall.averageScoreLossFromBest, 9.513055);
  assert.strictEqual(baseline.overall.rejectedMoveRate, 0);
}

function testWeakGroupOnlyDoesNotAlterTacticalOnlyIncorrectly() {
  const report = reports.profiles;
  const weak = report.profiles.weak_group_only;
  assert(weak.tactical.missedImmediateCaptureCount >= report.profiles.full_middlegame_conservative.tactical.missedImmediateCaptureCount);
  assert.strictEqual(weak.tactical.falseTacticalProtectionCount, 0);
}

function testTacticalProfileNoTunnelVision() {
  const report = reports.profiles;
  const tactical = report.profiles.tactical_capture_rescue;
  assert(tactical.strategy.localTunnelVisionCount <= report.profiles.baseline_v14.strategy.localTunnelVisionCount);
}

function testFullProfilePreservesGlobalCandidate() {
  const whole = reports.wholeBoard;
  assert.strictEqual(whole.largeGlobalCandidateCoverageRate, 1);
  assert.strictEqual(whole.unsupportedFallbackCount, 0);
}

function testSelectionDiffDeterministic() {
  const first = audit.selectionDiff(audit.v15ProfileReport(audit.candidateCoverageReport(), audit.tacticalOpportunityCoverage(), audit.wholeBoardStrategyAudit()));
  const second = audit.selectionDiff(audit.v15ProfileReport(audit.candidateCoverageReport(), audit.tacticalOpportunityCoverage(), audit.wholeBoardStrategyAudit()));
  assert.deepStrictEqual(first, second);
}

function testTacticalAndWeakGroupMetrics() {
  const tactical = reports.tactical;
  const weak = reports.weak;
  assert.strictEqual(tactical.terminalClassificationAccuracy, 1);
  assert(tactical.effectiveRerankRate > 0);
  assert(tactical.correctedSelectionRate > 0);
  assert.strictEqual(weak.accuracy, 1);
}

function testGateResultAndRuntimeDecision() {
  const gate = reports.gates;
  assert.strictEqual(gate.bestProfile, "full_middlegame_conservative");
  assert.strictEqual(gate.passed, true);
  assert.deepStrictEqual(gate.failedGates, []);
  assert.strictEqual(gate.runtimeIntegrationRecommended, true);
  assert.strictEqual(gate.runtimeIntegrationAllowed, true);
  assert.strictEqual(gate.runtimeIntegrated, true);
  assert.strictEqual(gate.deploymentOccurred, false);
}

function testGuardrailsStillPass() {
  assert.strictEqual(v14.buildConsistencyAudit().passed, true);
  assert.strictEqual(v14.exportIntegrityReport().passed, true);
  assert.strictEqual(v14.phaseTransitionAudit().passed, true);
  assert.strictEqual(longGame.run().report.performanceAcceptance.passed, true);
}

function run() {
  ensureReports();
  testProfileRunnerUsesRealJsEngine();
  testBaselineV14Unchanged();
  testWeakGroupOnlyDoesNotAlterTacticalOnlyIncorrectly();
  testTacticalProfileNoTunnelVision();
  testFullProfilePreservesGlobalCandidate();
  testSelectionDiffDeterministic();
  testTacticalAndWeakGroupMetrics();
  testGateResultAndRuntimeDecision();
  testGuardrailsStillPass();
  console.log("test-v15-profile-runner: ok");
}

run();
