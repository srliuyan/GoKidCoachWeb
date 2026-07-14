const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ruleEngine = require("./rule-engine.js");
const correction = require("./evaluation/run-v174-reply5-correction.js");

const empty = 0;
const black = 1;

function emptyBoard(size = 19) {
  return Array.from({ length: size }, () => Array(size).fill(empty));
}

function setStone(board, point, color) {
  board[point.y][point.x] = color;
}

function highRiskCandidate() {
  return {
    point: { x: 10, y: 9 },
    legal: true,
    ruleLegal: true,
    combinedScore: 100,
    sourceTags: ["whole_board_strategy"],
    purposeLabels: ["develop_influence"],
    candidateSource: "whole_board_strategy"
  };
}

function boardWithManyReplies() {
  const board = emptyBoard();
  setStone(board, { x: 9, y: 9 }, black);
  return board;
}

function testDefaultReplyCapRemainsFour() {
  const reading = ruleEngine.evaluateLocalSequence(boardWithManyReplies(), highRiskCandidate(), black, {
    maxDepth: 3,
    maxOpponentReplies: 4,
    maxAiContinuations: 3
  });
  assert(reading.generatedOpponentReplies.length <= 4);
  assert.strictEqual(reading.conditionalReply5Used, false);
}

function testMaxHighRiskCandidateUsesFifthReply() {
  const reading = ruleEngine.evaluateLocalSequence(boardWithManyReplies(), highRiskCandidate(), black, {
    maxDepth: 3,
    maxOpponentReplies: 4,
    maxAiContinuations: 3,
    allowConditionalReply5: true,
    difficultyMode: "MAX_STRENGTH_FIXED"
  });
  assert.strictEqual(reading.generatedOpponentReplies.length, 5);
  assert.strictEqual(reading.conditionalReply5Used, true);
  assert(["counterattack", "invasion_response", "reduction_response", "weak_group_tesuji", "sente_endgame_reply"].includes(reading.conditionalReply5Reason));
}

function testLowerModeStillUsesFour() {
  const reading = ruleEngine.evaluateLocalSequence(boardWithManyReplies(), highRiskCandidate(), black, {
    maxDepth: 3,
    maxOpponentReplies: 4,
    maxAiContinuations: 3,
    allowConditionalReply5: true,
    difficultyMode: "basic"
  });
  assert(reading.generatedOpponentReplies.length <= 4);
  assert.strictEqual(reading.conditionalReply5Used, false);
}

function testReplySixNotEnabled() {
  const reading = ruleEngine.evaluateLocalSequence(boardWithManyReplies(), highRiskCandidate(), black, {
    maxDepth: 3,
    maxOpponentReplies: 6,
    maxAiContinuations: 3,
    allowConditionalReply5: true,
    difficultyMode: "MAX_STRENGTH_FIXED"
  });
  assert.strictEqual(reading.generatedOpponentReplies.length, 5);
}

function testCorrectionProfilesAndGates() {
  const result = correction.run();
  assert.strictEqual(result.gate.selectedProfile, "conditional_5");
  assert.strictEqual(result.gate.criticalFifthReplyMissCount, 0);
  assert.strictEqual(result.gate.tacticalRefutationMissCount, 0);
  assert.strictEqual(result.gate.worsenedMoveCount, 0);
  assert(result.gate.averageLatencyGrowthPct <= 8);
  assert(result.gate.p95LatencyGrowthPct <= 10);
  assert.strictEqual(result.gate.reply6Enabled, false);
  assert.strictEqual(result.gate.lowerDifficultyBehaviorChanged, false);
}

function testCheckModeDoesNotWriteReports() {
  const report = path.join(__dirname, "evaluation", "v174-reply5-gate-result.json");
  const before = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  correction.run();
  const after = fs.existsSync(report) ? fs.readFileSync(report, "utf8") : null;
  assert.strictEqual(after, before);
}

function run() {
  testDefaultReplyCapRemainsFour();
  testMaxHighRiskCandidateUsesFifthReply();
  testLowerModeStillUsesFour();
  testReplySixNotEnabled();
  testCorrectionProfilesAndGates();
  testCheckModeDoesNotWriteReports();
  console.log("test-v174-reply5-correction: ok");
}

run();
