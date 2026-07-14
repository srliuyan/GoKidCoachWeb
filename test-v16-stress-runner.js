const assert = require("assert");
const generator = require("./evaluation/generate-bad-move-stress-positions.js");
const stress = require("./evaluation/run-v16-bad-move-stress.js");
const ruleEngine = require("./rule-engine.js");

function testStressGenerationDeterministic() {
  const a = generator.generateStressPositions({ seed: 20260713, positions: 800 });
  const b = generator.generateStressPositions({ seed: 20260713, positions: 800 });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert(a.length >= 800);
}

function testGeneratedPositionsLegal() {
  const positions = generator.generateStressPositions({ seed: 20260713, positions: 800 });
  for (const position of positions) {
    assert.strictEqual(ruleEngine.boardHash(position.board), position.boardHash);
    assert(position.sideToMove === 1 || position.sideToMove === 2);
  }
}

function testRunnerDeterministicAndTraceable() {
  const a = stress.run({ seed: 20260713, positions: 800 });
  const b = stress.run({ seed: 20260713, positions: 800 });
  assert.strictEqual(a.summary.totalStressPositions, b.summary.totalStressPositions);
  assert.strictEqual(a.summary.highConfidenceBadMoveCount, b.summary.highConfidenceBadMoveCount);
  assert.strictEqual(a.summary.dominantCategory, b.summary.dominantCategory);
  assert.strictEqual(a.acceptance.passed, true);
  assert(a.traces.every(row => row.whereBetterCandidateWasLost));
}

function testCandidateLossStageClassificationDeterministic() {
  const result = stress.run({ seed: 20260713, positions: 800 });
  const stages = new Set(result.traces.map(row => row.whereBetterCandidateWasLost));
  assert(stages.size >= 1);
  assert(!stages.has("unknown"));
}

function run() {
  testStressGenerationDeterministic();
  testGeneratedPositionsLegal();
  testRunnerDeterministicAndTraceable();
  testCandidateLossStageClassificationDeterministic();
  console.log("test-v16-stress-runner: ok");
}

run();
