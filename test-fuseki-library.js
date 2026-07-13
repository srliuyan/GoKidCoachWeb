const assert = require("assert");
const fuseki = require("./fuseki-library.js");

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
  fuseki.resetForTests({
    version: 1,
    entries: [
      {
        k: "1|OMEE|OEEE|CC|NW|2|1|1|0",
        t: 40,
        m: 28.5,
        c: 0.82,
        a: {
          "side|NE|cornerToSide|0|0|1|0|0": { c: 20, f: 0.86, w: 0.61, m: 28.4 },
          "side|NE|cornerToSide|0|1|1|0|0": { c: 12, f: 0.74, w: 0.58, m: 30.1 },
          "center|CC|sideToCenter|0|0|0|1|0": { c: 6, f: 0.45, w: 0.52, m: 31.1 }
        }
      }
    ],
    global: {
      "1|CC|NW": [
        { k: "side|NE|cornerToSide|0|0|1|0|0", c: 18, w: 0.58, f: 0.73 },
        { k: "center|CC|sideToCenter|0|0|0|1|0", c: 5, w: 0.5, f: 0.4 }
      ]
    }
  });
}

function sampleBoard() {
  const board = emptyBoard();
  setStone(board, { x: 3, y: 3 }, black);
  setStone(board, { x: 4, y: 3 }, black);
  setStone(board, { x: 15, y: 3 }, white);
  return board;
}

function testDatabaseLoadingShape() {
  installDb();
  assert(fuseki.state.map instanceof Map);
  assert(fuseki.state.map.size >= 1);
}

function testContinuationLookup() {
  installDb();
  const board = sampleBoard();
  const result = fuseki.scoreFusekiMove({ x: 15, y: 4 }, board, black, {
    moveNumber: 30,
    previousOwnRegion: "corner",
    openingBookScore: 0
  });
  assert(result.fusekiScore > 0);
  assert(result.confidence > 0);
}

function testExpansionRecommendation() {
  installDb();
  const board = sampleBoard();
  const evaled = fuseki.evaluateFuseki(board, black, { moveNumber: 30 });
  assert.strictEqual(evaled.biggestOpenArea, "CC");
}

function testCornerTransition() {
  installDb();
  const board = sampleBoard();
  const result = fuseki.scoreFusekiMove({ x: 15, y: 4 }, board, black, {
    moveNumber: 30,
    previousOwnRegion: "corner",
    openingBookScore: 0
  });
  assert(result.action.includes("cornerToSide"));
}

function testSideExtension() {
  installDb();
  const board = sampleBoard();
  setStone(board, { x: 15, y: 5 }, black);
  const result = fuseki.scoreFusekiMove({ x: 15, y: 4 }, board, black, {
    moveNumber: 30,
    previousOwnRegion: "corner",
    openingBookScore: 0
  });
  assert(result.action.includes("|0|1|1|0|0"));
}

function testGracefulFallback() {
  fuseki.resetForTests(null);
  const board = sampleBoard();
  const result = fuseki.scoreFusekiMove({ x: 15, y: 4 }, board, black, {
    moveNumber: 30,
    previousOwnRegion: "corner",
    openingBookScore: 0
  });
  assert.strictEqual(result.fusekiScore, 0);
  assert.strictEqual(result.confidence, 0);
}

function testBrowserCompatibilitySurface() {
  installDb();
  assert.strictEqual(typeof fuseki.loadFusekiDb, "function");
  assert.strictEqual(typeof fuseki.evaluateFuseki, "function");
  assert.strictEqual(typeof fuseki.scoreFusekiMove, "function");
  assert.strictEqual(typeof fuseki.applyFusekiScores, "function");
  assert.strictEqual(typeof fuseki.explainFusekiDecision, "function");
}

function run() {
  testDatabaseLoadingShape();
  testContinuationLookup();
  testExpansionRecommendation();
  testCornerTransition();
  testSideExtension();
  testGracefulFallback();
  testBrowserCompatibilitySurface();
  console.log("test-fuseki-library: ok");
}

run();
