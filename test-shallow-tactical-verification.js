const assert = require("assert");
const ruleEngine = require("./rule-engine.js");
const difficulty = require("./difficulty-controller.js");
const quality = require("./move-quality-controller.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function makeCandidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    moveNumber: 80,
    policyScore: 100,
    combinedScore: 200,
    fusedPolicyScore: 200,
    adjustedScore: 200,
    ruleScore: 100,
    confidence: 0.5,
    captures: 0,
    rescueValue: 0,
    connectionValue: 0,
    ...overrides
  };
}

function samePoint(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function testSimulationMatchesRuleCapture() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const simple = ruleEngine.simulateMove(board, { x: 1, y: 2 }, black, []);
  const detailed = ruleEngine.simulateMoveDetailed(board, { x: 1, y: 2 }, black, {});
  assert.strictEqual(simple.legal, true);
  assert.strictEqual(detailed.legal, true);
  assert.strictEqual(simple.captures, detailed.capturedStoneCount);
  assert.strictEqual(detailed.boardAfter[1][1], empty);
}

function testSuicideAndKoHandlingMatchRule() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 1, y: 2 }, black);
  const suicide = ruleEngine.simulateMoveDetailed(board, { x: 1, y: 1 }, white, {});
  assert.strictEqual(suicide.legal, false);
  assert.strictEqual(suicide.reason, "suicide");

  const repeatBoard = emptyBoard();
  const legal = ruleEngine.simulateMove(repeatBoard, { x: 0, y: 0 }, white, []);
  assert.strictEqual(legal.legal, true);
  const repeat = ruleEngine.simulateMove(repeatBoard, { x: 0, y: 0 }, white, [ruleEngine.boardHash(legal.board)]);
  assert.strictEqual(repeat.legal, false);
  assert.strictEqual(repeat.reason, "ko_or_repeat");
}

function testRealImmediateCaptureVerified() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = ruleEngine.verifyShallowTacticalCandidate(board, makeCandidate({ x: 1, y: 2 }, { captures: 1 }), black);
  assert.strictEqual(result.verifiedCapture, true);
  assert.strictEqual(result.captureVerified, true);
  assert.strictEqual(result.capturedStoneCount, 1);
}

function testFakeCaptureRejected() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  const result = ruleEngine.verifyShallowTacticalCandidate(board, makeCandidate({ x: 1, y: 2 }, { captures: 1 }), black);
  assert.strictEqual(result.verifiedCapture, false);
  assert.strictEqual(result.capturedStoneCount, 0);
}

function testValidAtariRescueVerified() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const result = ruleEngine.verifyShallowTacticalCandidate(board, makeCandidate({ x: 1, y: 2 }, { rescueValue: 1 }), black);
  assert.strictEqual(result.verifiedRescue, true);
  assert.strictEqual(result.rescueVerified, true);
  assert(result.libertiesAfter > result.libertiesBefore);
}

function testFakeRescueRefuted() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  setStone(board, { x: 0, y: 2 }, white);
  setStone(board, { x: 2, y: 2 }, white);
  const result = ruleEngine.verifyShallowTacticalCandidate(board, makeCandidate({ x: 1, y: 2 }, { rescueValue: 1 }), black);
  assert.strictEqual(result.verifiedRescue, false);
  assert.strictEqual(result.immediatelyRefuted, true);
}

function testNecessaryConnectionVerifiedAndSafeConnectionIgnored() {
  const unsafe = emptyBoard();
  setStone(unsafe, { x: 3, y: 3 }, black);
  setStone(unsafe, { x: 5, y: 3 }, black);
  setStone(unsafe, { x: 3, y: 2 }, white);
  setStone(unsafe, { x: 2, y: 3 }, white);
  setStone(unsafe, { x: 3, y: 4 }, white);
  setStone(unsafe, { x: 5, y: 2 }, white);
  setStone(unsafe, { x: 6, y: 3 }, white);
  setStone(unsafe, { x: 5, y: 4 }, white);
  const urgent = ruleEngine.verifyShallowTacticalCandidate(unsafe, makeCandidate({ x: 4, y: 3 }, { connectionValue: 2 }), black);
  assert.strictEqual(urgent.verifiedNecessaryConnection, true);

  const safe = emptyBoard();
  setStone(safe, { x: 3, y: 3 }, black);
  setStone(safe, { x: 3, y: 4 }, black);
  setStone(safe, { x: 5, y: 3 }, black);
  setStone(safe, { x: 5, y: 4 }, black);
  const optional = ruleEngine.verifyShallowTacticalCandidate(safe, makeCandidate({ x: 4, y: 3 }, { connectionValue: 2 }), black);
  assert.strictEqual(optional.verifiedNecessaryConnection, false);
}

function testRecaptureRiskAndSelfAtariCollapseDetected() {
  const capture = emptyBoard();
  setStone(capture, { x: 1, y: 1 }, white);
  setStone(capture, { x: 0, y: 1 }, black);
  setStone(capture, { x: 1, y: 0 }, black);
  setStone(capture, { x: 2, y: 1 }, black);
  setStone(capture, { x: 0, y: 2 }, white);
  setStone(capture, { x: 2, y: 2 }, white);
  const snapbackLike = ruleEngine.verifyShallowTacticalCandidate(capture, makeCandidate({ x: 1, y: 2 }, { captures: 1 }), black);
  assert(snapbackLike.immediateRecaptureRisk || snapbackLike.immediatelyRefuted);

  const selfAtari = emptyBoard();
  setStone(selfAtari, { x: 0, y: 1 }, white);
  setStone(selfAtari, { x: 1, y: 0 }, white);
  const collapse = ruleEngine.verifyShallowTacticalCandidate(selfAtari, makeCandidate({ x: 0, y: 0 }), black);
  assert.strictEqual(collapse.legal, false);
}

function testVerificationLayerProtectsUrgentAndFiltersRefuted() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const result = ruleEngine.applyShallowTacticalVerification([
    makeCandidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 90, fusedPolicyScore: 90 }),
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 200, fusedPolicyScore: 200 })
  ], board, black, { timeBudgetMs: 80 });
  const urgent = result.candidates.find(candidate => samePoint(candidate.point, { x: 1, y: 2 }));
  assert.strictEqual(urgent.verifiedUrgent, true);
  assert(urgent.combinedScore > 90);
}

function testImmediatelyRefutedStatusIsDiagnosticOnlyUntilAccepted() {
  const context = {
    companionPlan: { focus: "endgame", targetMoveRank: 1, candidateDiversity: 3 },
    difficultySettings: { focusArea: "endgame" },
    companionState: {},
    recentMoveAssessments: [],
    moveNumber: 150
  };
  const ranked = quality.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { adjustedScore: 500, combinedScore: 450, immediatelyRefuted: true }),
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 490, combinedScore: 440 })
  ], context);
  assert.strictEqual(ranked.groups.rejectedMoves.length, 0);
  assert(ranked.ranked.some(candidate => candidate.immediatelyRefuted));
}

function testLowDifficultyBaselineDoesNotConsumeUnacceptedVerificationFlags() {
  const settings = {
    focusArea: "capture",
    candidateTopK: 4,
    tacticalStrictness: 1.2,
    openingBookWeight: 1,
    endgamePrecision: 1,
    ruleEngineWeight: 1,
    mistakeTolerance: 30,
    policyTemperature: 0.25,
    randomness: 0
  };
  const flagged = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 4, y: 4 }, { captures: 1, tacticalPressure: 2, combinedScore: 400, adjustedScore: 400, verifiedUrgent: true }),
    makeCandidate({ x: 5, y: 5 }, { combinedScore: 500, adjustedScore: 500, immediatelyRefuted: true }),
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 380, adjustedScore: 380 })
  ], settings);
  const unflagged = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 4, y: 4 }, { captures: 1, tacticalPressure: 2, combinedScore: 400, adjustedScore: 400 }),
    makeCandidate({ x: 5, y: 5 }, { combinedScore: 500, adjustedScore: 500 }),
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 380, adjustedScore: 380 })
  ], settings);
  assert.deepStrictEqual(flagged.map(candidate => candidate.point), unflagged.map(candidate => candidate.point));
}

function testBudgetFallbackAndDeterminism() {
  const board = emptyBoard();
  const candidates = Array.from({ length: 20 }, (_, index) => makeCandidate({ x: index % 19, y: Math.floor(index / 19) }, { combinedScore: 200 - index }));
  const first = ruleEngine.applyShallowTacticalVerification(candidates, board, black, { timeBudgetMs: 0.001 });
  const second = ruleEngine.applyShallowTacticalVerification(candidates, board, black, { timeBudgetMs: 0.001 });
  assert(first.diagnostics.candidatesVerified <= 16);
  assert.deepStrictEqual(
    first.candidates.map(candidate => candidate.shallowVerificationStatus),
    second.candidates.map(candidate => candidate.shallowVerificationStatus)
  );
}

function testCompleteSimulationStable() {
  const board = emptyBoard();
  let color = black;
  for (let i = 0; i < 250; i += 1) {
    const point = { x: (i * 7) % 19, y: Math.floor((i * 11) % 361 / 19) };
    const result = ruleEngine.simulateMoveDetailed(board, point, color, {});
    if (result.legal) {
      for (let y = 0; y < 19; y += 1) {
        for (let x = 0; x < 19; x += 1) board[y][x] = result.boardAfter[y][x];
      }
      color = color === black ? white : black;
    }
  }
  assert.strictEqual(board.length, 19);
}

function run() {
  testSimulationMatchesRuleCapture();
  testSuicideAndKoHandlingMatchRule();
  testRealImmediateCaptureVerified();
  testFakeCaptureRejected();
  testValidAtariRescueVerified();
  testFakeRescueRefuted();
  testNecessaryConnectionVerifiedAndSafeConnectionIgnored();
  testRecaptureRiskAndSelfAtariCollapseDetected();
  testVerificationLayerProtectsUrgentAndFiltersRefuted();
  testImmediatelyRefutedStatusIsDiagnosticOnlyUntilAccepted();
  testLowDifficultyBaselineDoesNotConsumeUnacceptedVerificationFlags();
  testBudgetFallbackAndDeterminism();
  testCompleteSimulationStable();
  console.log("test-shallow-tactical-verification: ok");
}

run();
