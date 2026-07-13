const assert = require("assert");
const evaluator = require("./position-evaluator.js");
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
    moveNumber: 150,
    ruleScore: 120,
    policyScore: 100,
    patternScore: 0,
    shapeScore: 0,
    fusekiScore: 0,
    tacticalScore: 0,
    josekiScore: 0,
    endgameScore: 0,
    positionScore: 0,
    midgameScore: 0,
    openingBookScore: 0,
    combinedScore: 220,
    adjustedScore: 220,
    captures: 0,
    rescueValue: 0,
    connectionValue: 0,
    tacticalPressure: 0,
    endgameValue: 0,
    ...overrides
  };
}

function makeQualityContext(overrides = {}) {
  return {
    moveNumber: 150,
    gamePhase: "endgame",
    companionState: { influence: 0, moveAssessments: [], currentStrength: 50 },
    recentMoveAssessments: [],
    companionPlan: {
      focus: "endgame",
      currentStrength: 50,
      targetAiStrength: 55,
      precisionBand: "balanced",
      candidateDiversity: 3,
      tacticalSharpness: 1,
      territorialPreference: 1,
      openingPrecision: 1,
      endgamePrecision: 1,
      confidenceBase: 0.7,
      confidenceDrop: 0.1,
      targetMoveRank: 1,
      reducePrecision: false,
      increasePrecision: false
    },
    difficultySettings: {
      focusArea: "endgame",
      candidateTopK: 3,
      tacticalStrictness: 1,
      openingBookWeight: 1,
      endgamePrecision: 1
    },
    ...overrides
  };
}

function samePoint(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function testImmediateSafeCaptureNotIgnored() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 1, y: 2 } }, black);
  assert.strictEqual(evidence.urgent, true);
  assert(evidence.immediateCaptureCount > 0);
}

function testAtariRescueAvailable() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 1, y: 2 } }, black);
  assert.strictEqual(evidence.urgent, true);
  assert.strictEqual(evidence.savesAtariGroup, true);
}

function testNecessaryUnsafeConnectionSelectable() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, white);
  setStone(board, { x: 2, y: 3 }, white);
  setStone(board, { x: 3, y: 4 }, white);
  setStone(board, { x: 5, y: 2 }, white);
  setStone(board, { x: 6, y: 3 }, white);
  setStone(board, { x: 5, y: 4 }, white);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 4, y: 3 } }, black);
  assert.strictEqual(evidence.urgent, true);
  assert.strictEqual(evidence.connectsUnsafeGroups, true);
}

function testEquivalentCaptureMovesAccepted() {
  const context = makeQualityContext({ companionPlan: { ...makeQualityContext().companionPlan, reducePrecision: true, targetMoveRank: 2 } });
  const ranked = quality.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { adjustedScore: 500, combinedScore: 450, captures: 1, tacticalScore: 90, tacticalPressure: 2 }),
    makeCandidate({ x: 5, y: 4 }, { adjustedScore: 492, combinedScore: 442, captures: 1, tacticalScore: 85, tacticalPressure: 2 })
  ], context);
  const choice = quality.chooseMoveByQuality(ranked, context);
  assert([{ x: 4, y: 4 }, { x: 5, y: 4 }].some(point => samePoint(choice.point, point)));
}

function testFalseTacticalPatternNotProtected() {
  const board = emptyBoard();
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 9, y: 9 }, primaryLabel: "captureOrRescue", tacticalScore: 100 }, black);
  assert.strictEqual(evidence.urgent, false);
}

function testRandomLegalMovesNotSelectedAtLowDifficulty() {
  const settings = {
    focusArea: "endgame",
    candidateTopK: 4,
    tacticalStrictness: 1,
    openingBookWeight: 1,
    endgamePrecision: 1,
    ruleEngineWeight: 1,
    mistakeTolerance: 16,
    policyTemperature: 0.3,
    randomness: 0
  };
  const adjusted = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 320, policyScore: 180, positionScore: 60 }),
    makeCandidate({ x: 17, y: 17 }, { combinedScore: 40, policyScore: 20, isRandomFlyaway: true }),
    makeCandidate({ x: 0, y: 10 }, { combinedScore: 35, policyScore: 15, isMeaninglessFirstLine: true })
  ], settings);
  assert(adjusted.length > 0);
  assert(!adjusted.some(candidate => candidate.isRandomFlyaway || candidate.isMeaninglessFirstLine));
}

function testRejectedAndSuicideMovesNeverSelected() {
  const context = makeQualityContext();
  const ranked = quality.rankCandidates([
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 600, combinedScore: 560 }),
    makeCandidate({ x: 4, y: 4 }, { adjustedScore: 590, combinedScore: 550, ruleLegal: false, ruleScore: -1000 }),
    makeCandidate({ x: 5, y: 5 }, { adjustedScore: 580, combinedScore: 540, isSuicide: true })
  ], context);
  const choice = quality.chooseMoveByQuality(ranked, context);
  assert(samePoint(choice.point, { x: 3, y: 3 }));
  assert.strictEqual(ranked.groups.rejectedMoves.length, 2);
}

function testMeaninglessFirstLineNotPreferredInOpening() {
  const board = emptyBoard();
  const normal = evaluator.scoreMoveByPosition({ point: { x: 3, y: 3 }, moveNumber: 8, legal: true, ruleLegal: true }, board, black);
  const firstLine = evaluator.scoreMoveByPosition({ point: { x: 0, y: 10 }, moveNumber: 8, legal: true, ruleLegal: true, isMeaninglessFirstLine: true }, board, black);
  assert(normal > firstLine);
}

function testOpeningBookMoveRemainsAvailable() {
  const settings = {
    focusArea: "opening",
    candidateTopK: 3,
    tacticalStrictness: 1,
    openingBookWeight: 1.4,
    endgamePrecision: 1,
    ruleEngineWeight: 1,
    mistakeTolerance: 20,
    policyTemperature: 0.25,
    randomness: 0
  };
  const adjusted = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { moveNumber: 10, openingBookScore: 90, policyScore: 120, combinedScore: 260 }),
    makeCandidate({ x: 9, y: 9 }, { moveNumber: 10, openingBookScore: 0, policyScore: 100, combinedScore: 220 })
  ], settings);
  assert(adjusted.some(candidate => samePoint(candidate.point, { x: 3, y: 3 })));
  assert(samePoint(adjusted[0].point, { x: 3, y: 3 }));
}

function testMeaningfulYoseBeatsDame() {
  const board = emptyBoard();
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, white);
  const yose = evaluator.scoreMoveByPosition({ point: { x: 1, y: 1 }, moveNumber: 155, legal: true, ruleLegal: true, territoryValue: 8, endgameScore: 12 }, board, black);
  const dame = evaluator.scoreMoveByPosition({ point: { x: 9, y: 9 }, moveNumber: 155, legal: true, ruleLegal: true }, board, black);
  assert(yose > dame);
}

function testStableDefenseNotPreferredOverMeaningfulMove() {
  const context = makeQualityContext();
  const ranked = quality.rankCandidates([
    makeCandidate({ x: 5, y: 4 }, { adjustedScore: 430, combinedScore: 390, redundantReinforcement: true, endgameCategory: "redundant_reinforcement", endgameScore: 5 }),
    makeCandidate({ x: 1, y: 1 }, { adjustedScore: 500, combinedScore: 450, endgameScore: 75, positionScore: 45 })
  ], context);
  const choice = quality.chooseMoveByQuality(ranked, context);
  assert(samePoint(choice.point, { x: 1, y: 1 }));
}

function testSelectableDifficultiesStayMeaningful() {
  const profiles = [
    { scores: { opening: 35, capture: 35, atari: 35, connection: 35, lifeDeath: 35, ladder: 35, territory: 35, endgame: 35, blunderRate: 65, readingDepth: 35 } },
    { scores: { opening: 55, capture: 55, atari: 55, connection: 55, lifeDeath: 55, ladder: 55, territory: 55, endgame: 55, blunderRate: 45, readingDepth: 55 } },
    { scores: { opening: 80, capture: 80, atari: 80, connection: 80, lifeDeath: 80, ladder: 80, territory: 80, endgame: 80, blunderRate: 20, readingDepth: 80 } }
  ];
  for (const profile of profiles) {
    const settings = difficulty.getDifficultySettings(profile, [true, false, true], { focus: "endgame", currentStrength: 55 });
    settings.randomness = 0;
    const adjusted = difficulty.adjustMoveCandidates([
      makeCandidate({ x: 3, y: 3 }, { combinedScore: 300, endgameScore: 50 }),
      makeCandidate({ x: 17, y: 17 }, { combinedScore: 40, isRandomFlyaway: true }),
      makeCandidate({ x: 0, y: 10 }, { combinedScore: 30, isMeaninglessFirstLine: true })
    ], settings);
    assert(adjusted.length > 0);
    assert(!adjusted.some(candidate => candidate.isRandomFlyaway || candidate.isMeaninglessFirstLine));
  }
}

function testDifficultySofteningKeepsUrgentSafeCandidate() {
  const settings = {
    focusArea: "capture",
    candidateTopK: 4,
    tacticalStrictness: 1.25,
    openingBookWeight: 1,
    endgamePrecision: 1,
    ruleEngineWeight: 1,
    mistakeTolerance: 30,
    policyTemperature: 0.25,
    randomness: 0
  };
  const adjusted = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 4, y: 4 }, { combinedScore: 420, captures: 1, tacticalScore: 90, tacticalPressure: 2 }),
    makeCandidate({ x: 5, y: 4 }, { combinedScore: 400, captures: 1, tacticalScore: 80, tacticalPressure: 2 }),
    makeCandidate({ x: 9, y: 9 }, { combinedScore: 370 }),
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 500, ruleLegal: false, ruleScore: -1000 })
  ], settings);
  assert(adjusted.some(candidate => Number(candidate.captures) > 0));
  assert(!adjusted.some(candidate => candidate.ruleLegal === false));
}

function run() {
  testImmediateSafeCaptureNotIgnored();
  testAtariRescueAvailable();
  testNecessaryUnsafeConnectionSelectable();
  testEquivalentCaptureMovesAccepted();
  testFalseTacticalPatternNotProtected();
  testRandomLegalMovesNotSelectedAtLowDifficulty();
  testRejectedAndSuicideMovesNeverSelected();
  testMeaninglessFirstLineNotPreferredInOpening();
  testOpeningBookMoveRemainsAvailable();
  testMeaningfulYoseBeatsDame();
  testStableDefenseNotPreferredOverMeaningfulMove();
  testSelectableDifficultiesStayMeaningful();
  testDifficultySofteningKeepsUrgentSafeCandidate();
  console.log("test-v1-release-guardrails: ok");
}

run();
