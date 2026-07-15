const assert = require("assert");
const product = require("./product-support.js");

function run() {
  const snapshot = product.normalizeSnapshot({
    id: "g1",
    size: 19,
    board: Array.from({ length: 19 }, () => Array(19).fill(0)),
    moveHistory: [],
    difficultyMode: "MAX_STRENGTH_FIXED"
  });
  assert.strictEqual(snapshot.moveHistory.length, 0);
  assert.strictEqual(product.normalizeDifficultyMode(snapshot.difficultyMode), "MAX_STRENGTH_FIXED");
  assert.strictEqual(product.normalizeSnapshot({ ...snapshot, difficultyMode: "not-real" }).difficultyMode, "adaptive");
  assert.strictEqual(product.normalizeSnapshot({ ...snapshot, difficultyMode: 980 }).difficultyMode, "advanced");
  const summary = product.diagnosticSummary({
    difficultyMode: "MAX_STRENGTH_FIXED",
    adaptiveWeakeningEnabled: false,
    randomSofteningEnabled: false,
    selectedCandidateFinalRank: 1,
    selectedCandidateTier: "bestMove"
  });
  assert.strictEqual(summary.difficultyMode, "MAX_STRENGTH_FIXED");
  assert.strictEqual(summary.adaptiveWeakeningEnabled, false);
  assert.strictEqual(summary.randomSofteningEnabled, false);
  console.log("test-save-restore: ok");
}

run();
