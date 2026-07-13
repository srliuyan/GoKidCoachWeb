const assert = require("assert");
const fusion = require("./context-fusion.js");

function makeCandidate(overrides = {}) {
  return {
    legal: true,
    ruleLegal: true,
    moveNumber: 20,
    openingBookScore: 40,
    policyScore: 120,
    positionScore: 35,
    patternScore: 16,
    shapeScore: 8,
    fusekiScore: 24,
    tacticalScore: 0,
    josekiScore: 18,
    endgameScore: 0,
    confidence: 0.72,
    ruleScore: 50,
    ownLiberties: 4,
    tacticalPressure: 0,
    rescueValue: 0,
    connectionValue: 1,
    captures: 0,
    territoryValue: 4,
    endgameValue: 0,
    ...overrides
  };
}

function sumWeights(weights) {
  return Object.values(weights).reduce((sum, value) => sum + value, 0);
}

function testGamePhaseEstimation() {
  assert.strictEqual(fusion.estimateGamePhase(makeCandidate({ moveNumber: 8 })), "opening");
  assert.strictEqual(fusion.estimateGamePhase(makeCandidate({ moveNumber: 42 })), "early middlegame");
  assert.strictEqual(fusion.estimateGamePhase(makeCandidate({ moveNumber: 82 })), "middlegame");
  assert.strictEqual(fusion.estimateGamePhase(makeCandidate({ moveNumber: 118 })), "late middlegame");
  assert.strictEqual(fusion.estimateGamePhase(makeCandidate({ moveNumber: 155, endgameValue: 5 })), "endgame");
}

function testOpeningWeightsFavorBookFusekiJoseki() {
  const result = fusion.fusePolicyScore(makeCandidate({ moveNumber: 12 }), {
    childStrengthEstimate: 42,
    aiCalibrationLevel: 50
  });
  assert(Math.abs(sumWeights(result.weights) - 1) < 0.000001);
  assert(result.weights.openingBook > result.weights.pattern);
  assert(result.weights.fuseki > result.weights.tactical);
  assert(result.weights.joseki > result.weights.endgame);
}

function testFightWeightsFavorTacticalLateMiddlegame() {
  const result = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 118,
    tacticalScore: 80,
    tacticalPressure: 3,
    rescueValue: 2,
    captures: 1,
    ownLiberties: 2,
    lifeDeathValue: 3,
    territoryValue: 12
  }), {
    childStrengthEstimate: 70,
    aiCalibrationLevel: 82
  });
  assert(result.weights.tactical > result.weights.pattern);
  assert(result.weights.tactical > result.weights.fuseki);
  assert(result.localTacticalIntensity > 0.55);
}

function testEndgameWeightsFavorEndgameAndPosition() {
  const result = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 166,
    endgameScore: 60,
    endgameValue: 6,
    territoryValue: 24,
    tacticalPressure: 0
  }), {
    childStrengthEstimate: 58,
    aiCalibrationLevel: 64
  });
  assert.strictEqual(result.phase, "endgame");
  assert(result.weights.endgame > result.weights.tactical);
  assert(result.weights.position > result.weights.shape);
}

function testRejectedMoveCannotReenter() {
  const result = fusion.fuseCandidate(makeCandidate({
    legal: false,
    ruleLegal: false,
    ruleScore: -99999,
    tacticalScore: 9999,
    endgameScore: 9999
  }));
  assert(result.fusedPolicyScore <= -900);
  assert(result.contextFusion.fusedPolicyScore <= -900);
}

function testFusekiHasNoMeaningfulEndgameInfluence() {
  const result = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 170,
    territoryMaturity: 0.92,
    boardStability: 0.88,
    endgameScore: 44,
    fusekiScore: 999,
    endgameConfidence: 0.9
  }));
  assert(result.weights.fuseki < 0.02);
  assert(result.weights.endgame > result.weights.fuseki);
}

function testV31EndgameConfidenceRuntimeTuningReverted() {
  const high = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 170,
    territoryMaturity: 0.9,
    boardStability: 0.9,
    endgameScore: 80,
    endgameConfidence: 0.9
  }));
  const low = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 170,
    territoryMaturity: 0.9,
    boardStability: 0.9,
    endgameScore: 80,
    endgameConfidence: 0.1
  }));
  assert.strictEqual(high.weights.endgame, low.weights.endgame);
}

function testPolicyCannotOverpowerSuperiorEndgameMove() {
  const policyHeavy = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 170,
    territoryMaturity: 0.9,
    boardStability: 0.9,
    policyScore: 180,
    endgameScore: 8,
    endgameConfidence: 0.8
  }));
  const endgameStrong = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 170,
    territoryMaturity: 0.9,
    boardStability: 0.9,
    policyScore: 80,
    endgameScore: 80,
    endgameConfidence: 0.9
  }));
  assert(endgameStrong.fusedPolicyScore > policyHeavy.fusedPolicyScore);
}

function testSmoothLateMiddlegameToEndgameTransition() {
  const late = fusion.fusePolicyScore(makeCandidate({ moveNumber: 118, territoryMaturity: 0.55, boardStability: 0.62, endgameScore: 30 }));
  const earlyEnd = fusion.fusePolicyScore(makeCandidate({ moveNumber: 132, territoryMaturity: 0.68, boardStability: 0.7, endgameScore: 30 }));
  const deepEnd = fusion.fusePolicyScore(makeCandidate({ moveNumber: 165, territoryMaturity: 0.9, boardStability: 0.86, endgameScore: 30 }));
  assert(earlyEnd.contextFusion === undefined);
  assert(earlyEnd.weights.endgame >= late.weights.endgame);
  assert(deepEnd.weights.endgame >= earlyEnd.weights.endgame);
  assert(deepEnd.weights.policy <= earlyEnd.weights.policy);
}

function testUrgentCaptureRemainsHigherPriorityThanYose() {
  const capture = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 168,
    tacticalScore: 150,
    tacticalPressure: 3,
    captures: 2,
    endgameScore: 20,
    territoryMaturity: 0.85,
    boardStability: 0.55
  }));
  const yose = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 168,
    tacticalScore: 0,
    tacticalPressure: 0,
    captures: 0,
    endgameScore: 36,
    territoryMaturity: 0.85,
    boardStability: 0.85
  }));
  assert(capture.fusedPolicyScore > yose.fusedPolicyScore);
}

function testUrgentProtectionDoesNotGloballyRaiseTacticalScore() {
  const quiet = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 168,
    tacticalScore: 20,
    tacticalPressure: 0,
    captures: 0,
    rescueValue: 0,
    endgameScore: 30
  }));
  const quietAgain = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 168,
    tacticalScore: 20,
    tacticalPressure: 0,
    captures: 0,
    rescueValue: 0,
    endgameScore: 30,
    primaryLabel: "captureOrRescue"
  }));
  assert.strictEqual(quiet.fusedPolicyScore, quietAgain.fusedPolicyScore);
}

function testOwnAtariRemainsUrgent() {
  const result = fusion.fusePolicyScore(makeCandidate({
    moveNumber: 165,
    ownLiberties: 1,
    rescueValue: 2,
    tacticalPressure: 2,
    tacticalScore: 70,
    endgameScore: 35
  }));
  assert(result.weights.tactical > 0.14);
}

function testTacticalNoiseDecaysSmoothly() {
  const a = fusion.generateDynamicWeights(makeCandidate({ moveNumber: 118, tacticalScore: 20, tacticalPressure: 0, territoryMaturity: 0.55, boardStability: 0.65 }));
  const b = fusion.generateDynamicWeights(makeCandidate({ moveNumber: 135, tacticalScore: 20, tacticalPressure: 0, territoryMaturity: 0.72, boardStability: 0.75 }));
  const c = fusion.generateDynamicWeights(makeCandidate({ moveNumber: 165, tacticalScore: 20, tacticalPressure: 0, territoryMaturity: 0.9, boardStability: 0.9 }));
  assert(a.tactical > b.tactical);
  assert(Math.abs(a.tactical - b.tactical) < 0.2);
  assert(Math.abs(b.tactical - c.tactical) < 0.08);
  assert(c.tactical > 0.04);
}

function testLatencyAndMemory() {
  const candidate = makeCandidate({
    moveNumber: 103,
    tacticalScore: 45,
    tacticalPressure: 2,
    rescueValue: 1,
    territoryValue: 14,
    endgameValue: 2
  });
  const context = {
    childStrengthEstimate: 62,
    aiCalibrationLevel: 70,
    difficultySettings: { suggestedAiStrength: 70 }
  };
  const iterations = 100000;
  const beforeMemory = process.memoryUsage().heapUsed;
  const start = process.hrtime.bigint();
  let last = null;
  for (let i = 0; i < iterations; i += 1) {
    last = fusion.fuseCandidate(candidate, context);
  }
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  const afterMemory = process.memoryUsage().heapUsed;
  const averageMs = elapsedMs / iterations;
  assert(last.fusedPolicyScore > 0);
  assert(averageMs < 1);
  console.log(`Average fusion latency: ${averageMs.toFixed(6)} ms/candidate`);
  console.log(`Memory usage delta: ${Math.round((afterMemory - beforeMemory) / 1024)} KB`);
}

function run() {
  testGamePhaseEstimation();
  testOpeningWeightsFavorBookFusekiJoseki();
  testFightWeightsFavorTacticalLateMiddlegame();
  testEndgameWeightsFavorEndgameAndPosition();
  testRejectedMoveCannotReenter();
  testFusekiHasNoMeaningfulEndgameInfluence();
  testV31EndgameConfidenceRuntimeTuningReverted();
  testPolicyCannotOverpowerSuperiorEndgameMove();
  testSmoothLateMiddlegameToEndgameTransition();
  testUrgentCaptureRemainsHigherPriorityThanYose();
  testUrgentProtectionDoesNotGloballyRaiseTacticalScore();
  testOwnAtariRemainsUrgent();
  testTacticalNoiseDecaysSmoothly();
  testLatencyAndMemory();
  console.log("test-context-fusion: ok");
}

run();
