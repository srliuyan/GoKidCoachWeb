const assert = require("assert");
const product = require("./product-support.js");
const buildInfo = require("./build-info.js");
const ruleEngine = require("./rule-engine.js");
const audits = require("./evaluation/run-v14-audits.js");

function parsedReport() {
  return audits.exportIntegrityReport();
}

function caseFor(count, source = null) {
  const cases = parsedReport().cases;
  return cases.find(item => item.moveCountRequested === count && (!source || item.exportSnapshotSource === source));
}

function testMoveCount(count) {
  const item = caseFor(count);
  assert(item, `case ${count}`);
  assert.strictEqual(item.actualMoveCount, count);
  assert.strictEqual(item.sgfMoveCount, count);
  assert.strictEqual(item.exportIntegrityPassed, true);
}

function testAbandonedPreservesMoves() {
  const item = caseFor(37, "abandoned");
  assert(item);
  assert.strictEqual(item.actualMoveCount, 37);
  assert.strictEqual(item.sgfMoveCount, 37);
}

function testNewGameDoesNotDestroyPreviousSnapshot() {
  const item = parsedReport().cases.find(row => row.preservedAfterNewGame);
  assert(item);
  assert.strictEqual(item.actualMoveCount, 37);
  assert.strictEqual(item.exportIntegrityPassed, true);
}

function testDebugMoveCountEqualsSgfMoveCount() {
  for (const item of parsedReport().cases) assert.strictEqual(item.actualMoveCount, item.sgfMoveCount);
}

function testSgfReplayMatchesFinalBoard() {
  for (const item of parsedReport().cases) assert.strictEqual(item.finalBoardHash, item.replayedBoardHash);
}

function testAiTimingCountEqualsAiMoveCount() {
  for (const item of parsedReport().cases) assert.strictEqual(item.aiTimingCount, item.aiMoveCount);
}

function testAdvancedRemains980() {
  for (const item of parsedReport().cases) {
    assert.strictEqual(item.advancedStart, 980);
    assert.strictEqual(item.advancedEnd, 980);
  }
}

function testZeroMoveExportsCorrectly() {
  const item = caseFor(0);
  assert(item);
  assert.strictEqual(item.actualMoveCount, 0);
  assert.strictEqual(item.sgfMoveCount, 0);
  assert.strictEqual(item.exportIntegrityPassed, true);
}

function testMetadataMatchesBuildInfo() {
  for (const item of parsedReport().cases) {
    assert.strictEqual(item.appVersion, buildInfo.appVersion);
    assert.strictEqual(item.engineVersion, buildInfo.engineVersion);
    assert.strictEqual(item.buildId, buildInfo.buildId);
  }
  assert.strictEqual(product.appVersion, buildInfo.appVersion);
  assert.strictEqual(product.engineVersion, buildInfo.engineVersion);
}

function testOldSchemaMigratesSafely() {
  const old = product.normalizeSnapshot({ size: 19, board: Array.from({ length: 19 }, () => Array(19).fill(0)), moves: [{ x: 3, y: 3, color: 1 }] });
  assert.strictEqual(old.moveHistory.length, 1);
  assert.strictEqual(old.actualMoveCount, 1);
  assert.strictEqual(old.buildId, buildInfo.buildId);
}

function testDirectSgfReplay() {
  const sgf = product.buildSGF({ moveHistory: [{ x: 3, y: 3, color: 1, pass: false }], buildId: buildInfo.buildId });
  const replay = product.replaySgf(sgf, ruleEngine.simulateMove);
  assert.strictEqual(replay.legal, true);
  assert.strictEqual(replay.moves.length, 1);
}

function run() {
  testMoveCount(20);
  testMoveCount(100);
  testMoveCount(200);
  testAbandonedPreservesMoves();
  testNewGameDoesNotDestroyPreviousSnapshot();
  testDebugMoveCountEqualsSgfMoveCount();
  testSgfReplayMatchesFinalBoard();
  testAiTimingCountEqualsAiMoveCount();
  testAdvancedRemains980();
  testZeroMoveExportsCorrectly();
  testMetadataMatchesBuildInfo();
  testOldSchemaMigratesSafely();
  testDirectSgfReplay();
  console.log("test-export-integrity: ok");
}

run();
