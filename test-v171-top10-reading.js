const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ruleEngine = require("./rule-engine.js");
const v171 = require("./evaluation/run-v171-top10-reading-audit.js");

const black = 1;
const white = 2;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function candidate(point, overrides = {}) {
  return {
    point,
    legal: true,
    ruleLegal: true,
    combinedScore: 200,
    fusedPolicyScore: 200,
    sourceTags: ["test"],
    coherentClass: "coherent",
    ...overrides
  };
}

function testMaximumModeReadsUpToTenCandidates() {
  const board = emptyBoard();
  board[1][1] = white;
  board[0][1] = black;
  board[1][0] = black;
  board[2][1] = black;
  const candidates = Array.from({ length: 12 }, (_, index) => candidate({ x: index % 19, y: Math.floor(index / 19) }, { combinedScore: 300 - index }));
  candidates[9] = candidate({ x: 1, y: 2 }, { captures: 1, combinedScore: 110 });
  const result = ruleEngine.applyLocalReading(candidates, board, black, { maxCandidates: 10, maxOpponentReplies: 4, maxAiContinuations: 3 });
  assert(result.diagnostics.candidatesRead <= 10);
  assert.notStrictEqual(result.candidates[9].localReadingStatus, "not_read");
  assert.strictEqual(result.candidates[10].localReadingStatus, "not_read");
}

function testLowerModesPreserveOriginalCap() {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert(source.includes("maxCandidates: maxMode ? 10 : 8"));
}

function testRank9AndRank10MayWinInAudit() {
  const result = v171.run({ seed: 20260713, selfPlayGames: 100 });
  assert(result.summary.rank9BecameFinalChoiceCount > 0);
  assert(result.summary.rank10BecameFinalChoiceCount > 0);
  assert.strictEqual(result.summary.rank9Or10WorsenedMoveCount, 0);
}

function testRejectedRank9Or10CannotBeSelected() {
  const position = {
    dataset: "unit",
    positionId: "rejected_rank9",
    moveNumber: 80,
    phase: "middlegame",
    candidates: Array.from({ length: 12 }, (_, index) => candidate({ x: index, y: 0 }, {
      score: 300 - index,
      combinedScore: 300 - index,
      coherentClass: index === 8 ? "rejected" : "coherent"
    }))
  };
  const row = v171.evaluatePosition(position, 0);
  assert.strictEqual(row.rank9Or10WasRejected, true);
  assert.notDeepStrictEqual(row.top10SelectedMove, { x: 8, y: 0 });
}

function testMetadataSurvivesTop10Reading() {
  const result = v171.run({ seed: 20260713, selfPlayGames: 100 });
  const winner = result.winners.cases[0];
  assert(winner);
  const traced = winner.candidateTrace.find(item => item.initialRank === winner.originalRankOfFinalSelectedMove);
  assert(traced);
  assert(Array.isArray(traced.sourceTags));
  assert.strictEqual(typeof traced.preReadingScore, "number");
  assert(traced.readingResult);
  assert.strictEqual(typeof traced.finalRank, "number");
  assert.strictEqual(typeof traced.selectedReason, "string");
}

function testDeterministicAndGatesPass() {
  const first = v171.run({ seed: 20260713, selfPlayGames: 100 });
  const second = v171.run({ seed: 20260713, selfPlayGames: 100 });
  assert.deepStrictEqual(first.summary, second.summary);
  assert.strictEqual(first.gate.passed, true);
  assert.strictEqual(first.gate.top10Integrated, true);
  assert.strictEqual(first.gate.maxModeSafety.adaptiveWeakeningCount, 0);
  assert.strictEqual(first.gate.maxModeSafety.randomSofteningCount, 0);
  assert.strictEqual(first.gate.maxModeSafety.postGuardRerankingCount, 0);
}

function testNoCanonicalReportsWrittenInCheckMode() {
  const report = path.join(__dirname, "evaluation", "v171-top10-reading-summary.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  v171.run({ seed: 20260713, selfPlayGames: 100 });
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function run() {
  testMaximumModeReadsUpToTenCandidates();
  testLowerModesPreserveOriginalCap();
  testRank9AndRank10MayWinInAudit();
  testRejectedRank9Or10CannotBeSelected();
  testMetadataSurvivesTop10Reading();
  testDeterministicAndGatesPass();
  testNoCanonicalReportsWrittenInCheckMode();
  console.log("test-v171-top10-reading: ok");
}

run();
