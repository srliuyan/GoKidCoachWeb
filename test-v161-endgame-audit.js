const assert = require("assert");
const audit = require("./evaluation/run-v161-endgame-audit.js");
const endgame = require("./evaluation/endgame-value-detectors.js");

function run() {
  const first = audit.run({ seed: 20260713, positions: 300 });
  const second = audit.run({ seed: 20260713, positions: 300 });
  assert(first.summary.auditedEndgamePositionCount >= 300);
  assert.strictEqual(first.summary.legalPositionCount, first.summary.auditedEndgamePositionCount);
  assert.deepStrictEqual(
    first.traces.map(row => [row.positionId, row.category, row.whereBetterMoveWasLost]),
    second.traces.map(row => [row.positionId, row.category, row.whereBetterMoveWasLost])
  );
  assert("dameBeforeMeaningfulYoseCount" in first.summary);
  assert("largeYoseIgnoredCount" in first.summary);
  assert("equivalentEndgameSolutionSelectedCount" in first.summary);
  assert(first.traces.every(row => row.whereBetterMoveWasLost || row.confidence === "low"));
  assert(first.summary.detectorUncertainCount >= 0);
  assert.strictEqual(first.summary.falsePositiveCount, 0);
  assert.strictEqual(first.summary.territoryClassificationAccuracy, 1);
  assert.strictEqual(first.summary.senteGoteClassificationAccuracy, 1);

  const position = first.positions[0];
  const selection = require("./evaluation/run-v16-bad-move-stress.js").selectMove(position);
  const detected = endgame.detectEndgameError(position, selection);
  assert(detected.category);
  assert(detected.lossStage);
  console.log("test-v161-endgame-audit: ok");
}

run();
