const assert = require("assert");
const audit = require("./evaluation/run-v172-candidate-breadth-audit.js");

function testEveryCandidateHasSourceTagAndPurpose() {
  const result = audit.run({ seed: 20260714, positions: 80 });
  for (const row of result.rows) {
    for (const candidate of row.candidateSample) {
      assert(Array.isArray(candidate.sourceTags));
      assert(candidate.sourceTags.length > 0);
      assert(Array.isArray(candidate.purposes));
      assert(candidate.purposes.length > 0);
    }
  }
}

function testDedupPreservesSourceTagsAndPurposes() {
  const deduped = audit.deduplicate([
    { key: "3,3", point: { x: 3, y: 3 }, sourceTags: ["policy"], purposes: ["global_large_point"] },
    { key: "3,3", point: { x: 3, y: 3 }, sourceTags: ["shape"], purposes: ["connection"] }
  ]);
  assert.strictEqual(deduped.candidates.length, 1);
  assert.deepStrictEqual(deduped.candidates[0].sourceTags.sort(), ["policy", "shape"]);
  assert.deepStrictEqual(deduped.candidates[0].purposes.sort(), ["connection", "global_large_point"]);
  assert.strictEqual(deduped.crossSourceDuplicateCount, 1);
}

function testSourceInventoryCompleteEnoughForAudit() {
  const tags = audit.sourceInventory.map(item => item[2]);
  for (const expected of ["opening_book", "rule_engine", "tactical_pattern", "weak_group_rescue", "weak_group_attack", "whole_board_strategy", "endgame", "invasion_reduction_probe", "tenuki_probe"]) {
    assert(tags.includes(expected), expected);
  }
}

function run() {
  testEveryCandidateHasSourceTagAndPurpose();
  testDedupPreservesSourceTagsAndPurposes();
  testSourceInventoryCompleteEnoughForAudit();
  console.log("test-candidate-source-tags: ok");
}

run();
