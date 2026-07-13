const assert = require("assert");
const endgame = require("./endgame-library.js");
const difficulty = require("./difficulty-controller.js");

const empty = 0;
const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function installDb() {
  endgame.resetForTests({
    version: 1,
    entries: [
      {
        k: "edge|3|1|0|1|0|0|0|1|0|1|0|0|xxxxx11000120000000000000",
        f: 80,
        c: 0.88,
        m: 148.2,
        w: 0.59,
        s: 0.76,
        g: 0.18,
        e: 0.81,
        r: 0.05,
        n: 0.12,
        p: 0.1,
        u: 0.04,
        d: 0.01,
        t: 0.74,
        q: [{ k: "B1,1;W2,1;B0,1", c: 12 }]
      },
      {
        k: "center|0|0|0|0|0|0|0|0|0|0|1|1|0000000000000000000000000",
        f: 60,
        c: 0.82,
        m: 152.4,
        w: 0.48,
        s: 0.08,
        g: 0.52,
        e: 0.02,
        r: 0.01,
        n: 0.01,
        p: 0.01,
        u: 0.86,
        d: 0.78,
        t: 0.04,
        q: [{ k: "B10,10", c: 10 }]
      },
      {
        k: "corner|3|1|0|0|0|0|0|0|1|1|0|0|xxxxxxx011xx012xx000xx000",
        f: 72,
        c: 0.85,
        m: 146.1,
        w: 0.58,
        s: 0.71,
        g: 0.22,
        e: 0.04,
        r: 0.79,
        n: 0.08,
        p: 0.08,
        u: 0.03,
        d: 0.01,
        t: 0.69,
        q: [{ k: "B1,1;W2,1;B1,0", c: 11 }]
      }
    ]
  });
}

function boardForEdgeYose() {
  const board = emptyBoard();
  setStone(board, { x: 1, y: 0 }, black);
  setStone(board, { x: 2, y: 0 }, black);
  setStone(board, { x: 1, y: 1 }, black);
  setStone(board, { x: 2, y: 1 }, white);
  return board;
}

function testDatabaseLoads() {
  installDb();
  assert(endgame.state.map instanceof Map);
  assert(endgame.state.map.size >= 1);
}

function testPatternDetection() {
  installDb();
  const result = endgame.detectEndgamePattern(boardForEdgeYose(), { x: 0, y: 1 }, black, { moveNumber: 140, settledRatio: 0.7 });
  const edgeResult = endgame.detectEndgamePattern(boardForEdgeYose(), { x: 3, y: 1 }, black, { moveNumber: 140, settledRatio: 0.7 });
  assert.strictEqual(result.active, true);
  assert.strictEqual(edgeResult.region, "edge");
}

function testEdgeCornerPositiveScore() {
  installDb();
  const edgeResult = endgame.scoreEndgameMove({ x: 3, y: 1 }, boardForEdgeYose(), black, { moveNumber: 140, settledRatio: 0.7 });
  assert(edgeResult.endgameScore > 0);
}

function testDamePenalty() {
  installDb();
  const board = emptyBoard();
  const result = endgame.scoreEndgameMove({ x: 10, y: 10 }, board, black, { moveNumber: 150, settledRatio: 0.8 });
  assert(result.endgameScore < 0);
}

function testSenteHigherThanLowValueGote() {
  installDb();
  const edge = endgame.scoreEndgameMove({ x: 3, y: 1 }, boardForEdgeYose(), black, { moveNumber: 140, settledRatio: 0.7 });
  const board = emptyBoard();
  const dame = endgame.scoreEndgameMove({ x: 10, y: 10 }, board, black, { moveNumber: 150, settledRatio: 0.8 });
  assert(edge.endgameScore > dame.endgameScore);
}

function testLargeCornerYoseBeatsSmallNeutralMove() {
  installDb();
  const corner = endgame.scoreEndgameMove({ x: 1, y: 1 }, boardForEdgeYose(), black, { moveNumber: 145, settledRatio: 0.75 });
  const neutral = endgame.scoreEndgameMove({ x: 10, y: 10 }, emptyBoard(), black, { moveNumber: 145, settledRatio: 0.75 });
  assert(corner.endgameScore > neutral.endgameScore);
}

function testLowConfidenceEndgameHitDoesNotDominate() {
  endgame.resetForTests({
    version: 1,
    entries: [{
      k: "edge|3|1|0|1|0|0|0|1|0|1|0|0|xxxxx11000120000000000000",
      f: 8,
      c: 0.12,
      m: 148.2,
      w: 0.52,
      s: 0.72,
      g: 0.12,
      e: 0.78,
      r: 0.05,
      n: 0.08,
      p: 0.06,
      u: 0.02,
      d: 0.01,
      t: 0.7,
      q: []
    }]
  });
  const low = endgame.scoreEndgameMove({ x: 3, y: 1 }, boardForEdgeYose(), black, { moveNumber: 140, settledRatio: 0.7 });
  assert(low.confidence < 0.5 || low.endgameScore < 20);
}

function testConfirmedTacticalThreatRemainsActiveInEndgame() {
  installDb();
  const board = boardForEdgeYose();
  const detected = endgame.detectEndgamePattern(board, { x: 3, y: 1 }, black, { moveNumber: 150, settledRatio: 0.75 });
  assert.strictEqual(detected.active, true);
  assert.strictEqual(detected.senteLike, 1);
}

function testNecessaryConnectionRemainsRecognized() {
  installDb();
  const board = emptyBoard();
  setStone(board, { x: 3, y: 2 }, black);
  setStone(board, { x: 3, y: 4 }, black);
  setStone(board, { x: 2, y: 3 }, white);
  setStone(board, { x: 4, y: 3 }, white);
  const detected = endgame.detectEndgamePattern(board, { x: 3, y: 3 }, black, { moveNumber: 155, settledRatio: 0.75 });
  assert.strictEqual(detected.connectionEndgameValue, 1);
  assert.strictEqual(detected.cutPrevention, 1);
}

function testSmallNeutralMoveLosesToClearGlobalYose() {
  installDb();
  const large = endgame.scoreEndgameMove({ x: 3, y: 1 }, boardForEdgeYose(), black, { moveNumber: 150, settledRatio: 0.8 });
  const small = endgame.scoreEndgameMove({ x: 10, y: 10 }, emptyBoard(), black, { moveNumber: 150, settledRatio: 0.8 });
  assert(large.endgameScore > small.endgameScore);
}

function testRejectedNeverReturns() {
  installDb();
  const settings = difficulty.getDifficultySettings({ scores: {} }, [false, false, false]);
  const candidates = [
    { point: { x: 3, y: 1 }, legal: true, ruleLegal: true, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 0, josekiScore: 0, endgameScore: 12, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: 10, moveNumber: 145, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 2, ownLiberties: 3, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 22 },
    { point: { x: 10, y: 10 }, legal: true, ruleLegal: false, policyScore: 10, patternScore: 0, shapeScore: 0, fusekiScore: 0, tacticalScore: 0, josekiScore: 0, endgameScore: 40, positionScore: 0, midgameScore: 0, openingBookScore: 0, ruleScore: -99999, moveNumber: 145, tacticalPressure: 0, rescueValue: 0, connectionValue: 0, endgameValue: 0, ownLiberties: 4, obviousGiveaway: false, isSuicide: false, isMeaninglessFirstLine: false, isRandomFlyaway: false, combinedScore: 50 }
  ];
  const adjusted = difficulty.adjustMoveCandidates(candidates, settings);
  assert.strictEqual(adjusted.length, 1);
  assert.deepStrictEqual(adjusted[0].point, { x: 3, y: 1 });
}

function testFallback() {
  endgame.resetForTests(null);
  const result = endgame.scoreEndgameMove({ x: 10, y: 10 }, emptyBoard(), black, { moveNumber: 150, settledRatio: 0.8 });
  assert.strictEqual(result.endgameScore, 0);
}

function run() {
  testDatabaseLoads();
  testPatternDetection();
  testEdgeCornerPositiveScore();
  testDamePenalty();
  testSenteHigherThanLowValueGote();
  testLargeCornerYoseBeatsSmallNeutralMove();
  testLowConfidenceEndgameHitDoesNotDominate();
  testConfirmedTacticalThreatRemainsActiveInEndgame();
  testNecessaryConnectionRemainsRecognized();
  testSmallNeutralMoveLosesToClearGlobalYose();
  testRejectedNeverReturns();
  testFallback();
  console.log("test-endgame-library: ok");
}

run();
