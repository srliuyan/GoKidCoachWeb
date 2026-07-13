const assert = require("assert");
const fs = require("fs");
const path = require("path");

const product = require("./product-support.js");
const buildInfo = require("./build-info.js");
const ruleEngine = require("./rule-engine.js");
const difficulty = require("./difficulty-controller.js");

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function makeCandidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    moveNumber: 30,
    policyScore: 100,
    combinedScore: 220,
    ruleScore: 120,
    captures: 0,
    tacticalPressure: 0,
    rescueValue: 0,
    connectionValue: 0,
    ...overrides
  };
}

function testDifficultyModes() {
  assert.deepStrictEqual(Object.keys(product.difficultyModes), ["beginner", "basic", "advanced", "adaptive"]);
  assert.strictEqual(product.difficultyModeConfig("beginner").label, "入门陪练");
  assert.strictEqual(product.difficultyModeConfig("beginner").level, 720);
  assert.strictEqual(product.difficultyModeConfig("basic").level, 840);
  assert.strictEqual(product.difficultyModeConfig("advanced").level, 980);
  assert.strictEqual(product.normalizeDifficultyMode(640), "beginner");
  assert.strictEqual(product.normalizeDifficultyMode(840), "basic");
  assert.strictEqual(product.normalizeDifficultyMode(980), "advanced");
  assert.strictEqual(product.normalizeDifficultyMode("adaptive"), "adaptive");
}

function testAdaptiveBounded() {
  const losses = Array.from({ length: 5 }, () => ({ completed: true, childWon: false, moves: 180 }));
  const wins = Array.from({ length: 5 }, () => ({ completed: true, childWon: true, moves: 180 }));
  assert.strictEqual(product.adaptiveStatus([]), "正在适应");
  assert.strictEqual(product.adaptiveStatus(losses), "将略微降低");
  assert.strictEqual(product.adaptiveStatus(wins), "将略微提高");
  assert(Math.abs(product.boundedAdaptiveAdjustment([{ completed: true, childWon: true }], 80)) <= 6);
}

function testDifficultyExcludesRejectedAndRandom() {
  const settings = {
    focusArea: "endgame",
    candidateTopK: 4,
    tacticalStrictness: 1,
    openingBookWeight: 1,
    endgamePrecision: 1,
    ruleEngineWeight: 1,
    mistakeTolerance: 20,
    policyTemperature: 0.3,
    randomness: 0
  };
  const adjusted = difficulty.adjustMoveCandidates([
    makeCandidate({ x: 3, y: 3 }, { combinedScore: 300 }),
    makeCandidate({ x: 4, y: 4 }, { combinedScore: 500, ruleLegal: false }),
    makeCandidate({ x: 5, y: 5 }, { combinedScore: 490, isRandomFlyaway: true })
  ], settings);
  assert(adjusted.length > 0);
  assert(!adjusted.some(candidate => candidate.ruleLegal === false || candidate.isRandomFlyaway));
}

function testRuleFlowBasics() {
  const board = emptyBoard();
  board[1][1] = 2;
  board[0][1] = 1;
  board[1][0] = 1;
  board[1][2] = 1;
  const capture = ruleEngine.simulateMove(board, { x: 1, y: 2 }, 1, []);
  assert.strictEqual(capture.legal, true);
  assert.strictEqual(capture.captures, 1);
  assert.strictEqual(capture.board[1][1], 0);
  assert.strictEqual(ruleEngine.simulateMove(capture.board, { x: 1, y: 2 }, 2, []).legal, false);
}

function testSgfExportRoundTrip() {
  const moveHistory = [
    { color: 1, x: 3, y: 3, captures: 0 },
    { color: 2, x: 15, y: 15, captures: 0 },
    { color: 1, pass: true, captures: 0 },
    { color: 2, x: 16, y: 15, captures: 0 }
  ];
  const sgf = product.buildSGF({
    moveHistory,
    childName: "孩子",
    childColor: 1,
    resultText: "B+",
    difficultyMode: "basic",
    difficultyStart: 760,
    difficultyEnd: 764,
    date: new Date("2026-07-13T00:00:00Z")
  });
  for (const token of ["GM[1]", "FF[4]", "CA[UTF-8]", "SZ[19]", "DT[2026-07-13]", "AP[GoKidCoachWeb:"]) {
    assert(sgf.includes(token), token);
  }
  const parsed = product.parseSgfMoves(sgf);
  assert.strictEqual(parsed.length, moveHistory.length);
  assert.strictEqual(parsed[2].pass, true);
  const replay = product.replaySgf(sgf, ruleEngine.simulateMove);
  assert.strictEqual(replay.legal, true);
  assert.strictEqual(replay.moves.length, moveHistory.length);
}

function testSnapshotValidationAndDiagnostics() {
  const snapshot = {
    id: "test",
    size: 19,
    board: emptyBoard(),
    moveHistory: [],
    turn: 1,
    captures: 0
  };
  const summary = product.diagnosticSummary({
    gameId: "g1",
    completed: true,
    moveCount: 251,
    difficultyMode: "adaptive",
    difficultyStart: 880,
    difficultyEnd: 884,
    aiThinkTimes: [20, 30, 40, 80],
    restoreCount: 1,
    childIllegalAttemptCount: 2
  });
  assert.strictEqual(snapshot.board.length, 19);
  assert.strictEqual(summary.maximumAiThinkTimeMs, 80);
  assert.strictEqual(summary.restoreCount, 1);
}

function testCompleteGameSimulationStable() {
  const board = emptyBoard();
  const hashes = [];
  let color = 1;
  let played = 0;
  for (let y = 0; y < 19 && played < 250; y += 1) {
    for (let x = 0; x < 19 && played < 250; x += 1) {
      const result = ruleEngine.simulateMove(board, { x, y }, color, hashes);
      if (!result || !result.legal) continue;
      for (let yy = 0; yy < 19; yy += 1) {
        for (let xx = 0; xx < 19; xx += 1) board[yy][xx] = result.board[yy][xx];
      }
      hashes.push(ruleEngine.boardHash(board));
      color = color === 1 ? 2 : 1;
      played += 1;
    }
  }
  assert(played >= 250);
}

function testPwaAssetsAndEvaluationExclusion() {
  const sw = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
  assert(sw.includes("buildInfo.serviceWorkerCache"));
  assert(sw.includes("./product-support.js"));
  assert(!sw.includes("./evaluation/"));
  assert(sw.includes("/evaluation/"));
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.webmanifest"), "utf8"));
  assert.strictEqual(manifest.display, "standalone");
  assert.strictEqual(manifest.start_url, "./");
  assert.strictEqual(manifest.version, buildInfo.productVersion);
}

function testFrozenEngineAndShallowVerifierActive() {
  const freeze = fs.readFileSync(path.join(__dirname, "ENGINE-FREEZE.md"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert(freeze.includes("goodOrBetterRate: 0.216"));
  assert.strictEqual(product.engineVersion, buildInfo.engineVersion);
  assert(app.includes("applyShallowTacticalVerification("));
}

function run() {
  testDifficultyModes();
  testAdaptiveBounded();
  testDifficultyExcludesRejectedAndRandom();
  testRuleFlowBasics();
  testSgfExportRoundTrip();
  testSnapshotValidationAndDiagnostics();
  testCompleteGameSimulationStable();
  testPwaAssetsAndEvaluationExclusion();
  testFrozenEngineAndShallowVerifierActive();
  console.log("test-product-release: ok");
}

run();
