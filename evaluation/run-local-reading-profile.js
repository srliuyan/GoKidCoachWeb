#!/usr/bin/env node
"use strict";

const ruleEngine = require("../rule-engine.js");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const PROFILES = [
  "baseline_v12",
  "capture_only",
  "capture_rescue",
  "cut_connection",
  "full_conservative",
  "local_read_capture_only",
  "local_read_capture_rescue",
  "local_read_cut_connection",
  "local_read_full_conservative"
];

const LIMITS = {
  maxDepth: 3,
  defaultCandidates: 6,
  maxCandidates: 8,
  maxOpponentReplies: 4,
  maxAiContinuations: 3,
  localRadius: 4,
  regionCap: 48,
  timeBudgetMs: 120
};

function parseArgs(argv) {
  const args = { profile: "baseline_v12", seed: 20260710 };
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--profile") args.profile = argv[index += 1];
    else if (item === "--seed") args.seed = Number(argv[index += 1]);
  }
  if (!PROFILES.includes(args.profile)) {
    throw new Error(`Unknown local-reading profile: ${args.profile}`);
  }
  return args;
}

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(EMPTY));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function candidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    tier: "good",
    qualityTier: "good",
    combinedScore: 100,
    fusedPolicyScore: 100,
    policyScore: 100,
    captures: 0,
    rescueValue: 0,
    connectionValue: 0,
    tacticalPressure: 0,
    baselineRank: 1,
    ...overrides
  };
}

function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function moveKey(point) {
  return `${point.x},${point.y}`;
}

function makeCaptureCase() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, WHITE);
  setStone(board, { x: 0, y: 1 }, BLACK);
  setStone(board, { x: 1, y: 0 }, BLACK);
  setStone(board, { x: 2, y: 1 }, BLACK);
  return {
    id: "capture_001",
    phase: "middlegame",
    category: "immediate_capture",
    board,
    player: BLACK,
    baselineMove: { x: 4, y: 4 },
    expectedMove: { x: 1, y: 2 },
    candidates: [
      candidate({ x: 4, y: 4 }, { combinedScore: 130, fusedPolicyScore: 130, tier: "strong" }),
      candidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 105, fusedPolicyScore: 105, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 95, fusedPolicyScore: 95, tier: "acceptable" })
    ]
  };
}

function makeRescueCase() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, BLACK);
  setStone(board, { x: 1, y: 0 }, WHITE);
  setStone(board, { x: 0, y: 1 }, WHITE);
  setStone(board, { x: 2, y: 1 }, WHITE);
  return {
    id: "rescue_001",
    phase: "middlegame",
    category: "atari_rescue",
    board,
    player: BLACK,
    baselineMove: { x: 4, y: 4 },
    expectedMove: { x: 1, y: 2 },
    candidates: [
      candidate({ x: 4, y: 4 }, { combinedScore: 132, fusedPolicyScore: 132, tier: "strong" }),
      candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 104, fusedPolicyScore: 104, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 94, fusedPolicyScore: 94, tier: "acceptable" })
    ]
  };
}

function makeFakeRescueCase() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, BLACK);
  setStone(board, { x: 1, y: 0 }, WHITE);
  setStone(board, { x: 0, y: 1 }, WHITE);
  setStone(board, { x: 2, y: 1 }, WHITE);
  setStone(board, { x: 0, y: 2 }, WHITE);
  setStone(board, { x: 2, y: 2 }, WHITE);
  return {
    id: "fake_rescue_001",
    phase: "middlegame",
    category: "fake_rescue",
    board,
    player: BLACK,
    baselineMove: { x: 1, y: 2 },
    expectedMove: { x: 4, y: 4 },
    candidates: [
      candidate({ x: 1, y: 2 }, { rescueValue: 3, combinedScore: 135, fusedPolicyScore: 135, tier: "strong" }),
      candidate({ x: 4, y: 4 }, { combinedScore: 112, fusedPolicyScore: 112, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 90, fusedPolicyScore: 90, tier: "acceptable" })
    ]
  };
}

function makeConnectionCase() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, BLACK);
  setStone(board, { x: 5, y: 3 }, BLACK);
  setStone(board, { x: 3, y: 2 }, WHITE);
  setStone(board, { x: 3, y: 4 }, WHITE);
  setStone(board, { x: 5, y: 2 }, WHITE);
  return {
    id: "connection_001",
    phase: "middlegame",
    category: "necessary_connection",
    board,
    player: BLACK,
    baselineMove: { x: 10, y: 10 },
    expectedMove: { x: 4, y: 3 },
    candidates: [
      candidate({ x: 10, y: 10 }, { combinedScore: 131, fusedPolicyScore: 131, tier: "strong" }),
      candidate({ x: 4, y: 3 }, { connectionValue: 3, combinedScore: 103, fusedPolicyScore: 103, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 95, fusedPolicyScore: 95, tier: "acceptable" })
    ]
  };
}

function makeUnnecessaryConnectionCase() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, BLACK);
  setStone(board, { x: 5, y: 3 }, BLACK);
  setStone(board, { x: 3, y: 4 }, BLACK);
  setStone(board, { x: 5, y: 4 }, BLACK);
  return {
    id: "unnecessary_connection_001",
    phase: "middlegame",
    category: "unnecessary_connection",
    board,
    player: BLACK,
    baselineMove: { x: 10, y: 10 },
    expectedMove: { x: 10, y: 10 },
    candidates: [
      candidate({ x: 10, y: 10 }, { combinedScore: 128, fusedPolicyScore: 128, tier: "strong" }),
      candidate({ x: 4, y: 3 }, { connectionValue: 3, combinedScore: 100, fusedPolicyScore: 100, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 96, fusedPolicyScore: 96, tier: "acceptable" })
    ]
  };
}

function makeSelfAtariCase() {
  const board = emptyBoard();
  setStone(board, { x: 0, y: 1 }, WHITE);
  setStone(board, { x: 1, y: 0 }, WHITE);
  return {
    id: "self_atari_001",
    phase: "middlegame",
    category: "self_atari",
    board,
    player: BLACK,
    baselineMove: { x: 0, y: 0 },
    expectedMove: { x: 4, y: 4 },
    candidates: [
      candidate({ x: 0, y: 0 }, { combinedScore: 130, fusedPolicyScore: 130, tier: "strong" }),
      candidate({ x: 4, y: 4 }, { combinedScore: 110, fusedPolicyScore: 110, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 94, fusedPolicyScore: 94, tier: "acceptable" })
    ]
  };
}

function makeSnapbackCase() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, WHITE);
  setStone(board, { x: 0, y: 1 }, BLACK);
  setStone(board, { x: 1, y: 0 }, BLACK);
  setStone(board, { x: 2, y: 1 }, BLACK);
  setStone(board, { x: 1, y: 3 }, WHITE);
  return {
    id: "snapback_001",
    phase: "middlegame",
    category: "snapback_refutation",
    board,
    player: BLACK,
    baselineMove: { x: 1, y: 2 },
    expectedMove: { x: 4, y: 4 },
    candidates: [
      candidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 125, fusedPolicyScore: 125, tier: "strong" }),
      candidate({ x: 4, y: 4 }, { combinedScore: 112, fusedPolicyScore: 112, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 90, fusedPolicyScore: 90, tier: "acceptable" })
    ]
  };
}

function makeLongLadderCase() {
  const board = emptyBoard();
  setStone(board, { x: 8, y: 8 }, WHITE);
  return {
    id: "long_ladder_001",
    phase: "middlegame",
    category: "unresolved_long_ladder",
    board,
    player: BLACK,
    baselineMove: { x: 9, y: 8 },
    expectedMove: { x: 9, y: 8 },
    candidates: [
      candidate({ x: 9, y: 8 }, { combinedScore: 121, fusedPolicyScore: 121, tier: "strong" }),
      candidate({ x: 4, y: 4 }, { combinedScore: 111, fusedPolicyScore: 111, tier: "good" }),
      candidate({ x: 16, y: 16 }, { combinedScore: 92, fusedPolicyScore: 92, tier: "acceptable" })
    ],
    contextOverride: { maxDepth: 1 }
  };
}

function fixtures() {
  return [
    makeCaptureCase(),
    makeRescueCase(),
    makeFakeRescueCase(),
    makeConnectionCase(),
    makeUnnecessaryConnectionCase(),
    makeSelfAtariCase(),
    makeSnapbackCase(),
    makeLongLadderCase()
  ];
}

function profileAllowsCase(profile, category) {
  if (profile === "baseline_v12") return false;
  if (profile === "capture_only" || profile === "local_read_capture_only") return ["immediate_capture", "snapback_refutation"].includes(category);
  if (profile === "capture_rescue" || profile === "local_read_capture_rescue") return ["immediate_capture", "atari_rescue", "fake_rescue", "snapback_refutation"].includes(category);
  if (profile === "cut_connection" || profile === "local_read_cut_connection") return ["necessary_connection", "unnecessary_connection"].includes(category);
  return true;
}

function sortCandidates(candidates) {
  return candidates.slice().sort((a, b) => (
    Number(b.combinedScore || 0) - Number(a.combinedScore || 0) ||
    a.point.y - b.point.y ||
    a.point.x - b.point.x
  ));
}

function rankOf(candidates, point) {
  const sorted = sortCandidates(candidates);
  const index = sorted.findIndex(item => samePoint(item.point, point));
  return index >= 0 ? index + 1 : null;
}

function selectMove(candidates) {
  return sortCandidates(candidates)[0];
}

function applyProfile(testCase, profile) {
  const baselineSelected = selectMove(testCase.candidates);
  if (!profileAllowsCase(profile, testCase.category)) {
    return {
      selected: baselineSelected,
      applied: false,
      diagnostics: {
        candidatesRead: 0,
        opponentRepliesSimulated: 0,
        aiContinuationsSimulated: 0,
        fallbackCount: 0,
        timeoutCount: 0,
        latencyMs: 0
      },
      readCandidates: testCase.candidates.map(item => ({ ...item, localReadingStatus: "not_read" }))
    };
  }

  const result = ruleEngine.applyLocalReading(testCase.candidates, testCase.board, testCase.player, {
    ...LIMITS,
    ...(testCase.contextOverride || {})
  });
  const selected = selectMove(result.candidates);
  const opponentRepliesSimulated = result.candidates.reduce((sum, item) => sum + Number(item.localReading?.repliesConsidered || 0), 0);
  const aiContinuationsSimulated = result.candidates.reduce((sum, item) => sum + Number(item.localReading?.continuationsConsidered || 0), 0);
  return {
    selected,
    applied: true,
    diagnostics: {
      candidatesRead: result.diagnostics.candidatesRead || 0,
      opponentRepliesSimulated,
      aiContinuationsSimulated,
      fallbackCount: result.diagnostics.fallbackCount || 0,
      timeoutCount: result.candidates.filter(item => item.localReadingStatus === "timeout").length,
      latencyMs: result.diagnostics.totalReadingLatencyMs || 0
    },
    readCandidates: result.candidates
  };
}

function percentile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return Number(sorted[index].toFixed(4));
}

function classifyOutcome(testCase, baselineSelected, profileSelected) {
  const baselineCorrect = samePoint(baselineSelected.point, testCase.expectedMove);
  const profileCorrect = samePoint(profileSelected.point, testCase.expectedMove);
  if (profileCorrect && !baselineCorrect) return "clear_improvement";
  if (profileCorrect && baselineCorrect) return "equivalent";
  if (!profileCorrect && baselineCorrect) return "clear_regression";
  if (!samePoint(profileSelected.point, baselineSelected.point)) return "uncertain";
  return "equivalent";
}

function runProfile(profile, seed) {
  const cases = fixtures();
  const metrics = {
    immediateCaptureOpportunityCount: 0,
    missedImmediateCaptureCount: 0,
    recaptureErrorCount: 0,
    atariRescueOpportunityCount: 0,
    missedAtariRescueCount: 0,
    failedRescueSelectionCount: 0,
    necessaryConnectionOpportunityCount: 0,
    missedNecessaryConnectionCount: 0,
    unnecessaryConnectionPromotionCount: 0,
    selfAtariSelectionCount: 0,
    immediatelyRefutedSelectionCount: 0,
    snapbackRefutationMissCount: 0,
    shortLadderCorrectCount: 0,
    unresolvedLongLadderFallbackCount: 0,
    falseTacticalProtectionCount: 0
  };
  const coverage = {
    positionsWithReading: 0,
    candidatesRead: 0,
    averageCandidatesReadPerPosition: 0,
    opponentRepliesSimulated: 0,
    aiContinuationsSimulated: 0,
    unresolvedReadingRate: 0,
    fallbackCount: 0,
    timeoutCount: 0
  };
  const latencies = [];
  const selectionDiffs = [];
  const errorCases = [];
  const trace = [];
  const terminalClassifications = [];
  const opportunity = {
    totalOpportunityCount: 0,
    candidatePresentInTop8Count: 0,
    candidateActuallyReadCount: 0,
    correctDirectReplyGeneratedCount: 0,
    correctTerminalResultRecognizedCount: 0,
    finalRankChangedCount: 0,
    finalSelectedMoveCorrectedCount: 0
  };
  let unresolved = 0;
  let readResults = 0;

  for (const testCase of cases) {
    const baselineSelected = selectMove(testCase.candidates);
    const profileResult = applyProfile(testCase, profile);
    const selected = profileResult.selected;
    const changed = !samePoint(baselineSelected.point, selected.point);
    const outcome = classifyOutcome(testCase, baselineSelected, selected);
    const selectedReading = selected.localReading || null;
    const expectedCandidate = profileResult.readCandidates.find(item => samePoint(item.point, testCase.expectedMove));
    const expectedReading = expectedCandidate?.localReading || null;
    const baselineRank = rankOf(testCase.candidates, testCase.expectedMove);
    const finalRank = rankOf(profileResult.readCandidates, testCase.expectedMove);
    const candidatePresent = Boolean(expectedCandidate);
    const candidateRead = Boolean(expectedReading);
    const directReplyGenerated = Boolean(expectedReading?.generatedOpponentReplies?.length);
    const terminalRecognized = Boolean(expectedReading?.hardOutcome && expectedReading.hardOutcome !== "unresolved");
    const finalRankChanged = candidateRead && baselineRank !== finalRank;
    const corrected = outcome === "clear_improvement";

    if (["immediate_capture", "atari_rescue", "self_atari", "snapback_refutation", "necessary_connection"].includes(testCase.category)) {
      opportunity.totalOpportunityCount += 1;
      if (candidatePresent) opportunity.candidatePresentInTop8Count += 1;
      if (candidateRead) opportunity.candidateActuallyReadCount += 1;
      if (directReplyGenerated) opportunity.correctDirectReplyGeneratedCount += 1;
      if (terminalRecognized) opportunity.correctTerminalResultRecognizedCount += 1;
      if (finalRankChanged) opportunity.finalRankChangedCount += 1;
      if (corrected) opportunity.finalSelectedMoveCorrectedCount += 1;
    }

    trace.push({
      anonymizedPositionId: testCase.id,
      category: testCase.category,
      candidateMove: testCase.expectedMove,
      baselineRank,
      baselineTier: expectedCandidate?.tier || null,
      baselineScore: testCase.candidates.find(item => samePoint(item.point, testCase.expectedMove))?.combinedScore || null,
      localReadingCategory: testCase.category,
      generatedOpponentReplies: expectedReading?.generatedOpponentReplies || [],
      generatedAiContinuations: expectedReading?.generatedAiContinuations || [],
      terminalBoardResult: expectedReading?.terminalState || {},
      netLocalValue: expectedReading?.netLocalValue || 0,
      confidence: expectedReading?.confidence || 0,
      confidenceLevel: expectedReading?.confidenceLevel || "none",
      refuted: Boolean(expectedReading?.refuted),
      unresolved: expectedReading ? Boolean(expectedReading.unresolved) : true,
      rerankAdjustment: expectedCandidate?.localReadingAdjustment || 0,
      rankAction: expectedCandidate?.localReadingRankAction || { type: "none" },
      finalRank,
      finalSelectedMoveChanged: changed,
      failureCategory: !candidatePresent ? "candidate_not_in_reading_set"
        : !candidateRead ? "opportunity_not_detected"
        : !directReplyGenerated ? "correct_reply_not_generated"
        : !terminalRecognized ? "terminal_state_misclassified"
        : !finalRankChanged ? "rerank_too_small"
        : !changed ? "downstream_selection_ignored_rerank"
        : corrected ? "corrected"
        : "wrong_reply_selected"
    });
    if (expectedReading) {
      terminalClassifications.push({
        anonymizedPositionId: testCase.id,
        category: testCase.category,
        hardOutcome: expectedReading.hardOutcome,
        confidenceLevel: expectedReading.confidenceLevel,
        terminalState: expectedReading.terminalState,
        correct: terminalRecognized
      });
    }

    if (testCase.category === "immediate_capture") {
      metrics.immediateCaptureOpportunityCount += 1;
      if (!samePoint(selected.point, testCase.expectedMove)) metrics.missedImmediateCaptureCount += 1;
    }
    if (testCase.category === "atari_rescue") {
      metrics.atariRescueOpportunityCount += 1;
      if (!samePoint(selected.point, testCase.expectedMove)) metrics.missedAtariRescueCount += 1;
    }
    if (testCase.category === "fake_rescue" && samePoint(selected.point, baselineSelected.point)) metrics.failedRescueSelectionCount += 1;
    if (testCase.category === "necessary_connection") {
      metrics.necessaryConnectionOpportunityCount += 1;
      if (!samePoint(selected.point, testCase.expectedMove)) metrics.missedNecessaryConnectionCount += 1;
    }
    if (testCase.category === "unnecessary_connection" && samePoint(selected.point, { x: 4, y: 3 })) metrics.unnecessaryConnectionPromotionCount += 1;
    if (testCase.category === "self_atari" && samePoint(selected.point, { x: 0, y: 0 })) metrics.selfAtariSelectionCount += 1;
    if (selectedReading?.refuted) metrics.immediatelyRefutedSelectionCount += 1;
    if (testCase.category === "snapback_refutation" && samePoint(selected.point, baselineSelected.point)) metrics.snapbackRefutationMissCount += 1;
    if (testCase.category === "unresolved_long_ladder" && samePoint(selected.point, baselineSelected.point)) metrics.unresolvedLongLadderFallbackCount += 1;
    if (testCase.category === "unnecessary_connection" && selected.verifiedUrgent) metrics.falseTacticalProtectionCount += 1;

    if (profileResult.applied) coverage.positionsWithReading += 1;
    coverage.candidatesRead += profileResult.diagnostics.candidatesRead;
    coverage.opponentRepliesSimulated += profileResult.diagnostics.opponentRepliesSimulated;
    coverage.aiContinuationsSimulated += profileResult.diagnostics.aiContinuationsSimulated;
    coverage.fallbackCount += profileResult.diagnostics.fallbackCount;
    coverage.timeoutCount += profileResult.diagnostics.timeoutCount;
    if (profileResult.applied) latencies.push(profileResult.diagnostics.latencyMs);

    for (const item of profileResult.readCandidates) {
      if (item.localReading) {
        readResults += 1;
        if (item.localReading.unresolved) unresolved += 1;
      }
    }

    if (changed || outcome.includes("regression") || outcome === "uncertain") {
      selectionDiffs.push({
        anonymizedPositionId: testCase.id,
        phase: testCase.phase,
        baselineMove: baselineSelected.point,
        profileMove: selected.point,
        baselineTier: baselineSelected.tier,
        profileTier: selected.tier,
        baselineScore: baselineSelected.combinedScore,
        profileScore: selected.combinedScore,
        localReadingSequence: selectedReading?.sequence || [],
        opponentBestReply: selectedReading?.opponentBestReply || null,
        aiBestContinuation: selectedReading?.aiBestContinuation || null,
        netLocalValue: selectedReading?.netLocalValue || 0,
        confidence: selectedReading?.confidence || 0,
        tacticalReason: selectedReading?.hardOutcome || "none",
        rankBefore: rankOf(testCase.candidates, selected.point),
        rankAfter: rankOf(profileResult.readCandidates, selected.point),
        tierBefore: testCase.candidates.find(item => samePoint(item.point, selected.point))?.tier || null,
        tierAfter: selected.tier || null,
        hardOutcome: selectedReading?.hardOutcome || "none",
        selectedResult: selectedReading?.terminalState || {},
        corrected: outcome === "clear_improvement",
        refuted: Boolean(selectedReading?.refuted),
        unresolved: selectedReading ? Boolean(selectedReading.unresolved) : true,
        outcomeClassification: outcome
      });
    }
    if (outcome.includes("regression") || metrics.immediatelyRefutedSelectionCount > 0) {
      errorCases.push({
        anonymizedPositionId: testCase.id,
        category: testCase.category,
        selectedMove: selected.point,
        expectedMove: testCase.expectedMove,
        outcomeClassification: outcome,
        localReading: selectedReading
      });
    }
  }

  coverage.averageCandidatesReadPerPosition = coverage.positionsWithReading
    ? Number((coverage.candidatesRead / coverage.positionsWithReading).toFixed(4))
    : 0;
  coverage.unresolvedReadingRate = readResults ? Number((unresolved / readResults).toFixed(6)) : 0;
  const opportunityMetrics = {
    ...opportunity,
    tacticalCandidateCoverageRate: opportunity.totalOpportunityCount ? Number((opportunity.candidateActuallyReadCount / opportunity.totalOpportunityCount).toFixed(6)) : 0,
    correctReplyGenerationRate: opportunity.candidateActuallyReadCount ? Number((opportunity.correctDirectReplyGeneratedCount / opportunity.candidateActuallyReadCount).toFixed(6)) : 0,
    terminalClassificationAccuracy: opportunity.candidateActuallyReadCount ? Number((opportunity.correctTerminalResultRecognizedCount / opportunity.candidateActuallyReadCount).toFixed(6)) : 0,
    effectiveRerankRate: opportunity.candidateActuallyReadCount ? Number((opportunity.finalRankChangedCount / opportunity.candidateActuallyReadCount).toFixed(6)) : 0,
    correctedSelectionRate: opportunity.totalOpportunityCount ? Number((opportunity.finalSelectedMoveCorrectedCount / opportunity.totalOpportunityCount).toFixed(6)) : 0
  };

  return {
    profile,
    seed,
    implementation: "GoKidCoachRuleEngine.evaluateLocalSequence",
    usesRealJavaScriptLocalReading: true,
    limits: LIMITS,
    tacticalMetrics: metrics,
    readingCoverage: coverage,
    opportunityMetrics,
    effectivenessTrace: trace,
    terminalClassifications,
    latency: {
      averageReadingLatencyMs: latencies.length ? Number((latencies.reduce((sum, value) => sum + value, 0) / latencies.length).toFixed(4)) : 0,
      p50ReadingLatencyMs: percentile(latencies, 0.5),
      p95ReadingLatencyMs: percentile(latencies, 0.95),
      maximumReadingLatencyMs: latencies.length ? Number(Math.max(...latencies).toFixed(4)) : 0
    },
    changedSelectionCases: selectionDiffs,
    errorCases
  };
}

function main() {
  const args = parseArgs(process.argv);
  const result = runProfile(args.profile, args.seed);
  process.stdout.write(JSON.stringify(result));
}

if (require.main === module) main();

module.exports = {
  runProfile,
  PROFILES,
  LIMITS
};
