const assert = require("assert");
const fs = require("fs");
const path = require("path");

const buildInfo = require("./build-info.js");
const product = require("./product-support.js");
const ruleEngine = require("./rule-engine.js");
const longGame = require("./evaluation/run-long-game-performance.js");
const v14 = require("./evaluation/run-v14-audits.js");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "evaluation", name), "utf8"));
}

function ensureReports() {
  longGame.run();
}

function testMoveCountsComplete() {
  const game = longGame.simulateLongGame(300);
  for (const count of [50, 100, 150, 200, 250, 300]) {
    assert(game.moves.length >= count, `${count}-move simulation completes`);
  }
}

function testFinalBoardAndExport() {
  const report = readJson("long-game-performance-report.json");
  assert.strictEqual(report.performanceAcceptance.simulation300MovesCompleted, true);
  assert.strictEqual(report.exportIntegrity.actualMoveCount, 300);
  assert.strictEqual(report.exportIntegrity.sgfMoveCount, 300);
  assert.strictEqual(report.exportIntegrity.exportIntegrityPassed, true);
}

function testAdvancedFixed() {
  const game = longGame.simulateLongGame(300);
  const snapshot = product.normalizeSnapshot({
    size: 19,
    board: game.board,
    moveHistory: game.moveHistory,
    difficultyMode: "advanced",
    difficultyStart: 980,
    difficultyEnd: 980
  });
  assert.strictEqual(snapshot.difficultyStart, 980);
  assert.strictEqual(snapshot.difficultyEnd, 980);
}

function testAnalysisContextInvalidation() {
  const board = Array.from({ length: 19 }, () => Array(19).fill(0));
  board[3][3] = 1;
  board[3][4] = 1;
  const context = ruleEngine.createAnalysisContext(board);
  const cached = ruleEngine.cachedGroupAt(board, { x: 3, y: 3 }, context);
  const uncached = ruleEngine.groupAt(board, { x: 3, y: 3 });
  assert.strictEqual(cached.stones.length, uncached.stones.length);
  assert.strictEqual(cached.liberties.size, uncached.liberties.size);
  context.invalidate();
  assert.strictEqual(context.valid, false);
  const changed = board.map(row => row.slice());
  changed[4][3] = 2;
  const mismatch = ruleEngine.cachedGroupAt(changed, { x: 3, y: 3 }, context);
  assert.strictEqual(mismatch.stones.length, ruleEngine.groupAt(changed, { x: 3, y: 3 }).stones.length);
}

function testCacheDoesNotCrossBoardHashes() {
  const board = Array.from({ length: 19 }, () => Array(19).fill(0));
  board[3][3] = 1;
  const context = ruleEngine.createAnalysisContext(board);
  ruleEngine.cachedGroupAt(board, { x: 3, y: 3 }, context);
  const changed = board.map(row => row.slice());
  changed[3][4] = 1;
  const cached = ruleEngine.cachedGroupAt(changed, { x: 3, y: 3 }, context);
  const uncached = ruleEngine.groupAt(changed, { x: 3, y: 3 });
  assert.strictEqual(cached.stones.length, uncached.stones.length);
}

function testCachedSelectedMoveCompatibility() {
  const board = Array.from({ length: 19 }, () => Array(19).fill(0));
  board[1][1] = 2;
  board[0][1] = 1;
  board[1][0] = 1;
  board[1][2] = 1;
  const context = ruleEngine.createAnalysisContext(board);
  const cached = ruleEngine.cachedSimulateMove(board, { x: 1, y: 2 }, 1, [], context);
  const uncached = ruleEngine.simulateMove(board, { x: 1, y: 2 }, 1, []);
  assert.strictEqual(cached.legal, uncached.legal);
  assert.strictEqual(cached.captures, uncached.captures);
}

function testCapsAndPersistence() {
  const report = readJson("long-game-performance-report.json");
  assert.strictEqual(report.diagnosticsCaps.detailedMoveDiagnostics, 100);
  assert.strictEqual(report.diagnosticsCaps.detailedCandidateDiagnostics, 20);
  assert.strictEqual(report.diagnosticsCaps.rawStageTimings, 100);
  assert.strictEqual(report.diagnosticsCaps.recoverySnapshotInterval, 20);
  assert(report.rangesAfter.every(row => row.averagePersistencePayloadBytes > 0));
}

function testSgfAndDebugNotBuiltDuringNormalPlay() {
  const hotspots = readJson("performance-hotspots.json");
  assert(hotspots.rootCause.includes("SGF/debug"));
  const debugHotspot = hotspots.topHotspots.find(item => item.name.includes("debug"));
  assert(debugHotspot);
  assert(debugHotspot.totalTimeMsAfter < debugHotspot.totalTimeMsBefore);
}

function testListenersDomAndMemoryBounded() {
  const report = readJson("long-game-performance-report.json");
  assert.strictEqual(report.performanceAcceptance.listenerCountStable, true);
  assert.strictEqual(report.performanceAcceptance.domNodeCountStable, true);
  assert.strictEqual(report.performanceAcceptance.diagnosticsBounded, true);
  const late = report.rangesAfter.find(row => row.range === "251-300");
  assert(late.estimatedMemoryGrowthBytes < 10000);
}

function testPerformanceGates() {
  const report = readJson("long-game-performance-report.json");
  assert.strictEqual(report.performanceAcceptance.passed, true);
  assert(report.performanceAcceptance.p95_201_250_vs_51_100 <= 1.5);
  assert(report.performanceAcceptance.p95_251_300_vs_51_100 <= 1.7);
  assert(report.performanceAcceptance.maximumNormalDesktopReferenceMoveMs <= 500);
  assert(report.performanceAcceptance.localReadingP95Ms <= 80);
  assert(report.performanceAcceptance.localReadingMaximumMs <= 120);
  assert(report.performanceAcceptance.persistenceP95Ms <= 30);
}

function testBuildAndExportAuditsStillPass() {
  assert.strictEqual(v14.buildConsistencyAudit().passed, true);
  assert.strictEqual(v14.exportIntegrityReport().passed, true);
  assert.strictEqual(v14.phaseTransitionAudit().passed, true);
  assert.strictEqual(buildInfo.appVersion, buildInfo.productVersion);
  assert.strictEqual(buildInfo.engineVersion, "candidate-coverage-v1");
}

function run() {
  ensureReports();
  testMoveCountsComplete();
  testFinalBoardAndExport();
  testAdvancedFixed();
  testAnalysisContextInvalidation();
  testCacheDoesNotCrossBoardHashes();
  testCachedSelectedMoveCompatibility();
  testCapsAndPersistence();
  testSgfAndDebugNotBuiltDuringNormalPlay();
  testListenersDomAndMemoryBounded();
  testPerformanceGates();
  testBuildAndExportAuditsStillPass();
  console.log("test-long-game-performance: ok");
}

run();
