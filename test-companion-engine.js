const assert = require("assert");
const studentModel = require("./student-model.js");
const controller = require("./companion-engine.js");

function makeProfile(overrides = {}) {
  return {
    childId: "test-child",
    scores: {
      ...studentModel.defaultScores,
      ...overrides
    }
  };
}

function makeGameState(overrides = {}) {
  return {
    moveCount: 48,
    blackCaptures: 3,
    whiteCaptures: 4,
    scoreLead: -1.5,
    weakBlackGroups: 2,
    pressuredWhiteGroups: 1,
    openingDiscipline: 54,
    completion: 42,
    ...overrides
  };
}

function makeMove(overrides = {}) {
  return {
    point: { x: 3, y: 3 },
    legal: true,
    ruleLegal: true,
    moveNumber: 36,
    openingBookScore: 22,
    ruleScore: 180,
    policyScore: 210,
    combinedScore: 412,
    adjustedScore: 452,
    captures: 0,
    tacticalPressure: 1,
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

function testWeakestFocusSelection() {
  const profile = makeProfile({ connection: 20, opening: 60 });
  assert.strictEqual(controller.getCompanionFocus(profile), "connection");
}

function testEstimateCurrentStrengthChangesWithGameState() {
  const profile = makeProfile({ opening: 60, capture: 55, connection: 55 });
  const weakState = makeGameState({ blackCaptures: 1, whiteCaptures: 6, scoreLead: -8, weakBlackGroups: 3, pressuredWhiteGroups: 0 });
  const strongState = makeGameState({ blackCaptures: 6, whiteCaptures: 1, scoreLead: 6, weakBlackGroups: 0, pressuredWhiteGroups: 3 });
  const weakEstimate = controller.estimateCurrentStrength(profile, weakState);
  const strongEstimate = controller.estimateCurrentStrength(profile, strongState);
  assert(strongEstimate > weakEstimate);
}

function testLoseStreakReducesPrecision() {
  const profile = makeProfile({ opening: 28 });
  const softPlan = controller.createCompanionPlan(profile, [false, false, false], makeGameState(), controller.createCompanionState());
  const sharpPlan = controller.createCompanionPlan(profile, [true, true, true], makeGameState(), controller.createCompanionState());
  assert.strictEqual(softPlan.precisionBand, "soft");
  assert.strictEqual(sharpPlan.precisionBand, "sharp");
  assert(softPlan.targetMoveRank > sharpPlan.targetMoveRank);
  assert(softPlan.confidenceBase < sharpPlan.confidenceBase);
}

function testWinStreakIncreasesPrecision() {
  const profile = makeProfile({ endgame: 25 });
  const sharpPlan = controller.createCompanionPlan(profile, [true, true, true], makeGameState({ moveCount: 130 }), controller.createCompanionState());
  assert(sharpPlan.increasePrecision);
  assert(sharpPlan.endgamePrecision >= 1);
}

function testObserveStudentMoveClassifiesAndUpdatesState() {
  const profile = makeProfile({ opening: 50, readingDepth: 50, blunderRate: 50 });
  const state = controller.createCompanionState();
  const candidates = [
    makeMove({ point: { x: 3, y: 3 }, combinedScore: 460, adjustedScore: 500 }),
    makeMove({ point: { x: 4, y: 3 }, combinedScore: 430, adjustedScore: 470 })
  ];
  const observed = controller.observeStudentMove({
    move: { x: 4, y: 3 },
    candidates,
    studentProfile: profile,
    companionState: state,
    gameState: makeGameState()
  });
  assert(observed.assessment);
  assert(["acceptable", "inaccurate", "mistake", "blunder", "good"].includes(observed.assessment.quality));
  assert(observed.companionState.counts[observed.assessment.quality] >= 1);
  assert.notStrictEqual(observed.updatedProfile.scores.readingDepth, 50);
}

function run() {
  testWeakestFocusSelection();
  testEstimateCurrentStrengthChangesWithGameState();
  testLoseStreakReducesPrecision();
  testWinStreakIncreasesPrecision();
  testObserveStudentMoveClassifiesAndUpdatesState();
  console.log("test-companion-engine: ok");
}

run();
