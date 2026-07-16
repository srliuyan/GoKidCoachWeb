#!/usr/bin/env node
"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const ruleEngine = require("./rule-engine.js");
const v15 = require("./evaluation/run-v15-middlegame-audit.js");
const v201 = require("./evaluation/run-v201-candidate-recall-audit.js");

const root = __dirname;
const BLACK = 1;
const WHITE = 2;
const EMPTY = 0;

function emptyBoard() {
  return Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
}

function set(board, x, y, color) {
  board[y][x] = color;
}

function git(args) {
  return childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function trackedOrTrackable(file) {
  return git(["check-ignore", "-q", file, "--no-index"]).length === 0;
}

function isIgnored(file) {
  function parse(output) {
    const source = output.split("\t")[0] || "";
    const pattern = source.slice(source.lastIndexOf(":") + 1);
    return !pattern.startsWith("!");
  }
  try {
    const output = childProcess.execFileSync("git", ["check-ignore", "--no-index", "-v", file], { cwd: root, encoding: "utf8" });
    return parse(output);
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.length) return parse(error.stdout);
    return false;
  }
}

function testIgnoreRules() {
  assert.strictEqual(isIgnored("evaluation/fixtures/private/GoKidCoach-debug-2026-07-14.json"), true);
  assert.strictEqual(isIgnored("evaluation/v200-katago-analysis-root.jsonl"), true);
  assert.strictEqual(isIgnored("evaluation/v201-candidate-recall-audit.json"), true);
  assert.strictEqual(isIgnored("evaluation/extract-v200-positions.js"), false);
  assert.strictEqual(isIgnored("evaluation/run-v201-candidate-recall-audit.js"), false);
  assert.strictEqual(isIgnored("evaluation/test-v200-coordinate-roundtrip.js"), false);
}

function testWeakGroupAndCounterattackCandidates() {
  const board = emptyBoard();
  set(board, 8, 8, BLACK);
  set(board, 8, 9, BLACK);
  set(board, 7, 8, WHITE);
  set(board, 9, 8, WHITE);
  set(board, 8, 7, WHITE);
  set(board, 13, 13, WHITE);
  set(board, 13, 14, WHITE);
  set(board, 12, 13, BLACK);
  set(board, 14, 13, BLACK);
  const candidates = v15.generateCandidates(board, BLACK, { v201CandidateRecall: true });
  assert(candidates.some(candidate => (candidate.sourceTags || []).includes("v201_candidate_recall")));
  assert(candidates.some(candidate => /v201_urgent_group_defense|v201_large_escape_extension/.test(candidate.source)));
  assert(candidates.some(candidate => /v201_counterattack_weak_opponent_group/.test(candidate.source)));
  for (const candidate of candidates) {
    assert(Array.isArray(candidate.sourceTags));
    assert(candidate.sourceTags.length > 0);
    assert.strictEqual(ruleEngine.simulateMove(board, candidate.point, BLACK, []).legal, true);
  }
}

function testDiversityBudgetAndDeduplication() {
  const board = emptyBoard();
  for (const [x, y, color] of [
    [3, 3, BLACK], [15, 15, WHITE], [9, 9, BLACK], [9, 10, WHITE],
    [5, 5, BLACK], [7, 5, BLACK], [6, 4, WHITE], [6, 6, WHITE],
    [12, 12, WHITE], [12, 13, WHITE], [11, 12, BLACK], [13, 12, BLACK]
  ]) set(board, x, y, color);
  const candidates = v15.generateCandidates(board, BLACK, { v201CandidateRecall: true });
  const keys = candidates.map(candidate => `${candidate.point.x},${candidate.point.y}`);
  assert(candidates.length <= 12);
  assert.strictEqual(new Set(keys).size, keys.length);
  assert(candidates.some(candidate => /connection|cut|counterattack|weak_group|v201/.test(candidate.source)));
}

function testFamilyClassification() {
  const board = emptyBoard();
  set(board, 4, 4, WHITE);
  set(board, 3, 4, BLACK);
  set(board, 4, 3, BLACK);
  set(board, 5, 4, BLACK);
  const position = { board, sideToMove: "B", moveNumber: 35, sourceTags: ["tactical_high_risk"] };
  assert.strictEqual(v201.classifyMoveFamily(position, { x: 4, y: 5 }), "capture_or_atari");
}

function testAuditCheckModeDoesNotWriteReports() {
  const before = fs.existsSync(path.join(root, "evaluation", "v201-candidate-recall-audit.json"))
    ? fs.statSync(path.join(root, "evaluation", "v201-candidate-recall-audit.json")).mtimeMs
    : null;
  const result = v201.run({ writeReports: false });
  assert(result.summary.newCandidateRecall >= result.summary.baselineCandidateRecall);
  assert.strictEqual(result.summary.illegalCandidateCount, 0);
  assert.strictEqual(result.gate.lowerModeBehaviorChanged, false);
  assert.strictEqual(result.gate.kataGoRuntimeDependency, false);
  const after = fs.existsSync(path.join(root, "evaluation", "v201-candidate-recall-audit.json"))
    ? fs.statSync(path.join(root, "evaluation", "v201-candidate-recall-audit.json")).mtimeMs
    : null;
  assert.strictEqual(after, before);
}

function testNoKataGoDependencyInProductionBundle() {
  const productionFiles = ["app.js", "index.html", "sw.js", "manifest.webmanifest"];
  for (const file of productionFiles) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert(!/run-v200-katago-analysis|kata1-|\\.bin\\.gz|v200-katago|katago-analysis/.test(text), `${file} must not embed KataGo runtime dependency`);
  }
}

testIgnoreRules();
testWeakGroupAndCounterattackCandidates();
testDiversityBudgetAndDeduplication();
testFamilyClassification();
testAuditCheckModeDoesNotWriteReports();
testNoKataGoDependencyInProductionBundle();

process.stdout.write("test-v201-candidate-recall: ok\n");
