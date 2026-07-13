const assert = require("assert");
const fs = require("fs");
const path = require("path");

const buildInfo = require("./build-info.js");
const product = require("./product-support.js");
const ruleEngine = require("./rule-engine.js");
const cleanup = require("./evaluation/run-cleanup-audit.js");
const v14 = require("./evaluation/run-v14-audits.js");
const longGame = require("./evaluation/run-long-game-performance.js");

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "evaluation", name), "utf8"));
}

function source(file) {
  return fs.readFileSync(path.join(__dirname, file), "utf8");
}

function ensureReports() {
  cleanup.main();
}

function testRuntimeScriptsExist() {
  const map = load("active-dependency-map.json");
  for (const script of map.indexScripts) {
    assert(fs.existsSync(path.join(__dirname, script)), script);
  }
}

function testCachedAssetsExistAndAreClean() {
  const audit = load("service-worker-asset-audit.json");
  assert.strictEqual(audit.passed, true);
  assert.deepStrictEqual(audit.missingAssets, []);
  assert.deepStrictEqual(audit.cachedEvaluationAssets, []);
  assert.deepStrictEqual(audit.cachedTestAssets, []);
  assert.deepStrictEqual(audit.cachedReleaseAuditAssets, []);
}

function testSingleBuildInfoSource() {
  const sw = source("sw.js");
  const productSource = source("product-support.js");
  const app = source("app.js");
  assert(sw.includes("importScripts(\"./build-info.js\")"));
  assert(!sw.includes("gokidcoach-web-v44-middlegame-performance-dev\""));
  assert(!productSource.includes("gokidcoach-web-v44-middlegame-performance-dev\""));
  assert(!app.includes("gokidcoach-1.4.0-dev-middlegame-performance-v1-20260713"));
  assert.strictEqual(buildInfo.appVersion, product.appVersion);
  assert.strictEqual(buildInfo.engineVersion, product.engineVersion);
}

function testDifficultyMappingSourceKnown() {
  assert.strictEqual(product.difficultyModes.advanced.level, 980);
  assert.strictEqual(product.difficultyModes.beginner.level, 720);
  const difficulty = source("difficulty-controller.js");
  assert(difficulty.includes("getDifficultySettings"));
}

function testNoOldVersionEmitted() {
  const active = ["app.js", "product-support.js", "index.html", "sw.js", "manifest.webmanifest", "build-info.js"].map(source).join("\n");
  assert(!active.includes("1.0.0-rc1"));
  assert(!active.includes("baseline-v3.6-frozen"));
}

function testFallbackAndConnectionPromotionSafety() {
  const app = source("app.js");
  assert(app.includes("|| ranked.ranked?.[0]"));
  assert(app.includes("|| adjusted[0]"));
  const rule = source("rule-engine.js");
  assert(!rule.includes("verified_connection\", \"verified_capture"));
  assert(rule.includes("verified_connection"));
}

function testSgfAndDebugGeneratedOnExportOnly() {
  const app = source("app.js");
  assert(app.includes("function exportSGF()"));
  assert(app.includes("function exportDebugSummary()"));
  assert(app.includes("const sgf = buildSGF(snapshot);"));
  assert(!app.includes("saveCurrentGame() {\n  const sgf"));
}

function testCompactPersistenceRestore() {
  const snapshot = product.normalizeSnapshot({
    size: 19,
    board: Array.from({ length: 19 }, () => Array(19).fill(0)),
    moveHistory: [{ x: 3, y: 3, color: 1, pass: false }]
  });
  assert.strictEqual(snapshot.actualMoveCount, 1);
  const sgf = product.buildSGF({ moveHistory: snapshot.moveHistory, buildId: buildInfo.buildId });
  const replay = product.replaySgf(sgf, ruleEngine.simulateMove);
  assert.strictEqual(replay.legal, true);
  assert.strictEqual(replay.moves.length, 1);
}

function testCachedAndUncachedRulesMatch() {
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

function testBehaviorLocksMatch() {
  const comparison = load("cleanup-behavior-comparison.json");
  assert.strictEqual(comparison.passed, true);
  assert.strictEqual(comparison.selectedMovesIdentical, true);
  assert.strictEqual(comparison.finalBoardHashIdentical, true);
  assert.strictEqual(comparison.sgfHashIdentical, true);
  assert.strictEqual(comparison.benchmarkMetricsIdentical, true);
}

function testGuardrailsPass() {
  assert.strictEqual(v14.buildConsistencyAudit().passed, true);
  assert.strictEqual(v14.exportIntegrityReport().passed, true);
  assert.strictEqual(longGame.run().report.performanceAcceptance.passed, true);
}

function run() {
  ensureReports();
  testRuntimeScriptsExist();
  testCachedAssetsExistAndAreClean();
  testSingleBuildInfoSource();
  testDifficultyMappingSourceKnown();
  testNoOldVersionEmitted();
  testFallbackAndConnectionPromotionSafety();
  testSgfAndDebugGeneratedOnExportOnly();
  testCompactPersistenceRestore();
  testCachedAndUncachedRulesMatch();
  testBehaviorLocksMatch();
  testGuardrailsPass();
  console.log("test-cleanup-integrity: ok");
}

run();
