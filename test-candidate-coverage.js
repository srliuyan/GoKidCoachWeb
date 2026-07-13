const assert = require("assert");
const audit = require("./evaluation/run-v15-middlegame-audit.js");

function runReports() {
  return audit.run();
}

function testOneLibertyGroupGeneratesRescue() {
  const report = audit.candidateCoverageReport();
  assert(report.positions.some(row => row.candidateSourceCounts.safe_atari_rescue || row.candidateSourceCounts.critical_own_group_defense || row.candidateSourceCounts.weak_group_escape_extension));
}

function testCounterCaptureAndConnectionRescueGenerated() {
  const report = audit.candidateCoverageReport();
  assert(report.positions.some(row => row.candidateSourceCounts.immediate_profitable_capture));
  const trace = audit.v151CandidatePipelineTrace();
  const connection = trace.rows.find(row => row.opportunityType === "necessary_connection");
  assert(connection);
  assert.strictEqual(connection.rawGenerated, true);
  assert.strictEqual(connection.retainedInTop8, true);
}

function testDirectEscapeGenerated() {
  const report = audit.candidateCoverageReport();
  assert(report.positions.some(row => row.candidateSourceCounts.weak_group_escape_extension || row.candidateSourceCounts.extension_escape_from_weak_group));
}

function testUrgentSourceTagsSurviveMerge() {
  const trace = audit.v151CandidatePipelineTrace();
  const urgent = trace.rows.filter(row => row.rawGenerated);
  assert(urgent.length > 0);
  assert(urgent.every(row => row.sourceTags.some(tag => /urgent|capture|rescue|connection|candidate/.test(tag))));
  assert(urgent.every(row => row.removedByDeduplication === false));
}

function testUrgentSurvivesTop12AndTop8() {
  const trace = audit.v151CandidatePipelineTrace();
  for (const row of trace.rows.filter(row => row.rawGenerated)) {
    assert.strictEqual(row.retainedInTop12, true);
    assert.strictEqual(row.retainedInTop8, true);
  }
}

function testGlobalCandidateRemainsAvailable() {
  const whole = audit.wholeBoardStrategyAudit();
  assert.strictEqual(whole.largeGlobalCandidateCoverageRate, 1);
  assert.strictEqual(whole.localTunnelVisionCount, 0);
}

function testVerifiedRescueAndFailedRescueHandling() {
  const ranking = audit.v151FinalRankingAudit();
  assert.strictEqual(ranking.verifiedCaptureRescuePreserved, true);
  assert.strictEqual(ranking.failedRescueDemoted, true);
}

function testFinalSelectorRespectsReadingRank() {
  const ranking = audit.v151FinalRankingAudit();
  assert.strictEqual(ranking.advancedRespectsPostReadingRank, true);
  assert.strictEqual(ranking.oldFallbackBypassCount, 0);
}

function run() {
  runReports();
  testOneLibertyGroupGeneratesRescue();
  testCounterCaptureAndConnectionRescueGenerated();
  testDirectEscapeGenerated();
  testUrgentSourceTagsSurviveMerge();
  testUrgentSurvivesTop12AndTop8();
  testGlobalCandidateRemainsAvailable();
  testVerifiedRescueAndFailedRescueHandling();
  testFinalSelectorRespectsReadingRank();
  console.log("test-candidate-coverage: ok");
}

run();
