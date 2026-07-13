const assert = require("assert");
const evaluator = require("./position-evaluator.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function testDetectWeakGroups() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const weak = evaluator.detectWeakGroups(board, black);
  assert.strictEqual(weak.length, 1);
  assert.strictEqual(weak[0].liberties, 1);
}

function testDetectCutPoints() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  const cuts = evaluator.detectCutPoints(board, black);
  assert(cuts.some(item => item.point.x === 4 && item.point.y === 3));
}

function testAreaValueCornerSideCenter() {
  const board = emptyBoard();
  const corner = evaluator.scoreMoveByPosition({ point: { x: 3, y: 3 }, moveNumber: 0, legal: true, ruleLegal: true }, board, black);
  const side = evaluator.scoreMoveByPosition({ point: { x: 9, y: 3 }, moveNumber: 0, legal: true, ruleLegal: true }, board, black);
  const center = evaluator.scoreMoveByPosition({ point: { x: 9, y: 9 }, moveNumber: 0, legal: true, ruleLegal: true }, board, black);
  assert(corner > side);
  assert(side >= center);
}

function testCaptureGetsBonus() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const score = evaluator.scoreMoveByPosition({ point: { x: 1, y: 2 }, moveNumber: 40, legal: true, ruleLegal: true }, board, black);
  assert(score > 100);
}

function testStrengthenWeakGroupGetsBonus() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const score = evaluator.scoreMoveByPosition({ point: { x: 1, y: 2 }, moveNumber: 35, legal: true, ruleLegal: true }, board, black);
  assert(score > 80);
}

function testSuicideOrGiveawayRejected() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  setStone(board, { x: 1, y: 2 }, black);
  const suicide = evaluator.scoreMoveByPosition({ point: { x: 1, y: 1 }, moveNumber: 20, legal: true, ruleLegal: true }, board, white);
  const giveaway = evaluator.scoreMoveByPosition({ point: { x: 0, y: 0 }, moveNumber: 20, legal: true, ruleLegal: true, obviousGiveaway: true }, board, white);
  assert(suicide <= -99999);
  assert(giveaway <= -99999);
}

function testPositionSummary() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 15, y: 15 }, white);
  const summary = evaluator.explainPositionSummary(evaluator.evaluatePosition(board, black));
  assert(summary.includes("Weak groups"));
  assert(summary.includes("territory"));
}

function testSecureTerritoryRecognized() {
  const board = emptyBoard();
  for (let x = 0; x <= 2; x += 1) setStone(board, { x, y: 3 }, black);
  for (let y = 0; y <= 2; y += 1) setStone(board, { x: 3, y }, black);
  const territory = evaluator.estimateTerritory(board);
  assert(territory.black > 0);
}

function testOpenBoundaryNotTreatedAsSettledYose() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  const result = evaluator.classifyEndgameMove({ point: { x: 0, y: 10 }, moveNumber: 150, legal: true, ruleLegal: true }, board, black);
  assert.strictEqual(result.dame, true);
  assert(result.value < 0);
}

function testMeaninglessFirstLineMoveLowEndgameValue() {
  const board = emptyBoard();
  const result = evaluator.classifyEndgameMove({ point: { x: 0, y: 10 }, moveNumber: 155, legal: true, ruleLegal: true }, board, black);
  assert.strictEqual(result.category, "dame");
}

function testMeaningfulEdgeYosePositiveValue() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 0 }, black);
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 2, y: 1 }, white);
  const result = evaluator.classifyEndgameMove({ point: { x: 3, y: 1 }, moveNumber: 150, legal: true, ruleLegal: true, territoryValue: 8 }, board, black);
  assert(result.value > 0);
  assert(["large_gote_yose", "urgent_sente_yose", "small_territory_gain"].includes(result.category));
}

function testUrgentSenteYoseBeatsDame() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const sente = evaluator.scoreMoveByPosition({ point: { x: 1, y: 2 }, moveNumber: 150, legal: true, ruleLegal: true, tacticalPressure: 1 }, board, black);
  const dame = evaluator.scoreMoveByPosition({ point: { x: 10, y: 10 }, moveNumber: 150, legal: true, ruleLegal: true }, board, black);
  assert(sente > dame);
}

function testLargeCornerYoseBeatsNeutralMove() {
  const board = emptyBoard();
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, white);
  const corner = evaluator.scoreMoveByPosition({ point: { x: 1, y: 1 }, moveNumber: 155, legal: true, ruleLegal: true, territoryValue: 8, endgameScore: 12 }, board, black);
  const neutral = evaluator.scoreMoveByPosition({ point: { x: 9, y: 9 }, moveNumber: 155, legal: true, ruleLegal: true }, board, black);
  assert(corner > neutral);
}

function testSettledGroupAvoidsRedundantReinforcement() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 4, y: 3 }, black);
  setStone(board, { x: 4, y: 4 }, black);
  const reinforce = evaluator.classifyEndgameMove({ point: { x: 5, y: 4 }, moveNumber: 150, legal: true, ruleLegal: true }, board, black);
  assert.strictEqual(reinforce.redundantReinforcement, true);
  assert(reinforce.value < 0);
}

function testNecessaryConnectionBeatsTerritoryGain() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, white);
  setStone(board, { x: 5, y: 2 }, white);
  const connect = evaluator.scoreMoveByPosition({ point: { x: 4, y: 3 }, moveNumber: 145, legal: true, ruleLegal: true, connectionValue: 2 }, board, black);
  const territory = evaluator.scoreMoveByPosition({ point: { x: 1, y: 1 }, moveNumber: 145, legal: true, ruleLegal: true, territoryValue: 6 }, board, black);
  assert(connect > territory);
}

function testSenteYoseCanBeatLargerGote() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const sente = evaluator.classifyEndgameMove({ point: { x: 1, y: 2 }, moveNumber: 150, legal: true, ruleLegal: true }, board, black);
  const gote = evaluator.classifyEndgameMove({ point: { x: 1, y: 1 }, moveNumber: 150, legal: true, ruleLegal: true, territoryValue: 12 }, emptyBoard(), black);
  assert(sente.sentePotential);
  assert(sente.value > gote.value);
}

function testLowValueNeutralFillEligible() {
  const board = emptyBoard();
  const move = { point: { x: 9, y: 9 }, moveNumber: 150, legal: true, ruleLegal: true };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.neutralAdjacencyEvidence, true);
  assert.strictEqual(evidence.eligible, true);
  assert.strictEqual(evaluator.isLowValueEndgameCandidate(board, move, black), true);
}

function testLowValueStableRedundantDefenseEligible() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 4, y: 3 }, black);
  setStone(board, { x: 4, y: 4 }, black);
  const move = { point: { x: 5, y: 4 }, moveNumber: 150, legal: true, ruleLegal: true };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.targetGroupAlreadyStable, true);
  assert.strictEqual(evidence.eligible, true);
}

function testLowValueMeaningfulBoundaryNotEligible() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, white);
  const move = { point: { x: 1, y: 1 }, moveNumber: 150, legal: true, ruleLegal: true, territoryValue: 8 };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.eligible, false);
  assert(evidence.meaningfulBoundaryDelta || evidence.localTerritoryDelta >= 4);
}

function testLowValueImmediateCaptureNotEligible() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const move = { point: { x: 1, y: 2 }, moveNumber: 150, legal: true, ruleLegal: true };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert(evidence.immediateCaptureCount > 0);
  assert.strictEqual(evidence.eligible, false);
}

function testLowValueOwnGroupRescueNotEligible() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const move = { point: { x: 1, y: 2 }, moveNumber: 150, legal: true, ruleLegal: true };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.savesAtariGroup, true);
  assert.strictEqual(evidence.eligible, false);
}

function testLowValueNecessaryConnectionNotEligible() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, white);
  setStone(board, { x: 5, y: 2 }, white);
  const move = { point: { x: 4, y: 3 }, moveNumber: 150, legal: true, ruleLegal: true };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.necessaryConnectionEvidence, true);
  assert.strictEqual(evidence.eligible, false);
}

function testLowValueForcingMoveNotEligible() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  const move = { point: { x: 2, y: 1 }, moveNumber: 150, legal: true, ruleLegal: true, tacticalPressure: 1 };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.forcingThreatEvidence, true);
  assert.strictEqual(evidence.eligible, false);
}

function testLowValueConflictingEvidenceDefaultsFalse() {
  const board = emptyBoard();
  const move = { point: { x: 9, y: 9 }, moveNumber: 150, legal: true, ruleLegal: true, territoryValue: 10 };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.eligible, false);
}

function testOfflineLabelsNotRuntimeEvidence() {
  const board = emptyBoard();
  const move = {
    point: { x: 9, y: 9 },
    moveNumber: 150,
    legal: true,
    ruleLegal: true,
    primaryLabel: "captureOrRescue",
    candidateRank: 1,
    candidateQualityTier: "best",
    labelConfidence: 1
  };
  const evidence = evaluator.lowValueEndgameEvidence(board, move, black);
  assert.strictEqual(evidence.eligible, true);
  assert.strictEqual(evidence.immediateCaptureCount, 0);
}

function testUrgentImmediateCaptureEvidence() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, white);
  setStone(board, { x: 0, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 1 }, black);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 1, y: 2 }, moveNumber: 150 }, black);
  assert.strictEqual(evidence.urgent, true);
  assert(evidence.immediateCaptureCount > 0);
}

function testUrgentAtariRescueEvidence() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 1, y: 2 }, moveNumber: 150 }, black);
  assert.strictEqual(evidence.urgent, true);
  assert.strictEqual(evidence.savesAtariGroup, true);
}

function testFalseTacticalPatternNotUrgent() {
  const board = emptyBoard();
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 9, y: 9 }, moveNumber: 150, primaryLabel: "captureOrRescue" }, black);
  assert.strictEqual(evidence.urgent, false);
  assert.strictEqual(evidence.falsePattern, true);
}

function testAlreadySafeConnectionNotUrgent() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 5, y: 4 }, black);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 4, y: 3 }, moveNumber: 150 }, black);
  assert.strictEqual(evidence.connectsUnsafeGroups, false);
  assert.strictEqual(evidence.urgent, false);
}

function testUnsafeConnectionUrgentEvidence() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 5, y: 3 }, black);
  setStone(board, { x: 3, y: 2 }, white);
  setStone(board, { x: 2, y: 3 }, white);
  setStone(board, { x: 3, y: 4 }, white);
  setStone(board, { x: 5, y: 2 }, white);
  setStone(board, { x: 6, y: 3 }, white);
  setStone(board, { x: 5, y: 4 }, white);
  const evidence = evaluator.urgentMoveEvidence(board, { point: { x: 4, y: 3 }, moveNumber: 150 }, black);
  assert.strictEqual(evidence.connectsUnsafeGroups, true);
  assert.strictEqual(evidence.urgent, true);
}

function run() {
  testDetectWeakGroups();
  testDetectCutPoints();
  testAreaValueCornerSideCenter();
  testCaptureGetsBonus();
  testStrengthenWeakGroupGetsBonus();
  testSuicideOrGiveawayRejected();
  testPositionSummary();
  testSecureTerritoryRecognized();
  testOpenBoundaryNotTreatedAsSettledYose();
  testMeaninglessFirstLineMoveLowEndgameValue();
  testMeaningfulEdgeYosePositiveValue();
  testUrgentSenteYoseBeatsDame();
  testLargeCornerYoseBeatsNeutralMove();
  testSettledGroupAvoidsRedundantReinforcement();
  testNecessaryConnectionBeatsTerritoryGain();
  testSenteYoseCanBeatLargerGote();
  testLowValueNeutralFillEligible();
  testLowValueStableRedundantDefenseEligible();
  testLowValueMeaningfulBoundaryNotEligible();
  testLowValueImmediateCaptureNotEligible();
  testLowValueOwnGroupRescueNotEligible();
  testLowValueNecessaryConnectionNotEligible();
  testLowValueForcingMoveNotEligible();
  testLowValueConflictingEvidenceDefaultsFalse();
  testOfflineLabelsNotRuntimeEvidence();
  testUrgentImmediateCaptureEvidence();
  testUrgentAtariRescueEvidence();
  testFalseTacticalPatternNotUrgent();
  testAlreadySafeConnectionNotUrgent();
  testUnsafeConnectionUrgentEvidence();
  console.log("test-position-evaluator: ok");
}

run();
