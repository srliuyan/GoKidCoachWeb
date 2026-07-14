const assert = require("assert");
const stress = require("./evaluation/run-v16-bad-move-stress.js");
const v161Audit = require("./evaluation/run-v161-endgame-audit.js");
const v162Audit = require("./evaluation/run-v162-sente-gote-audit.js");

function run() {
  const result = stress.run({ seed: 20260713, positions: 800 });
  assert(result.endgame.positions.length >= 150);
  assert("dameSelectedWithYoseAvailableCount" in result.endgame);
  assert("ownTerritoryFillCount" in result.endgame);
  assert("meaninglessFirstLineCount" in result.endgame);
  assert("largeYoseIgnoredCount" in result.endgame);
  assert.strictEqual(result.endgame.endgameTacticalOverrideAccuracy, 1);
  const endgameAudit = v161Audit.run({ seed: 20260713, positions: 300 });
  assert(endgameAudit.summary.auditedEndgamePositionCount >= 300);
  assert("ownTerritoryFillCount" in endgameAudit.summary);
  assert("dameBeforeMeaningfulYoseCount" in endgameAudit.summary);
  assert("equivalentEndgameSolutionSelectedCount" in endgameAudit.summary);
  assert("detectorUncertainCount" in endgameAudit.summary);
  const v162 = v162Audit.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  assert.strictEqual(v162.gate.passed, true);
  assert.strictEqual(v162.profiles.smallest_passing_combination.senteGoteMisclassificationCount, 0);
  console.log("test-endgame-stress: ok");
}

run();
