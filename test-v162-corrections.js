const assert = require("assert");
const audit = require("./evaluation/run-v162-sente-gote-audit.js");

function run() {
  const first = audit.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  const second = audit.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  assert.deepStrictEqual(
    first.traces.map(row => [row.positionId, row.rootCause, row.exactPipelineStage]),
    second.traces.map(row => [row.positionId, row.rootCause, row.exactPipelineStage])
  );
  assert.strictEqual(first.traces.length, 2);
  assert(first.traces.every(row => row.rootCause === "tactical_reply_confused_with_sente"));
  assert(first.traces.every(row => row.selectedEndgameClass === "tactical_endgame" || row.alternativeEndgameClass === "tactical_endgame"));

  const report = first.correctionReport;
  assert.strictEqual(report.profiles.baseline_v161.senteGoteMisclassificationCount, 2);
  assert.strictEqual(report.profiles.classification_fix_only.senteGoteMisclassificationCount, 0);
  assert.strictEqual(report.profiles.smallest_passing_combination.name, "classification_fix_only");
  assert.strictEqual(report.profiles.smallest_passing_combination.calibratedEndgameBadMoveCount, 0);
  assert.strictEqual(report.profiles.smallest_passing_combination.uncertainCount, 31);
  assert.strictEqual(report.profiles.smallest_passing_combination.equivalentSolutionCount, 200);

  const gate = first.gate;
  assert.strictEqual(gate.passed, true);
  assert.strictEqual(gate.runtimeIntegrated, true);
  assert.strictEqual(gate.deploymentOccurred, false);

  const selectorAudit = first.finalSelectorAudit;
  assert.strictEqual(selectorAudit.authoritativeGuard, "finalSelectorGuard");
  assert.strictEqual(selectorAudit.noSecondFinalSelectorAdded, true);
  assert.strictEqual(selectorAudit.selectorChangeRequired, false);

  console.log("test-v162-corrections: ok");
}

run();
