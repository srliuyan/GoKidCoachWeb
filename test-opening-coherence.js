const assert = require("assert");
const fs = require("fs");
const path = require("path");
const openingAudit = require("./evaluation/run-opening-coherence-audit.js");

const reportPath = path.join(__dirname, "evaluation", "opening-coherence-audit.json");

function loadReport() {
  if (!fs.existsSync(reportPath)) openingAudit.runAudit();
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function byId(report, id) {
  const item = report.cases.find(row => row.fixtureId === id);
  assert(item, id);
  return item;
}

function coherent(item) {
  return item.coherenceClass.startsWith("coherent_") || item.coherenceClass === "acceptable_deviation";
}

function testEmptyBoardChoosesCorner() {
  const item = byId(loadReport(), "empty_board");
  assert.strictEqual(item.whetherCornerMove, true);
}

function testFirstMoveNotFirstLine() {
  const item = byId(loadReport(), "empty_board");
  assert.strictEqual(item.whetherFirstLineMove, false);
}

function testFirstMoveNotMeaninglessCenter() {
  const item = byId(loadReport(), "empty_board");
  assert.strictEqual(item.whetherCenterMove, false);
}

function testOpenCornerMeaningfulCandidate() {
  const item = byId(loadReport(), "open_corner_available");
  assert(item.candidateCounts.coherent > 0);
  assert(coherent(item));
}

function testCornerApproachSelectable() {
  const item = byId(loadReport(), "corner_approach_available");
  assert(item.candidateCounts.coherent > 0);
  assert(coherent(item));
}

function testEnclosureSelectable() {
  const item = byId(loadReport(), "enclosure_available");
  assert(item.candidateCounts.coherent > 0);
  assert(coherent(item));
}

function testLargeSideExtensionVsReinforcementAudited() {
  const item = byId(loadReport(), "large_area_vs_reinforcement");
  assert(item.candidateCounts.coherent > 0);
  assert.strictEqual(item.sourceConflicts.meaninglessFirstLineMove, false);
}

function testSettledJosekiAreaFlaggedIfRepeated() {
  const item = byId(loadReport(), "joseki_settled");
  assert.strictEqual(typeof item.whetherLocalSequenceAlreadySettled, "boolean");
}

function testDeviatedJosekiNotBlindlyForced() {
  const item = byId(loadReport(), "joseki_deviated");
  assert.notStrictEqual(item.coherenceClass, "stale_joseki");
  assert.strictEqual(item.sourceConflicts.staleJosekiActivation, false);
}

function testFusekiNotOverriddenByLocalEmptinessOnEmptyBoard() {
  const item = byId(loadReport(), "empty_board");
  assert(item.whetherBookSupported || item.whetherFusekiSupported);
}

function testShapeDoesNotForceRepetitiveLocalPlay() {
  const item = byId(loadReport(), "repetitive_same_corner");
  assert.strictEqual(item.sourceConflicts.repetitiveLocalMove, false);
}

function testUrgentTacticalMayOverrideGlobal() {
  const item = byId(loadReport(), "urgent_tactic_vs_global");
  assert(coherent(item));
  assert(item.whetherMoveHasTacticalPurpose || item.whetherMoveHasStrategicPurpose);
}

function testMeaninglessFirstLineExcluded() {
  const item = byId(loadReport(), "meaningless_first_line");
  assert.strictEqual(item.sourceConflicts.meaninglessFirstLineMove, false);
}

function testTacticalFirstLineExceptionAvailable() {
  const item = byId(loadReport(), "first_line_tactical_exception");
  assert(coherent(item));
}

function testBeginnerStillHasCoherentOpeningCandidates() {
  const report = loadReport();
  assert(report.candidateCoverage.coherentCandidateCoverageRate >= 0.98);
}

function testBasicHasWholeBoardCandidates() {
  const item = byId(loadReport(), "balanced_whole_board");
  assert(item.candidateCounts.coherent > 0);
}

function testAdvancedSelectsStrongCoherentCandidateWhenAvailable() {
  const item = byId(loadReport(), "balanced_whole_board");
  assert(coherent(item));
}

function testNoArbitraryOpeningFallbackWhenCoherentExists() {
  const report = loadReport();
  assert.strictEqual(report.sourceConflictSummary.meaninglessFirstLineMoveCount, 0);
}

function testOpeningTransitionAudited() {
  const item = byId(loadReport(), "outside_book_coverage");
  assert(item.moveNumber <= 40);
  assert.strictEqual(item.openingSubPhase, "move21To40");
}

function testDeterministicAudit() {
  openingAudit.runAudit();
  const first = fs.readFileSync(reportPath, "utf8");
  openingAudit.runAudit();
  const second = fs.readFileSync(reportPath, "utf8");
  assert.strictEqual(first, second);
}

function testReportContainsRequiredMetrics() {
  const report = loadReport();
  assert.strictEqual(report.offlineOnly, true);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert.strictEqual(report.positionsAudited, 20);
  assert.strictEqual(typeof report.metrics.openingCoherentMoveRate, "number");
  assert.strictEqual(typeof report.candidateCoverage.selectedCoherentMoveRate, "number");
  assert.strictEqual(typeof report.sourceConflictSummary.openingSourceConflictCount, "number");
}

function run() {
  testEmptyBoardChoosesCorner();
  testFirstMoveNotFirstLine();
  testFirstMoveNotMeaninglessCenter();
  testOpenCornerMeaningfulCandidate();
  testCornerApproachSelectable();
  testEnclosureSelectable();
  testLargeSideExtensionVsReinforcementAudited();
  testSettledJosekiAreaFlaggedIfRepeated();
  testDeviatedJosekiNotBlindlyForced();
  testFusekiNotOverriddenByLocalEmptinessOnEmptyBoard();
  testShapeDoesNotForceRepetitiveLocalPlay();
  testUrgentTacticalMayOverrideGlobal();
  testMeaninglessFirstLineExcluded();
  testTacticalFirstLineExceptionAvailable();
  testBeginnerStillHasCoherentOpeningCandidates();
  testBasicHasWholeBoardCandidates();
  testAdvancedSelectsStrongCoherentCandidateWhenAvailable();
  testNoArbitraryOpeningFallbackWhenCoherentExists();
  testOpeningTransitionAudited();
  testDeterministicAudit();
  testReportContainsRequiredMetrics();
  console.log("test-opening-coherence: ok");
}

run();
