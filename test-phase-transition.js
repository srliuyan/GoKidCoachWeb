const assert = require("assert");
const audits = require("./evaluation/run-v14-audits.js");

function report() {
  return audits.phaseTransitionAudit();
}

function byMove(moveNumber) {
  return report().moves.find(item => item.moveNumber === moveNumber);
}

function testOpeningDominantEarly() {
  const move = byMove(8);
  assert.strictEqual(move.phase, "opening");
  assert(move.sourceWeights.openingBook >= 0.9);
  assert(move.sourceWeights.fuseki >= 0.9);
}

function testTransitionSmoothAt17() {
  const before = byMove(16);
  const after = byMove(17);
  assert(Math.abs(after.sourceWeights.fuseki - before.sourceWeights.fuseki) < 0.05);
  assert(Math.abs(after.sourceWeights.midgameStability - before.sourceWeights.midgameStability) < 0.08);
}

function testNoCliffAt20_24_30_40() {
  const data = report();
  for (const moveNumber of [20, 24, 30, 40]) {
    const prev = data.moves.find(item => item.moveNumber === moveNumber - 1);
    const cur = data.moves.find(item => item.moveNumber === moveNumber);
    for (const key of Object.keys(cur.sourceWeights)) {
      assert(Math.abs(cur.sourceWeights[key] - prev.sourceWeights[key]) <= 0.18, `${moveNumber}:${key}`);
    }
  }
}

function testMiddlegameDominantAfter36() {
  const move = byMove(40);
  assert.strictEqual(move.phase, "middlegame");
  assert(move.sourceWeights.midgameStability >= move.sourceWeights.fuseki);
  assert(move.sourceWeights.position >= 0.95);
}

function testCandidateCountsLimitedAfter16() {
  for (const move of report().moves.filter(item => item.moveNumber > 16)) {
    assert(move.candidateCount <= 12);
    assert(move.coherentCandidateCount > 0);
  }
}

function testNoFallbackInTransitionAudit() {
  assert.strictEqual(report().moves.reduce((sum, move) => sum + move.fallbackCount, 0), 0);
}

function testSelectedTierAvailable() {
  for (const move of report().moves) assert(move.selectedTier);
}

function testPhaseReportPasses() {
  assert.strictEqual(report().passed, true);
}

function run() {
  testOpeningDominantEarly();
  testTransitionSmoothAt17();
  testNoCliffAt20_24_30_40();
  testMiddlegameDominantAfter36();
  testCandidateCountsLimitedAfter16();
  testNoFallbackInTransitionAudit();
  testSelectedTierAvailable();
  testPhaseReportPasses();
  console.log("test-phase-transition: ok");
}

run();
