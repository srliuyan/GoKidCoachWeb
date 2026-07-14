const assert = require("assert");
const audit = require("./evaluation/run-v161-endgame-audit.js");

function run() {
  const first = audit.run({ seed: 20260713, positions: 300 });
  const second = audit.run({ seed: 20260713, positions: 300 });
  assert.deepStrictEqual(
    first.beforeAfter.changedCases.map(row => [row.positionId, row.category, row.correctedMove]),
    second.beforeAfter.changedCases.map(row => [row.positionId, row.category, row.correctedMove])
  );

  const report = { profiles: first.profiles };
  const baseline = report.profiles.baseline_v16;
  const best = report.profiles.smallest_passing_combination;
  assert.strictEqual(best.name, "all_three_corrections");
  assert(best.calibratedEndgameBadMoveCount < baseline.calibratedEndgameBadMoveCount);
  assert.strictEqual(best.tacticalOverrideMissedCount, 0);
  assert.strictEqual(best.lowValueSecondLineCount, 0);
  assert.strictEqual(best.largeYoseIgnoredCount, 0);
  assert.strictEqual(best.falsePositiveCount, 0);
  assert.strictEqual(best.equivalentEndgameSolutionSelectedCount, baseline.equivalentEndgameSolutionSelectedCount);
  assert.strictEqual(best.detectorUncertainCount, baseline.detectorUncertainCount);

  const gate = first.gate;
  assert.strictEqual(gate.bestProfile, "all_three_corrections");
  assert.strictEqual(gate.passed, true);
  assert.strictEqual(gate.runtimeIntegrated, true);
  assert.strictEqual(gate.deploymentOccurred, false);

  const selectorAudit = first.finalSelectorAudit;
  assert(selectorAudit.correctionCategories.includes("tactical_override_missed"));
  assert(selectorAudit.correctionCategories.includes("low_value_second_line"));
  assert(selectorAudit.correctionCategories.includes("large_yose_ignored"));

  console.log("test-v161-corrections: ok");
}

run();
