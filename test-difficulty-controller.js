const assert = require("assert");
const studentModel = require("./student-model.js");
const controller = require("./difficulty-controller.js");

function makeProfile(overrides = {}) {
  return {
    childId: "test-child",
    gamesPlayed: 0,
    recentResults: [],
    scores: {
      ...studentModel.defaultScores,
      ...overrides
    }
  };
}

function makeCandidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    moveNumber: 12,
    openingBookScore: 40,
    ruleScore: 120,
    policyScore: 180,
    combinedScore: 340,
    tacticalPressure: 0,
    rescueValue: 0,
    connectionValue: 0,
    endgameValue: 0,
    ownLiberties: 3,
    obviousGiveaway: false,
    isSuicide: false,
    isMeaninglessFirstLine: false,
    isRandomFlyaway: false,
    ...overrides
  };
}

function testThreeWinsIncreaseDifficulty() {
  const profile = makeProfile();
  const harder = controller.getDifficultySettings(profile, [true, true, true, false]);
  const easier = controller.getDifficultySettings(profile, [false, false, false, true]);
  assert(harder.ruleEngineWeight > easier.ruleEngineWeight);
  assert(harder.tacticalStrictness > easier.tacticalStrictness);
  assert(harder.randomness < easier.randomness);
  assert(harder.candidateTopK <= easier.candidateTopK);
}

function testThreeLossesReduceDifficulty() {
  const profile = makeProfile();
  const baseline = controller.getDifficultySettings(profile, [true, false, true, false]);
  const softer = controller.getDifficultySettings(profile, [false, false, false, true]);
  assert(softer.mistakeTolerance > baseline.mistakeTolerance);
  assert(softer.randomness >= baseline.randomness);
  assert(softer.suggestedAiStrength < baseline.suggestedAiStrength);
}

function testEasyModeStillRejectsBadMoves() {
  const profile = makeProfile();
  const settings = controller.getDifficultySettings(profile, [false, false, false]);
  const candidates = [
    makeCandidate({ x: 3, y: 3 }, { adjustedScore: 0 }),
    makeCandidate({ x: 0, y: 5 }, {
      combinedScore: 400,
      ruleScore: -1200,
      obviousGiveaway: true,
      isMeaninglessFirstLine: true
    }),
    makeCandidate({ x: 10, y: 10 }, {
      combinedScore: 390,
      isSuicide: true
    })
  ];
  const adjusted = controller.adjustMoveCandidates(candidates, settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 3 });
}

function testLifeDeathWeaknessIncreasesTacticalTraining() {
  const tacticalWeak = makeProfile({ lifeDeath: 25, capture: 30, atari: 28 });
  const stable = makeProfile({ lifeDeath: 70, capture: 72, atari: 68 });
  const tacticalSettings = controller.getDifficultySettings(tacticalWeak, [true, false, true]);
  const stableSettings = controller.getDifficultySettings(stable, [true, false, true]);
  assert(tacticalSettings.weakAreas.includes("lifeDeath") || tacticalSettings.weakAreas.includes("capture"));
  assert(tacticalSettings.tacticalStrictness > stableSettings.tacticalStrictness);
}

function testRuleRejectedMovesRemainRejectedAfterDifficulty() {
  const settings = controller.getDifficultySettings(makeProfile({ capture: 25 }), [false, false, false]);
  const adjusted = controller.adjustMoveCandidates([
    makeCandidate({ x: 4, y: 4 }, { combinedScore: 320, captures: 1, tacticalPressure: 2 }),
    makeCandidate({ x: 5, y: 5 }, { combinedScore: 999, ruleLegal: false, ruleScore: -1000 })
  ], settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 4, y: 4 });
}

function testOpeningWeaknessUsesOpeningBookMore() {
  const openingWeak = makeProfile({ opening: 22, territory: 60, endgame: 60 });
  const balanced = makeProfile({ opening: 68, territory: 60, endgame: 60 });
  const openingSettings = controller.getDifficultySettings(openingWeak, [true, false, true]);
  const balancedSettings = controller.getDifficultySettings(balanced, [true, false, true]);
  assert.strictEqual(openingSettings.focusArea, "opening");
  assert(openingSettings.openingBookWeight > balancedSettings.openingBookWeight);
  assert(openingSettings.randomness <= balancedSettings.randomness);
}

function run() {
  testThreeWinsIncreaseDifficulty();
  testThreeLossesReduceDifficulty();
  testEasyModeStillRejectsBadMoves();
  testLifeDeathWeaknessIncreasesTacticalTraining();
  testRuleRejectedMovesRemainRejectedAfterDifficulty();
  testOpeningWeaknessUsesOpeningBookMore();
  console.log("test-difficulty-controller: ok");
}

run();
