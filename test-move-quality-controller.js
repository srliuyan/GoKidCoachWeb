const assert = require("assert");
const controller = require("./move-quality-controller.js");

function makeCompanionState(assessments = []) {
  const avg = assessments.length
    ? assessments.reduce((sum, item) => {
      const map = { good: 0.18, acceptable: 0.07, inaccurate: -0.06, mistake: -0.14, blunder: -0.22 };
      return sum + (map[item?.quality] || 0);
    }, 0) / assessments.length
    : 0;
  return {
    influence: avg,
    moveAssessments: assessments,
    lastAssessment: assessments[assessments.length - 1] || null,
    currentStrength: 52
  };
}

function makeContext(overrides = {}) {
  return {
    companionState: makeCompanionState(),
    recentMoveAssessments: [],
    companionPlan: {
      focus: "opening",
      currentStrength: 52,
      targetAiStrength: 57,
      precisionBand: "balanced",
      candidateDiversity: 3,
      tacticalSharpness: 1,
      territorialPreference: 1,
      openingPrecision: 1.1,
      endgamePrecision: 1,
      confidenceBase: 0.7,
      confidenceDrop: 0.1,
      targetMoveRank: 2,
      reducePrecision: false,
      increasePrecision: false
    },
    difficultySettings: {
      focusArea: "opening",
      candidateTopK: 3,
      tacticalStrictness: 1,
      openingBookWeight: 1.1,
      endgamePrecision: 1
    },
    moveNumber: 24,
    ...overrides
  };
}

function makeCandidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    moveNumber: 24,
    openingBookScore: 20,
    ruleScore: 150,
    policyScore: 200,
    combinedScore: 370,
    adjustedScore: 420,
    captures: 0,
    ownLiberties: 3,
    tacticalPressure: 0,
    rescueValue: 0,
    connectionValue: 0,
    cutOpportunity: 0,
    lifeDeathValue: 0,
    ladderValue: 0,
    territoryValue: 1,
    endgameValue: 0,
    obviousGiveaway: false,
    isSuicide: false,
    isMeaninglessFirstLine: false,
    isRandomFlyaway: false,
    ...overrides
  };
}

function testClassifyBuckets() {
  const context = makeContext();
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 500, combinedScore: 450 }),
    makeCandidate({ x: 4, y: 3 }, { adjustedScore: 488, combinedScore: 438 }),
    makeCandidate({ x: 5, y: 3 }, { adjustedScore: 462, combinedScore: 412 }),
    makeCandidate({ x: 6, y: 3 }, { adjustedScore: 405, combinedScore: 350 }),
    makeCandidate({ x: 7, y: 3 }, { adjustedScore: 250, combinedScore: 190 })
  ], context);
  assert.strictEqual(ranked.groups.bestMove.length, 1);
  assert(ranked.groups.strongMoves.length >= 1);
  assert(ranked.groups.goodMoves.length >= 1);
  assert(ranked.groups.acceptableMoves.length >= 1);
  assert(ranked.groups.weakButLegalMoves.length >= 1);
}

function testNeverChooseRejectedWhenSoft() {
  const context = makeContext({
    companionState: makeCompanionState([{ quality: "mistake" }, { quality: "blunder" }, { quality: "mistake" }]),
    recentMoveAssessments: [{ quality: "mistake" }, { quality: "blunder" }, { quality: "mistake" }],
    companionPlan: {
      ...makeContext().companionPlan,
      reducePrecision: true,
      targetMoveRank: 2.8,
      precisionBand: "soft"
    }
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 500, combinedScore: 450 }),
    makeCandidate({ x: 4, y: 3 }, { adjustedScore: 476, combinedScore: 428 }),
    makeCandidate({ x: 5, y: 3 }, { adjustedScore: 438, combinedScore: 388 }),
    makeCandidate({ x: 0, y: 0 }, { adjustedScore: 520, combinedScore: 470, isSuicide: true }),
    makeCandidate({ x: 1, y: 0 }, { adjustedScore: 515, combinedScore: 465, obviousGiveaway: true })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert(choice);
  assert.notStrictEqual(choice.moveQualityBucket, "rejectedMoves");
  assert.strictEqual(choice.isSuicide, false);
  assert.strictEqual(choice.obviousGiveaway, false);
}

function testGoodStreakGraduallyStrengthensAI() {
  const assessments = Array.from({ length: 10 }, () => ({ quality: "good" }));
  const smooth = controller.smoothStrengthAdjustment(makeCompanionState(assessments), assessments);
  assert(smooth.smoothedInfluence > 0);
  assert(smooth.targetMoveRankDelta < 0);
}

function testMistakeStreakGraduallySoftensAI() {
  const assessments = Array.from({ length: 10 }, () => ({ quality: "mistake" }));
  const smooth = controller.smoothStrengthAdjustment(makeCompanionState(assessments), assessments);
  assert(smooth.smoothedInfluence < 0);
  assert(smooth.targetMoveRankDelta > 0);
}

function testSingleBlunderDoesNotOverreact() {
  const assessments = [{ quality: "good" }, { quality: "good" }, { quality: "blunder" }];
  const smooth = controller.smoothStrengthAdjustment(makeCompanionState(assessments), assessments);
  assert(smooth.smoothedInfluence > -0.2);
  assert(Math.abs(smooth.targetMoveRankDelta) < 0.45);
}

function testRuleRejectedNeverChosen() {
  const context = makeContext();
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 500, combinedScore: 450 }),
    makeCandidate({ x: 4, y: 3 }, { adjustedScore: 490, combinedScore: 440, ruleLegal: false }),
    makeCandidate({ x: 5, y: 3 }, { adjustedScore: 480, combinedScore: 430, ruleScore: -1000 })
  ], context);
  assert.strictEqual(ranked.groups.rejectedMoves.length, 2);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert(choice);
  assert.strictEqual(choice.point.x, 3);
  assert.strictEqual(choice.point.y, 3);
}

function testChildCalibrationMayChooseSecondBestYoseButNotDame() {
  const context = makeContext({
    moveNumber: 150,
    companionState: makeCompanionState([{ quality: "mistake" }, { quality: "mistake" }]),
    recentMoveAssessments: [{ quality: "mistake" }, { quality: "mistake" }],
    companionPlan: {
      ...makeContext().companionPlan,
      focus: "endgame",
      reducePrecision: true,
      targetMoveRank: 2,
      precisionBand: "soft"
    },
    difficultySettings: {
      ...makeContext().difficultySettings,
      focusArea: "endgame"
    },
    gamePhase: "endgame"
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 1, y: 1 }, { moveNumber: 150, adjustedScore: 500, combinedScore: 450, endgameScore: 70, positionScore: 45, endgamePattern: { goteLike: true } }),
    makeCandidate({ x: 2, y: 1 }, { moveNumber: 150, adjustedScore: 486, combinedScore: 438, endgameScore: 58, positionScore: 38, endgamePattern: { goteLike: true } }),
    makeCandidate({ x: 10, y: 10 }, { moveNumber: 150, adjustedScore: 482, combinedScore: 434, endgameScore: 0, positionScore: 0, endgamePattern: { dame: true } })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert(choice);
  assert.notDeepStrictEqual(choice.point, { x: 10, y: 10 });
  assert([1, 2].includes(choice.point.x));
}

function testLowConfidenceTacticalCannotDominateSettledEndgame() {
  const context = makeContext({ moveNumber: 155, gamePhase: "endgame" });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 9, y: 9 }, { moveNumber: 155, adjustedScore: 510, combinedScore: 450, tacticalPressure: 0, tacticalScore: 80, confidence: 0.2, endgamePattern: { dame: true } }),
    makeCandidate({ x: 1, y: 1 }, { moveNumber: 155, adjustedScore: 500, combinedScore: 445, endgameScore: 70, positionScore: 60, endgamePattern: { goteLike: true } })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert.deepStrictEqual(choice.point, { x: 1, y: 1 });
}

function testRedundantConnectionCannotBeatLargeYose() {
  const context = makeContext({ moveNumber: 155, gamePhase: "endgame" });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { moveNumber: 155, adjustedScore: 500, combinedScore: 450, endgameScore: 10, redundantReinforcement: true, endgameCategory: "redundant_reinforcement" }),
    makeCandidate({ x: 1, y: 1 }, { moveNumber: 155, adjustedScore: 490, combinedScore: 440, endgameScore: 75, positionScore: 55, endgamePattern: { goteLike: true } })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert.deepStrictEqual(choice.point, { x: 1, y: 1 });
}

function testEvaluationOnlyCapFlagsDoNotAlterRuntimeChoice() {
  const context = makeContext({
    moveNumber: 155,
    gamePhase: "endgame",
    companionPlan: { ...makeContext().companionPlan, targetMoveRank: 1 }
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 8, y: 8 }, {
      moveNumber: 155,
      adjustedScore: 505,
      combinedScore: 450,
      tacticalScore: 90,
      tacticalPressure: 1,
      confidence: 0.4,
      localNonUrgentTacticalCandidate: true,
      tacticalCapApplied: true
    }),
    makeCandidate({ x: 1, y: 1 }, {
      moveNumber: 155,
      adjustedScore: 490,
      combinedScore: 440,
      endgameScore: 60,
      positionScore: 45,
      endgamePattern: { goteLike: true }
    })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert.deepStrictEqual(choice.point, { x: 8, y: 8 });
}

function testImmediateCaptureNeverCappedByRuntime() {
  const context = makeContext({
    moveNumber: 150,
    gamePhase: "endgame",
    companionPlan: { ...makeContext().companionPlan, targetMoveRank: 1 }
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { moveNumber: 150, adjustedScore: 500, combinedScore: 450, captures: 1, tacticalScore: 80, tacticalPressure: 2 }),
    makeCandidate({ x: 1, y: 1 }, { moveNumber: 150, adjustedScore: 492, combinedScore: 440, endgameScore: 80, positionScore: 55 })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert.deepStrictEqual(choice.point, { x: 4, y: 4 });
}

function testSofteningCannotChooseUnsafeOverUrgent() {
  const context = makeContext({
    moveNumber: 150,
    gamePhase: "endgame",
    companionPlan: { ...makeContext().companionPlan, reducePrecision: true, targetMoveRank: 3, precisionBand: "soft" }
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { moveNumber: 150, adjustedScore: 500, combinedScore: 450, captures: 1, tacticalScore: 90, tacticalPressure: 2 }),
    makeCandidate({ x: 5, y: 4 }, { moveNumber: 150, adjustedScore: 482, combinedScore: 432, captures: 1, tacticalScore: 82, tacticalPressure: 2 }),
    makeCandidate({ x: 10, y: 10 }, { moveNumber: 150, adjustedScore: 498, combinedScore: 448, ruleLegal: false, ruleScore: -1000 }),
    makeCandidate({ x: 11, y: 10 }, { moveNumber: 150, adjustedScore: 496, combinedScore: 446, obviousGiveaway: true })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert([{ x: 4, y: 4 }, { x: 5, y: 4 }].some(point => point.x === choice.point.x && point.y === choice.point.y));
}

function testLowerDifficultyMayChooseEquivalentUrgentSolution() {
  const context = makeContext({
    moveNumber: 150,
    gamePhase: "endgame",
    companionPlan: { ...makeContext().companionPlan, reducePrecision: true, targetMoveRank: 2, precisionBand: "soft" }
  });
  const ranked = controller.rankCandidates([
    makeCandidate({ x: 4, y: 4 }, { moveNumber: 150, adjustedScore: 500, combinedScore: 450, captures: 1, tacticalScore: 90, tacticalPressure: 2 }),
    makeCandidate({ x: 5, y: 4 }, { moveNumber: 150, adjustedScore: 492, combinedScore: 442, captures: 1, tacticalScore: 88, tacticalPressure: 2 })
  ], context);
  const choice = controller.chooseMoveByQuality(ranked, context);
  assert([{ x: 4, y: 4 }, { x: 5, y: 4 }].some(point => point.x === choice.point.x && point.y === choice.point.y));
}

function run() {
  testClassifyBuckets();
  testNeverChooseRejectedWhenSoft();
  testGoodStreakGraduallyStrengthensAI();
  testMistakeStreakGraduallySoftensAI();
  testSingleBlunderDoesNotOverreact();
  testRuleRejectedNeverChosen();
  testChildCalibrationMayChooseSecondBestYoseButNotDame();
  testLowConfidenceTacticalCannotDominateSettledEndgame();
  testRedundantConnectionCannotBeatLargeYose();
  testEvaluationOnlyCapFlagsDoNotAlterRuntimeChoice();
  testImmediateCaptureNeverCappedByRuntime();
  testSofteningCannotChooseUnsafeOverUrgent();
  testLowerDifficultyMayChooseEquivalentUrgentSolution();
  console.log("test-move-quality-controller: ok");
}

run();
