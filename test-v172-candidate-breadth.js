const assert = require("assert");
const fs = require("fs");
const path = require("path");
const audit = require("./evaluation/run-v172-candidate-breadth-audit.js");

function testPurposeAndRegionClassification() {
  assert.strictEqual(audit.purposeForTag("capture", 1, 1), "urgent_capture");
  assert.strictEqual(audit.purposeForTag("weak_group_attack", 2, 2), "attack_weak_group");
  assert.strictEqual(audit.primaryRegion({ x: 3, y: 3 }), "upper_left_corner");
  assert.strictEqual(audit.primaryRegion({ x: 16, y: 16 }), "lower_right_corner");
}

function testBreadthAuditPassesAndIsDeterministic() {
  const first = audit.run({ seed: 20260714 });
  const second = audit.run({ seed: 20260714 });
  assert.deepStrictEqual(first.summary, second.summary);
  assert.strictEqual(first.gate.passed, true);
  assert(first.summary.positionsEvaluated >= 3500);
  assert(first.summary.highConfidenceMissedOpportunityCount > 0);
  assert.strictEqual(first.summary.missedOpportunityWorsenedCount, 0);
}

function testMissedOpportunityCategoriesDetected() {
  const result = audit.run({ seed: 20260714 });
  const counts = result.summary.opportunityCountsByCategory;
  assert(counts.global_large_point_missing > 0);
  assert(counts.weak_group_move_missing > 0);
  assert(counts.missing_attack_candidate > 0);
  assert(counts.invasion_or_reduction_missing > 0);
  assert(counts.tenuki_or_sacrifice_missing > 0);
  assert(counts.influence_direction_missing > 0);
}

function testOfflineProbeOutcomesRecorded() {
  const result = audit.run({ seed: 20260714 });
  assert(result.summary.missedOpportunityBecameRank1Count > 0);
  assert(result.summary.missedOpportunityEnteredTop3Count > 0);
  assert.strictEqual(result.summary.missedOpportunityWorsenedCount, 0);
  assert(result.opportunities.opportunities.every(item => item.failureStage));
}

function testCheckModeWritesNoCanonicalReports() {
  const report = path.join(__dirname, "evaluation", "v172-candidate-breadth-audit.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  audit.run({ seed: 20260714 });
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function run() {
  testPurposeAndRegionClassification();
  testBreadthAuditPassesAndIsDeterministic();
  testMissedOpportunityCategoriesDetected();
  testOfflineProbeOutcomesRecorded();
  testCheckModeWritesNoCanonicalReports();
  console.log("test-v172-candidate-breadth: ok");
}

run();
