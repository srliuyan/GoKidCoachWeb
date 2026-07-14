const assert = require("assert");
const fs = require("fs");
const path = require("path");
const expansion = require("./evaluation/run-v172-candidate-expansion.js");

function findProfile(result, name) {
  return result.profiles.find(profile => profile.profileName === name);
}

function testConsolidationPreservesMetadata() {
  const sample = [
    {
      positionId: "p1",
      opportunityType: "invasion_or_reduction_missing",
      proposedCandidate: { x: 13, y: 5 },
      region: "largest_opponent_framework",
      affectedGroups: ["g1"],
      purpose: "invade",
      confidence: "high",
      reason: "framework",
      boundedReadingSupportsInclusion: true,
      offlineProbe: { becomesFinalRank1: true },
      uncertain: false
    },
    {
      positionId: "p1",
      opportunityType: "invasion_or_reduction_missing",
      proposedCandidate: { x: 13, y: 5 },
      region: "largest_opponent_framework",
      affectedGroups: ["g1"],
      purpose: "invade",
      confidence: "medium",
      reason: "reduction",
      boundedReadingSupportsInclusion: false,
      offlineProbe: { becomesFinalRank1: false },
      uncertain: false
    }
  ];
  const consolidated = expansion.consolidateOpportunities(sample);
  assert.strictEqual(consolidated.consolidatedOpportunityCount, 1);
  assert.deepStrictEqual(consolidated.opportunities[0].sourceTags, ["invasion_reduction_probe"]);
  assert(consolidated.opportunities[0].reasons.includes("framework"));
  assert(consolidated.opportunities[0].reasons.includes("reduction"));
}

function testSafeInvasionReductionConditionsAndLimits() {
  const result = expansion.run();
  const profile = findProfile(result, "invasion_reduction_only");
  assert(profile.generatedCountAfterDedup <= 2);
  assert(profile.candidates.every(candidate => candidate.invasionReductionCandidate));
  assert(profile.candidates.every(candidate => candidate.confidence === "high"));
  assert(profile.candidates.every(candidate => !candidate.tacticalSafety.unsafeDeepInvasion));
}

function testTenukiBlockedByUrgentLocalFightAndLimited() {
  const result = expansion.run();
  const profile = findProfile(result, "tenuki_only");
  assert(profile.generatedCountAfterDedup <= 1);
  assert(profile.candidates.every(candidate => candidate.tenukiCandidate));
  assert(profile.candidates.every(candidate => !candidate.tacticalSafety.localFightUrgent));
}

function testWholeBoardRegionDiversityAndLimit() {
  const result = expansion.run();
  const profile = findProfile(result, "whole_board_only");
  assert(profile.generatedCountAfterDedup <= 2);
  const regions = new Set(profile.candidates.map(candidate => candidate.primaryRegion));
  assert(regions.size >= Math.min(2, profile.candidates.length));
}

function testAllThreeCandidateLimitAndMetadata() {
  const result = expansion.run();
  const profile = findProfile(result, "all_three_sources");
  assert(profile.generatedCountAfterDedup <= 5);
  for (const candidate of profile.candidates) {
    assert(candidate.sourceTags.length > 0);
    assert(candidate.purposeLabels.length > 0);
    assert(candidate.generationReason);
    assert(candidate.primaryRegion);
    assert(candidate.tacticalSafety);
    assert.strictEqual(typeof candidate.initialRank, "number");
    assert.strictEqual(typeof candidate.preReadingScore, "number");
    assert.strictEqual(typeof candidate.postReadingRank, "number");
    assert(candidate.readingOutcome);
    assert(candidate.finalSelectionReason);
  }
}

function testMetadataMerging() {
  const merged = expansion.mergeCandidateMetadata([
    {
      point: { x: 4, y: 4 },
      sourceTags: ["a"],
      purposeLabels: ["global_large_point"],
      affectedGroups: ["g1"],
      generationReason: "one",
      confidence: "medium",
      postReadingRank: 5,
      finalSelectionReason: "not_selected"
    },
    {
      point: { x: 4, y: 4 },
      sourceTags: ["b"],
      purposeLabels: ["invade"],
      affectedGroups: ["g2"],
      generationReason: "two",
      confidence: "high",
      postReadingRank: 1,
      finalSelectionReason: "offline_probe_rank1"
    }
  ]);
  assert.strictEqual(merged.length, 1);
  assert.deepStrictEqual(merged[0].sourceTags.sort(), ["a", "b"]);
  assert.deepStrictEqual(merged[0].purposeLabels.sort(), ["global_large_point", "invade"]);
  assert.strictEqual(merged[0].confidence, "high");
  assert.strictEqual(merged[0].postReadingRank, 1);
}

function testUrgentCandidatePreservationAndTop10Entry() {
  const result = expansion.run();
  const profile = findProfile(result, "all_three_sources");
  assert.strictEqual(profile.top10Preservation.urgentCandidateDisplaced, false);
  assert.strictEqual(profile.top10Preservation.strategicCandidatePreserved, true);
}

function testDeterministicAndCheckModeClean() {
  const first = expansion.run();
  const second = expansion.run();
  assert.deepStrictEqual(first.summary, second.summary);
  const report = path.join(__dirname, "evaluation", "v172-candidate-expansion-summary.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  expansion.run();
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function testLowerModeBehaviorLockAndRuntimeUnchanged() {
  const result = expansion.run();
  assert.strictEqual(result.report.runtimeBehaviorChanged, false);
  assert.strictEqual(result.report.top10ReadingCapChanged, false);
  assert.strictEqual(result.report.finalSelectorGuardChanged, false);
}

function run() {
  testConsolidationPreservesMetadata();
  testSafeInvasionReductionConditionsAndLimits();
  testTenukiBlockedByUrgentLocalFightAndLimited();
  testWholeBoardRegionDiversityAndLimit();
  testAllThreeCandidateLimitAndMetadata();
  testMetadataMerging();
  testUrgentCandidatePreservationAndTop10Entry();
  testDeterministicAndCheckModeClean();
  testLowerModeBehaviorLockAndRuntimeUnchanged();
  console.log("test-v172-candidate-expansion: ok");
}

run();
