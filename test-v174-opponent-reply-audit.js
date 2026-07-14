const assert = require("assert");
const fs = require("fs");
const path = require("path");
const audit = require("./evaluation/run-v174-opponent-reply-audit.js");

function findCategory(category) {
  return audit.criticalCases().find(item => item.category === category);
}

function testFifthReplyFindsMissedRecaptureCutAndEscape() {
  const recapture = findCategory("immediate_recapture");
  const cut = findCategory("cut");
  const escape = findCategory("escape");
  assert(recapture.fifthReply);
  assert(cut.fifthReply);
  assert(escape.fifthReply);
  assert.strictEqual(recapture.changesCandidateEvaluation, true);
  assert.strictEqual(cut.changesCandidateRank, true);
  assert.strictEqual(escape.changesFinalSelectedMove, true);
}

function testEquivalentAndNoncriticalRepliesIgnored() {
  const result = audit.run();
  const categories = result.audit.categorySummary;
  assert(categories.equivalent_reply.fifthReplyCount > 0);
  assert(categories.equivalent_reply.changedCandidateRankCount === 0);
  assert(categories.noncritical_reply.fifthReplyCount > 0);
  assert(categories.noncritical_reply.changedFinalMoveCount === 0);
}

function testSixthReplyMeasuredSeparately() {
  const result = audit.run();
  assert(result.summary.criticalSixthReplyCount > 0);
  assert(result.summary.criticalSixthReplyCount < result.summary.criticalFifthReplyCount);
  assert(result.summary.sixthReplyChangedCandidateRankCount > 0);
  assert(result.summary.sixthReplyChangedFinalMoveCount > 0);
}

function testKoAndLongLadderRemainUncertain() {
  const categories = audit.categorySummary();
  assert.strictEqual(categories.ko_or_threat.changedCandidateRankCount, 0);
  const result = audit.run();
  assert(result.summary.uncertainCount > 0);
}

function testTop4RuntimeBehaviorUnchanged() {
  const result = audit.run();
  assert.strictEqual(result.audit.preservedLimits.opponentReplyCapRuntime, 4);
  assert.strictEqual(result.audit.preservedLimits.top10CandidateCap, 10);
  assert.strictEqual(result.audit.preservedLimits.readingDepth, 3);
  assert.strictEqual(result.audit.preservedLimits.aiContinuationCap, 3);
  assert.strictEqual(result.gate.runtimeReplyCapRemains4, true);
  assert.strictEqual(result.gate.runtimeBehaviorChanged, false);
  const source = fs.readFileSync(path.join(__dirname, "rule-engine.js"), "utf8");
  assert(source.includes("Math.min(4, Number(context.maxOpponentReplies) || 4)"));
  assert(source.includes("conditionalReply5Reason("));
}

function testDeterministicAndCheckModeClean() {
  const first = audit.run();
  const second = audit.run();
  assert.deepStrictEqual(first.summary, second.summary);
  const report = path.join(__dirname, "evaluation", "v174-gate-result.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  audit.run();
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function testAcceptanceGatesAndRecommendation() {
  const result = audit.run();
  assert(result.summary.positionsEvaluated >= 3500);
  assert.strictEqual(result.gate.passed, true);
  assert.deepStrictEqual(result.gate.failedGates, []);
  assert.strictEqual(result.gate.benchmarkUnchanged, true);
  assert.strictEqual(result.gate.tacticalSafetyUnchanged, true);
  assert.strictEqual(result.gate.endgameSafetyUnchanged, true);
  assert.strictEqual(result.gate.lowerModesUnchanged, true);
  assert.strictEqual(result.gate.deploymentOccurred, false);
  assert(["keep_4", "increase_to_5", "conditional_5", "investigate_candidate_reply_generation_first"].includes(result.gate.recommendation));
}

function run() {
  testFifthReplyFindsMissedRecaptureCutAndEscape();
  testEquivalentAndNoncriticalRepliesIgnored();
  testSixthReplyMeasuredSeparately();
  testKoAndLongLadderRemainUncertain();
  testTop4RuntimeBehaviorUnchanged();
  testDeterministicAndCheckModeClean();
  testAcceptanceGatesAndRecommendation();
  console.log("test-v174-opponent-reply-audit: ok");
}

run();
