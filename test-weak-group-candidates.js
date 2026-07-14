const assert = require("assert");
const audit = require("./evaluation/run-v172-candidate-breadth-audit.js");

function testOwnWeakGroupCandidateOmissionDetected() {
  const result = audit.run({ seed: 20260714 });
  assert(result.opportunities.opportunities.some(item => item.opportunityType === "weak_group_move_missing"));
}

function testOpponentWeakGroupAttackOmissionDetected() {
  const result = audit.run({ seed: 20260714 });
  assert(result.opportunities.opportunities.some(item => item.opportunityType === "missing_attack_candidate"));
}

function testUncertainWeakGroupOpportunityNonActionable() {
  const result = audit.run({ seed: 20260714 });
  const uncertain = result.opportunities.opportunities.find(item => item.uncertain);
  assert(uncertain);
  assert.strictEqual(uncertain.confidence, "uncertain");
  assert.strictEqual(uncertain.failureStage, "uncertain");
}

function run() {
  testOwnWeakGroupCandidateOmissionDetected();
  testOpponentWeakGroupAttackOmissionDetected();
  testUncertainWeakGroupOpportunityNonActionable();
  console.log("test-weak-group-candidates: ok");
}

run();
