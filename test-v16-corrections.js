const assert = require("assert");
const stress = require("./evaluation/run-v16-bad-move-stress.js");

function run() {
  const result = stress.run({ seed: 20260713, positions: 800 });
  const summary = result.summary;
  assert(summary.equivalentTacticalSolutionSelectedCount > 0);
  assert(summary.nonurgentCaptureOpportunityCount > 0);
  assert(summary.detectorUncertainCount > 0);
  assert(summary.calibratedHighConfidenceBadMoveCount < 648);
  assert(summary.verifiedUrgentMoveIgnoredCount >= 0);
  assert(summary.verifiedProfitableCaptureIgnoredCount >= 0);

  const profiles = result.profiles;
  assert(profiles.urgent_selector_guard_only.verifiedUrgentMoveIgnoredCount <= profiles.baseline_v151.verifiedUrgentMoveIgnoredCount);
  assert(profiles.profitable_capture_guard_only.verifiedProfitableCaptureIgnoredCount <= profiles.baseline_v151.verifiedProfitableCaptureIgnoredCount);
  assert(profiles.all_selected_corrections.ownTerritoryFillCount <= profiles.baseline_v151.ownTerritoryFillCount);
  assert(profiles.all_selected_corrections.finalSelectorErrorCount < profiles.baseline_v151.finalSelectorErrorCount);

  const gate = result.gate;
  assert.strictEqual(gate.bestProfile, "all_selected_corrections");
  assert.strictEqual(gate.passed, true);
  assert.strictEqual(gate.runtimeIntegrated, true);
  assert.strictEqual(gate.deploymentOccurred, false);
  console.log("test-v16-corrections: ok");
}

run();
