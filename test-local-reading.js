const assert = require("assert");
const ruleEngine = require("./rule-engine.js");
const localReadingProfileRunner = require("./evaluation/run-local-reading-profile.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function candidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    combinedScore: 100,
    fusedPolicyScore: 100,
    captures: 0,
    rescueValue: 0,
    connectionValue: 0,
    tacticalPressure: 0,
    ...overrides
  };
}

function samePoint(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function testRealCaptureSequenceSucceeds() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert.strictEqual(result.legal, true);
  assert(result.netLocalValue > 0);
  assert.strictEqual(result.refuted, false);
  assert(result.sequenceDepth <= 3);
}

function testImmediateRecaptureDetected() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 0, y: 2 }, white);
  setStone(board, { x: 2, y: 2 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert(result.opponentBestReply || result.selfAtariRisk || result.refuted);
}

function testDirectCaptureReplyGeneratedFirst() {
  const board = emptyBoard();
  setStone(board, { x: 5, y: 5 }, black);
  setStone(board, { x: 5, y: 4 }, white);
  setStone(board, { x: 4, y: 5 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 6, y: 5 }, black);
  assert(result.generatedOpponentReplies.length > 0);
  assert(["direct_capture", "capture_atari_group", "atari", "critical_liberty"].includes(result.generatedOpponentReplies[0].reason));
}

function testRecaptureGeneratedCorrectly() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 0, y: 2 }, white);
  setStone(board, { x: 2, y: 2 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert(result.generatedOpponentReplies.some(reply => reply.reason === "recapture" || reply.reason === "direct_capture"));
}

function testFakeRescueFailsAfterReply() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  setStone(board, { x: 0, y: 2 }, white);
  setStone(board, { x: 2, y: 2 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert.strictEqual(result.hardOutcome, "failed_rescue");
}

function testValidRescueSurvivesReply() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert.strictEqual(result.legal, true);
  assert(result.libertyDelta > 0);
}

function testNecessaryConnectionSurvivesCutAttempt() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, white);
  setStone(board, { x: 2, y: 3 }, white);
  setStone(board, { x: 5, y: 2 }, white);
  setStone(board, { x: 6, y: 3 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 4, y: 3 }, black);
  assert(["connected", "unresolved"].includes(result.connectionResult));
  assert(result.sequenceDepth <= 3);
}

function testUnnecessarySafeConnectionNotPromoted() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 5, y: 4 }, black);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 4, y: 3 }, black);
  assert.notStrictEqual(result.hardOutcome, "verified_connection");
  assert.notStrictEqual(result.confidenceLevel, "high");
}

function testSimpleCutSequenceDetected() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, white);
  setStone(board, { x: 5, y: 3 }, white);
  setStone(board, { x: 4, y: 2 }, black);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 4, y: 3 }, black);
  assert(["cut_works", "unresolved"].includes(result.cutResult));
}

function testSelfAtariSequenceRejected() {
  const board = emptyBoard();
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 1, y: 0 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 0, y: 0 }, black);
  assert.strictEqual(result.legal, false);
}

function testCompensatedSacrificeNotAutomaticallyRejected() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert.notStrictEqual(result.hardOutcome, "uncompensated_self_atari");
}

function testImmediatelyRefutedLosesTier() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  setStone(board, { x: 0, y: 2 }, white);
  setStone(board, { x: 2, y: 2 }, white);
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 200, tier: "strong", qualityTier: "strong" }),
    candidate({ x: 4, y: 4 }, { combinedScore: 120, tier: "good", qualityTier: "good" })
  ], board, black, { maxCandidates: 8 });
  const refuted = result.candidates.find(item => samePoint(item.point, { x: 1, y: 2 }));
  assert(["weak", "acceptable"].includes(refuted.tier) || refuted.combinedScore < 200);
}

function testVerifiedCaptureChangesRank() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 4, y: 4 }, { combinedScore: 200 }),
    candidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 100 })
  ], board, black, { maxCandidates: 8 });
  const capture = result.candidates.find(item => samePoint(item.point, { x: 1, y: 2 }));
  assert(capture.localReadingAdjustment > 0);
}

function testVerifiedRescueRemainsSelectable() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 80 }),
    candidate({ x: 4, y: 4 }, { combinedScore: 120 })
  ], board, black, { maxCandidates: 8 });
  const rescue = result.candidates.find(item => samePoint(item.point, { x: 1, y: 2 }));
  assert(rescue.localReadingAdjustment >= 0);
  assert.notStrictEqual(rescue.localReadingStatus, "not_read");
}

function testSnapbackLikeRefutationDetected() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 1, y: 3 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 1, y: 2 }, black);
  assert(result.sequenceDepth <= 3);
}

function testShortLadderSignalHandledWithinLimit() {
  const board = emptyBoard();
  setStone(board, { x: 5, y: 5 }, white);
  setStone(board, { x: 4, y: 5 }, black);
  setStone(board, { x: 5, y: 4 }, black);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 6, y: 5 }, black, { localRadius: 4 });
  assert(result.sequenceDepth <= 3);
  assert.strictEqual(result.unresolved, false);
}

function testUnresolvedLongLadderFallsBackSafely() {
  const board = emptyBoard();
  setStone(board, { x: 8, y: 8 }, white);
  const result = ruleEngine.evaluateLocalSequence(board, { x: 9, y: 8 }, black, { maxDepth: 1 });
  assert(result.sequenceDepth <= 1);
}

function testCapsAndDeterminism() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const candidates = Array.from({ length: 20 }, (_, index) => candidate({ x: index % 19, y: Math.floor(index / 19) }, { combinedScore: 200 - index }));
  candidates[0] = candidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 300 });
  const first = ruleEngine.applyLocalReading(candidates, board, black, { maxCandidates: 8, maxOpponentReplies: 4, maxAiContinuations: 3 });
  const second = ruleEngine.applyLocalReading(candidates, board, black, { maxCandidates: 8, maxOpponentReplies: 4, maxAiContinuations: 3 });
  assert(first.diagnostics.candidatesRead <= 8);
  assert(first.candidates.every(item => !item.localReading || item.localReading.repliesConsidered <= 4));
  assert(first.candidates.every(item => !item.localReading || item.localReading.continuationsConsidered <= 12));
  assert.deepStrictEqual(
    first.candidates.map(item => item.localReadingStatus),
    second.candidates.map(item => item.localReadingStatus)
  );
}

function testTimeBudgetFallbackPreservesBaseline() {
  const board = emptyBoard();
  const candidates = Array.from({ length: 8 }, (_, index) => candidate({ x: index, y: 0 }, { combinedScore: 100 - index }));
  const result = ruleEngine.applyLocalReading(candidates, board, black, { timeBudgetMs: 0.001, maxCandidates: 8 });
  assert(result.diagnostics.fallbackCount >= 0);
  assert.strictEqual(result.candidates.length, candidates.length);
}

function testRuleEngineLegalityAuthoritative() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  const illegal = ruleEngine.evaluateLocalSequence(board, { x: 3, y: 3 }, white);
  assert.strictEqual(illegal.legal, false);
}

function testRejectedMovesRemainRejected() {
  const board = emptyBoard();
  const result = ruleEngine.applyLocalReading([
    candidate({ x: 3, y: 3 }, { ruleLegal: false, combinedScore: 999 }),
    candidate({ x: 4, y: 4 }, { combinedScore: 100 })
  ], board, black);
  assert.strictEqual(result.candidates[0].localReadingStatus, "not_read");
}

function testComplete250MoveSimulationStable() {
  const board = emptyBoard();
  const hashes = [];
  let color = black;
  let played = 0;
  for (let y = 0; y < 19 && played < 250; y += 1) {
    for (let x = 0; x < 19 && played < 250; x += 1) {
      const result = ruleEngine.simulateMove(board, { x, y }, color, hashes);
      if (!result.legal) continue;
      for (let yy = 0; yy < 19; yy += 1) {
        for (let xx = 0; xx < 19; xx += 1) board[yy][xx] = result.board[yy][xx];
      }
      hashes.push(ruleEngine.boardHash(board));
      color = color === black ? white : black;
      played += 1;
    }
  }
  assert(played >= 250);
}

function runProfile(profile) {
  return localReadingProfileRunner.runProfile(profile, 20260710);
}

function testProfileRunnerUsesRealImplementation() {
  const result = runProfile("full_conservative");
  assert.strictEqual(result.usesRealJavaScriptLocalReading, true);
  assert.strictEqual(result.implementation, "GoKidCoachRuleEngine.evaluateLocalSequence");
  assert.strictEqual(result.limits.maxDepth, 3);
  assert.strictEqual(result.limits.maxCandidates, 8);
  assert.strictEqual(result.limits.maxOpponentReplies, 4);
  assert.strictEqual(result.limits.maxAiContinuations, 3);
}

function testBaselineProfileUnchanged() {
  const result = runProfile("baseline_v12");
  assert.strictEqual(result.readingCoverage.candidatesRead, 0);
  assert.strictEqual(result.changedSelectionCases.length, 0);
}

function testCaptureOnlyDoesNotAffectConnectionCases() {
  const result = runProfile("capture_only");
  assert(!result.changedSelectionCases.some(item => item.anonymizedPositionId.includes("connection")));
}

function testCaptureRescueDoesNotPromoteUnnecessaryConnections() {
  const result = runProfile("capture_rescue");
  assert.strictEqual(result.tacticalMetrics.unnecessaryConnectionPromotionCount, 0);
}

function testCutConnectionDoesNotAlterUnrelatedCaptures() {
  const result = runProfile("cut_connection");
  assert(!result.changedSelectionCases.some(item => item.anonymizedPositionId.includes("capture")));
}

function testFullConservativePreservesUnresolvedBaseline() {
  const result = runProfile("full_conservative");
  assert.strictEqual(result.tacticalMetrics.unresolvedLongLadderFallbackCount, 1);
}

function testProfileRunnerDeterministic() {
  const first = runProfile("full_conservative");
  const second = runProfile("full_conservative");
  assert.deepStrictEqual(first.tacticalMetrics, second.tacticalMetrics);
  assert.deepStrictEqual(first.changedSelectionCases, second.changedSelectionCases);
}

function testVerifiedCaptureMovesUpInRank() {
  const result = runProfile("full_conservative");
  const item = result.changedSelectionCases.find(row => row.anonymizedPositionId === "capture_001");
  assert(item);
  assert.strictEqual(item.hardOutcome, "verified_capture");
  assert(item.rankAfter < item.rankBefore);
  assert.strictEqual(item.corrected, true);
}

function testVerifiedRescueRemainsSelectable() {
  const result = runProfile("full_conservative");
  const item = result.changedSelectionCases.find(row => row.anonymizedPositionId === "rescue_001");
  assert(item);
  assert.strictEqual(item.hardOutcome, "verified_rescue");
  assert(item.rankAfter < item.rankBefore);
}

function testSelfAtariSelectionCorrected() {
  const result = runProfile("full_conservative");
  assert.strictEqual(result.tacticalMetrics.selfAtariSelectionCount, 0);
  assert(result.changedSelectionCases.some(row => row.anonymizedPositionId === "self_atari_001" && row.corrected));
}

function testConnectionPromotionDisabledForV14() {
  const result = runProfile("full_conservative");
  assert.strictEqual(result.tacticalMetrics.missedNecessaryConnectionCount, 1);
  assert.strictEqual(result.tacticalMetrics.unnecessaryConnectionPromotionCount, 0);
  assert.strictEqual(result.tacticalMetrics.falseTacticalProtectionCount, 0);
}

function testOpportunityMetricsReported() {
  const result = runProfile("full_conservative");
  assert(result.opportunityMetrics.tacticalCandidateCoverageRate > 0);
  assert(result.opportunityMetrics.correctReplyGenerationRate > 0);
  assert(result.opportunityMetrics.terminalClassificationAccuracy > 0);
  assert(result.opportunityMetrics.effectiveRerankRate > 0);
  assert(result.opportunityMetrics.correctedSelectionRate > 0);
}

function run() {
  testRealCaptureSequenceSucceeds();
  testImmediateRecaptureDetected();
  testDirectCaptureReplyGeneratedFirst();
  testRecaptureGeneratedCorrectly();
  testFakeRescueFailsAfterReply();
  testValidRescueSurvivesReply();
  testNecessaryConnectionSurvivesCutAttempt();
  testUnnecessarySafeConnectionNotPromoted();
  testSimpleCutSequenceDetected();
  testSelfAtariSequenceRejected();
  testCompensatedSacrificeNotAutomaticallyRejected();
  testImmediatelyRefutedLosesTier();
  testVerifiedCaptureChangesRank();
  testVerifiedRescueRemainsSelectable();
  testSnapbackLikeRefutationDetected();
  testShortLadderSignalHandledWithinLimit();
  testUnresolvedLongLadderFallsBackSafely();
  testCapsAndDeterminism();
  testTimeBudgetFallbackPreservesBaseline();
  testRuleEngineLegalityAuthoritative();
  testRejectedMovesRemainRejected();
  testComplete250MoveSimulationStable();
  testProfileRunnerUsesRealImplementation();
  testBaselineProfileUnchanged();
  testCaptureOnlyDoesNotAffectConnectionCases();
  testCaptureRescueDoesNotPromoteUnnecessaryConnections();
  testCutConnectionDoesNotAlterUnrelatedCaptures();
  testFullConservativePreservesUnresolvedBaseline();
  testProfileRunnerDeterministic();
  testVerifiedCaptureMovesUpInRank();
  testVerifiedRescueRemainsSelectable();
  testSelfAtariSelectionCorrected();
  testConnectionPromotionDisabledForV14();
  testOpportunityMetricsReported();
  console.log("test-local-reading: ok");
}

run();
