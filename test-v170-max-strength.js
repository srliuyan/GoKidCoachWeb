const assert = require("assert");
const difficulty = require("./difficulty-controller.js");
const quality = require("./move-quality-controller.js");
const product = require("./product-support.js");

function candidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    moveNumber: 80,
    combinedScore: 300,
    adjustedScore: 300,
    policyScore: 160,
    ruleScore: 100,
    ownLiberties: 3,
    ...overrides
  };
}

function maxSettings(overrides = {}) {
  return {
    releaseDifficultyMode: "MAX_STRENGTH_FIXED",
    focusArea: "max",
    candidateTopK: 1,
    mistakeTolerance: 0,
    randomness: 0,
    policyTemperature: 0,
    ruleEngineWeight: 1,
    tacticalStrictness: 1,
    openingBookWeight: 1,
    endgamePrecision: 1,
    ...overrides
  };
}

function context(overrides = {}) {
  return {
    companionState: { influence: -0.8, moveAssessments: [{ quality: "blunder" }, { quality: "mistake" }] },
    recentMoveAssessments: [{ quality: "blunder" }, { quality: "mistake" }],
    companionPlan: { reducePrecision: true, targetMoveRank: 3, precisionBand: "soft", candidateDiversity: 4 },
    difficultySettings: maxSettings(),
    moveNumber: 80,
    ...overrides
  };
}

function testMappingAndFlags() {
  assert.strictEqual(product.normalizeDifficultyMode("advanced"), "MAX_STRENGTH_FIXED");
  assert.strictEqual(product.normalizeDifficultyMode(980), "MAX_STRENGTH_FIXED");
  assert.strictEqual(product.difficultyModeConfig("advanced").level, 980);
  assert.strictEqual(product.isMaxStrengthMode("advanced"), true);
  const summary = product.diagnosticSummary({
    difficultyMode: "MAX_STRENGTH_FIXED",
    adaptiveWeakeningEnabled: false,
    randomSofteningEnabled: false,
    selectedCandidateFinalRank: 1,
    selectedCandidateTier: "bestMove"
  });
  assert.strictEqual(summary.difficultyMode, "MAX_STRENGTH_FIXED");
  assert.strictEqual(summary.adaptiveWeakeningEnabled, false);
  assert.strictEqual(summary.randomSofteningEnabled, false);
  assert.strictEqual(summary.selectedCandidateFinalRank, 1);
  assert.strictEqual(summary.selectedCandidateTier, "bestMove");
}

function testNoRandomOrTemperatureSelection() {
  const settings = maxSettings({ randomness: 1, policyTemperature: 1 });
  const adjusted = difficulty.adjustMoveCandidates([
    candidate({ x: 10, y: 10 }, { combinedScore: 500, policyScore: 260 }),
    candidate({ x: 3, y: 3 }, { combinedScore: 500, policyScore: 260 }),
    candidate({ x: 4, y: 4 }, { combinedScore: 490, policyScore: 250 })
  ], settings);
  for (let i = 0; i < 20; i += 1) {
    assert.deepStrictEqual(difficulty.chooseAdaptiveMove(adjusted, settings).point, { x: 3, y: 3 });
  }
}

function testNoAcceptableOrGoodSubstitution() {
  const ranked = quality.rankCandidates([
    candidate({ x: 3, y: 3 }, { adjustedScore: 520, combinedScore: 520 }),
    candidate({ x: 4, y: 4 }, { adjustedScore: 480, combinedScore: 480 }),
    candidate({ x: 5, y: 5 }, { adjustedScore: 430, combinedScore: 430 })
  ], context());
  const choice = quality.chooseMoveByQuality(ranked, context());
  assert.deepStrictEqual(choice.point, { x: 3, y: 3 });
  assert.strictEqual(ranked.context.maxStrengthFixed, true);
  assert.strictEqual(ranked.context.reducePrecision, false);
}

function testRejectedAndFallbackAvoidance() {
  const ranked = quality.rankCandidates([
    candidate({ x: 2, y: 2 }, { adjustedScore: 900, combinedScore: 900, ruleLegal: false }),
    candidate({ x: 3, y: 3 }, { adjustedScore: 520, combinedScore: 520 }),
    candidate({ x: 4, y: 4 }, { adjustedScore: 500, combinedScore: 500 })
  ], context());
  const choice = quality.chooseMoveByQuality(ranked, context());
  assert.deepStrictEqual(choice.point, { x: 3, y: 3 });
  assert.notStrictEqual(choice.moveQualityBucket, "rejectedMoves");
}

function testLowerModesRetainAdaptiveBehavior() {
  const softContext = {
    ...context(),
    difficultySettings: { ...maxSettings(), releaseDifficultyMode: "adaptive", candidateTopK: 3 },
    companionPlan: { reducePrecision: true, targetMoveRank: 3, precisionBand: "soft", candidateDiversity: 4 }
  };
  const ranked = quality.rankCandidates([
    candidate({ x: 3, y: 3 }, { adjustedScore: 520, combinedScore: 520 }),
    candidate({ x: 4, y: 4 }, { adjustedScore: 508, combinedScore: 508 }),
    candidate({ x: 5, y: 5 }, { adjustedScore: 496, combinedScore: 496 })
  ], softContext);
  const choice = quality.chooseMoveByQuality(ranked, softContext);
  assert(choice);
  assert.notStrictEqual(ranked.context.maxStrengthFixed, true);
}

function run() {
  testMappingAndFlags();
  testNoRandomOrTemperatureSelection();
  testNoAcceptableOrGoodSubstitution();
  testRejectedAndFallbackAvoidance();
  testLowerModesRetainAdaptiveBehavior();
  console.log("test-v170-max-strength: ok");
}

run();
