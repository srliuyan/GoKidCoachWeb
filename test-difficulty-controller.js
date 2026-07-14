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

function testAdvancedModeKeepsOnlyStrongestCandidate() {
  const settings = {
    ...controller.getDifficultySettings(makeProfile(), [true, true, false]),
    releaseDifficultyMode: "MAX_STRENGTH_FIXED",
    candidateTopK: 1,
    mistakeTolerance: 0,
    randomness: 0
  };
  const adjusted = controller.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 500, policyScore: 260 }),
    makeCandidate({ x: 4, y: 4 }, { combinedScore: 492, policyScore: 252 }),
    makeCandidate({ x: 5, y: 5 }, { combinedScore: 470, policyScore: 240 })
  ], settings);
  assert.strictEqual(adjusted.length, 3);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 3 });
  assert.deepStrictEqual(controller.chooseAdaptiveMove(adjusted, settings).point, { x: 3, y: 3 });
}

function testMaxModeDeterministicTieBreakAndNoRandomness() {
  const settings = {
    ...controller.getDifficultySettings(makeProfile(), [false, false, false]),
    releaseDifficultyMode: "MAX_STRENGTH_FIXED",
    candidateTopK: 1,
    mistakeTolerance: 0,
    randomness: 1,
    policyTemperature: 1
  };
  const candidates = [
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 500, policyScore: 260 }),
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 500, policyScore: 260 }),
    makeCandidate({ x: 4, y: 3 }, { combinedScore: 500, policyScore: 260 })
  ];
  const first = controller.chooseAdaptiveMove(controller.adjustMoveCandidates(candidates, settings), settings);
  for (let i = 0; i < 12; i += 1) {
    assert.deepStrictEqual(controller.chooseAdaptiveMove(controller.adjustMoveCandidates(candidates, settings), settings).point, first.point);
  }
  assert.deepStrictEqual(first.point, { x: 3, y: 3 });
}

function testWeakButLegalAndLowValueExcludedWhenBetterExists() {
  const settings = {
    ...controller.getDifficultySettings(makeProfile(), [false, false, false]),
    releaseDifficultyMode: "beginner",
    candidateTopK: 4,
    mistakeTolerance: 18
  };
  const adjusted = controller.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 430 }),
    makeCandidate({ x: 9, y: 9 }, { combinedScore: 900, coherentClass: "lowValue", lowValueCandidate: true }),
    makeCandidate({ x: 10, y: 10 }, { combinedScore: 890, immediatelyRefuted: true })
  ], settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 3 });
}

function testRandomnessLimitedToNearEquivalentCandidates() {
  const settings = {
    ...controller.getDifficultySettings(makeProfile(), [false, true, false]),
    releaseDifficultyMode: "basic",
    candidateTopK: 3,
    mistakeTolerance: 12,
    randomness: 1,
    policyTemperature: 0.2
  };
  const adjusted = controller.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 500, policyScore: 260 }),
    makeCandidate({ x: 4, y: 4 }, { combinedScore: 496, policyScore: 256 }),
    makeCandidate({ x: 16, y: 16 }, { combinedScore: 420, policyScore: 180 })
  ], settings);
  for (let i = 0; i < 20; i += 1) {
    const choice = controller.chooseAdaptiveMove(adjusted, settings);
    assert([{ x: 3, y: 3 }, { x: 4, y: 4 }].some(point => point.x === choice.point.x && point.y === choice.point.y));
  }
}

function run() {
  testThreeWinsIncreaseDifficulty();
  testThreeLossesReduceDifficulty();
  testEasyModeStillRejectsBadMoves();
  testLifeDeathWeaknessIncreasesTacticalTraining();
  testRuleRejectedMovesRemainRejectedAfterDifficulty();
  testOpeningWeaknessUsesOpeningBookMore();
  testAdvancedModeKeepsOnlyStrongestCandidate();
  testMaxModeDeterministicTieBreakAndNoRandomness();
  testWeakButLegalAndLowValueExcludedWhenBetterExists();
  testRandomnessLimitedToNearEquivalentCandidates();
  console.log("test-difficulty-controller: ok");
}

run();
