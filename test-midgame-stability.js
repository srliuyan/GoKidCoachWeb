const assert = require("assert");
const evaluator = require("./position-evaluator.js");
const stability = require("./midgame-stability.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function makeMove(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    policyScore: 180,
    positionScore: 120,
    midgameScore: 0,
    openingBookScore: 0,
    ruleScore: 120,
    captures: 0,
    ownLiberties: 3,
    tacticalPressure: 0,
    rescueValue: 0,
    connectionValue: 0,
    cutOpportunity: 0,
    territoryValue: 1,
    lifeDeathValue: 0,
    ladderValue: 0,
    moveNumber: 70,
    obviousGiveaway: false,
    isSuicide: false,
    isMeaninglessFirstLine: false,
    isRandomFlyaway: false,
    ...overrides
  };
}

function testSmallGroupCanBeSacrificed() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const evalData = evaluator.evaluatePosition(board, black);
  const value = stability.evaluateSacrificeValue(evalData.groups.ownWeakGroups[0], board, evalData);
  assert(value > 0);
}

function testBigDragonMustBeSaved() {
  const board = emptyBoard();
  for (const point of [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }, { x: 7, y: 6 }]) {
    setStone(board, point, black);
  }
  for (const point of [{ x: 4, y: 5 }, { x: 4, y: 6 }, { x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }, { x: 8, y: 5 }, { x: 8, y: 6 }, { x: 5, y: 7 }, { x: 7, y: 7 }]) {
    setStone(board, point, white);
  }
  const evalData = evaluator.evaluatePosition(board, black);
  assert(stability.shouldSaveGroup(evalData.groups.ownWeakGroups[0], board, evalData));
}

function testWeakGroupUrgencyHigherThanExpansion() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 1, y: 0 }, white);
  setStone(board, { x: 0, y: 1 }, white);
  setStone(board, { x: 2, y: 1 }, white);
  const evalData = evaluator.evaluatePosition(board, black);
  const save = stability.evaluateUrgency(makeMove({ x: 1, y: 2 }), board, evalData);
  const expand = stability.evaluateUrgency(makeMove({ x: 10, y: 10 }), board, evalData);
  assert(save > expand);
}

function testTerritoryLeadAvoidsOverRisk() {
  const board = emptyBoard();
  for (const point of [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 2 }]) setStone(board, point, black);
  const evalData = {
    ...evaluator.evaluatePosition(board, black),
    smoothedScoreLead: 8,
    smoothedThicknessLead: 3
  };
  const risky = stability.balanceTerritoryAndInfluence(makeMove({ x: 10, y: 10 }, { tacticalPressure: 3, ownLiberties: 2 }), board, evalData);
  const solid = stability.balanceTerritoryAndInfluence(makeMove({ x: 3, y: 3 }, { territoryValue: 3, connectionValue: 1 }), board, evalData);
  assert(solid > risky);
}

function testThicknessDeficitPrefersStrengthening() {
  const board = emptyBoard();
  const evalData = {
    ...evaluator.evaluatePosition(board, black),
    smoothedScoreLead: -2,
    smoothedThicknessLead: -6
  };
  const strengthen = stability.balanceTerritoryAndInfluence(makeMove({ x: 5, y: 5 }, { connectionValue: 2, rescueValue: 1 }), board, evalData);
  const neutral = stability.balanceTerritoryAndInfluence(makeMove({ x: 10, y: 10 }, { territoryValue: 1 }), board, evalData);
  assert(strengthen > neutral);
}

function testSingleEvalShiftIsSmoothed() {
  const previousEval = { scoreLead: 10, thicknessLead: 12, smoothedScoreLead: 10, smoothedThicknessLead: 12 };
  const currentEval = { scoreLead: -10, thicknessLead: -12, groups: {} };
  const smoothed = stability.smoothPositionEvaluation(currentEval, previousEval);
  assert(smoothed.smoothedScoreLead > -5);
  assert(smoothed.smoothedThicknessLead > -6);
}

function testRejectedMoveNeverSelectableByMidgame() {
  const board = emptyBoard();
  const evalData = evaluator.evaluatePosition(board, black);
  const score = stability.scoreMidgameMove(makeMove({ x: 0, y: 0 }, { ruleLegal: false }), board, { positionEval: evalData });
  assert(score <= -99999);
}

function run() {
  testSmallGroupCanBeSacrificed();
  testBigDragonMustBeSaved();
  testWeakGroupUrgencyHigherThanExpansion();
  testTerritoryLeadAvoidsOverRisk();
  testThicknessDeficitPrefersStrengthening();
  testSingleEvalShiftIsSmoothed();
  testRejectedMoveNeverSelectableByMidgame();
  console.log("test-midgame-stability: ok");
}

run();
