const assert = require("assert");
const detectors = require("./evaluation/bad-move-detectors.js");

function row(id, moveNumber, point, tags = []) {
  return { positionId: id, moveNumber, selectedMove: point, selectedSourceTags: tags };
}

function testSettledAreaRepetitionDetected() {
  const result = detectors.detectRepetitiveLocalPlay([
    row("a", 80, { x: 3, y: 3 }),
    row("b", 81, { x: 4, y: 4 }),
    row("c", 82, { x: 5, y: 5 })
  ]);
  assert(result.settledAreaRepetitionCount >= 1);
  assert(result.longestUnjustifiedLocalSequence >= 3);
}

function testActiveFightNotFalsePositive() {
  const result = detectors.detectRepetitiveLocalPlay([
    row("a", 80, { x: 3, y: 3 }, ["urgent_capture"]),
    row("b", 81, { x: 4, y: 4 }, ["urgent_rescue"]),
    row("c", 82, { x: 5, y: 5 }, ["critical_own_group_defense"])
  ]);
  assert.strictEqual(result.settledAreaRepetitionCount, 0);
}

function run() {
  testSettledAreaRepetitionDetected();
  testActiveFightNotFalsePositive();
  console.log("test-repetitive-local-play: ok");
}

run();
