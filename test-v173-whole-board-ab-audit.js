const assert = require("assert");
const fs = require("fs");
const path = require("path");
const audit = require("./evaluation/run-v173-whole-board-ab-audit.js");

function testPhaseStatsCoverRequestedRanges() {
  const result = audit.run();
  for (const phase of ["21-60", "61-120", "121-200", "201-300"]) {
    const row = result.summary.phaseStats[phase];
    assert(row);
    for (const key of [
      "generatedCount",
      "enteredTop10Count",
      "shortReadRejectedCount",
      "duplicateCount",
      "settledRegionCount",
      "finallySelectedCount",
      "improvedMoveCount",
      "worsenedMoveCount"
    ]) {
      assert.strictEqual(typeof row[key], "number", `${phase}.${key}`);
    }
  }
}

function testLateOpeningStyleAndSettledRegionCleanup() {
  const result = audit.run();
  assert.strictEqual(result.summary.phaseStats["121-200"].generatedCount, 0);
  assert.strictEqual(result.summary.phaseStats["201-300"].generatedCount, 0);
  assert(result.summary.lateOpeningStyleReduction > 0);
  assert(result.summary.settledRegionReduction > 0);
  assert(result.summary.duplicateReduction > 0);
}

function testSelectedProfileAndGates() {
  const result = audit.run();
  assert.strictEqual(result.summary.selectedProfile, "phase_gated_dedup");
  assert.strictEqual(result.gate.passed, true);
  assert.deepStrictEqual(result.gate.failedGates, []);
  assert.strictEqual(result.gate.safety.calibratedEndgameBadMoveCount, 0);
  assert.strictEqual(result.gate.safety.senteGoteMisclassificationCount, 0);
  assert.strictEqual(result.gate.benchmark.regressed, false);
  assert(result.gate.performance.averageLatencyRegressionPct <= 5);
}

function testPreservedLimits() {
  const result = audit.run();
  assert.strictEqual(result.audit.preservedLimits.maxModeReadingCap, 10);
  assert.strictEqual(result.audit.preservedLimits.readingDepth, 3);
  assert.strictEqual(result.audit.preservedLimits.opponentReplyCap, 4);
  assert.strictEqual(result.audit.preservedLimits.aiContinuationCap, 3);
  assert.strictEqual(result.audit.preservedLimits.scoringWeightsChanged, false);
  assert.strictEqual(result.audit.preservedLimits.lowerDifficultyBehaviorChanged, false);
}

function testRuntimeWiringIsNarrow() {
  const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert(appSource.includes("function wholeBoardStrategyPhaseAllowed()"));
  assert(appSource.includes("moveNumber >= 21 && moveNumber <= 120"));
  assert(appSource.includes("function hasEquivalentStrategicCandidate("));
  assert(appSource.includes("if (!isMaxStrengthMode()"));
  assert(appSource.includes("maxStrengthUrgentCandidateExists(candidateMap)"));
}

function testCheckModeDoesNotWriteReports() {
  const report = path.join(__dirname, "evaluation", "v173-whole-board-phase-summary.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  audit.run();
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function testNextBottleneck() {
  const result = audit.run();
  assert(result.summary.nextBottleneck.includes("opponent reply coverage"));
}

function run() {
  testPhaseStatsCoverRequestedRanges();
  testLateOpeningStyleAndSettledRegionCleanup();
  testSelectedProfileAndGates();
  testPreservedLimits();
  testRuntimeWiringIsNarrow();
  testCheckModeDoesNotWriteReports();
  testNextBottleneck();
  console.log("test-v173-whole-board-ab-audit: ok");
}

run();
