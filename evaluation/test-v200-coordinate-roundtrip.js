#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ruleEngine = require("../rule-engine.js");
const extractor = require("./extract-v200-positions.js");

const root = path.join(__dirname, "..");
const sgfPath = path.join(__dirname, "fixtures/private/GoKidCoach-2026-07-14.sgf");
const debugPath = path.join(__dirname, "fixtures/private/GoKidCoach-debug-2026-07-14.json");

for (const point of [
  { x: 0, y: 0 },
  { x: 3, y: 3 },
  { x: 8, y: 8 },
  { x: 18, y: 18 },
  null
]) {
  const sgf = extractor.pointToSgfCoord(point);
  assert.deepStrictEqual(extractor.sgfCoordToPoint(sgf), point);
  const kata = extractor.pointToKataGoCoord(point, 19);
  assert.deepStrictEqual(extractor.kataGoCoordToPoint(kata, 19), point);
}

assert.ok(fs.existsSync(sgfPath), "private SGF fixture must exist");
assert.ok(fs.existsSync(debugPath), "private debug fixture must exist");

const parsed = extractor.parseSgfMoves(fs.readFileSync(sgfPath, "utf8"));
assert.strictEqual(parsed.size, 19);
assert.strictEqual(parsed.komi, 7);

let board = Array.from({ length: parsed.size }, () => Array(parsed.size).fill(0));
for (const move of parsed.moves) {
  assert.ok(move.color === 1 || move.color === 2);
  if (!move.pass) {
    const result = ruleEngine.simulateMove(board, { x: move.x, y: move.y }, move.color, []);
    assert.ok(result.legal, `SGF move must be legal: ${JSON.stringify(move)}`);
    board = result.board;
  }
}

const payload = extractor.buildPositions({
  target: 40,
  realGameSgf: sgfPath,
  realGameDebug: debugPath
});
assert.strictEqual(payload.realGameFixture.fixtureStatus, "loaded");
assert.strictEqual(payload.realGameFixture.difficultyMode, "adaptive");
assert.ok(payload.realGameFixture.sgfSha256);
assert.ok(payload.realGameFixture.debugSha256);

for (const position of payload.positions.slice(0, 20)) {
  assert.ok(["B", "W"].includes(position.sideToMove));
  assert.strictEqual(position.komi, position.sourceTags.includes("uploaded_real_game") ? 7 : 7.5);
  assert.ok(position.deterministicBoardHash);
  if (position.currentEngineSelectedMove) {
    const color = position.sideToMove === "B" ? 1 : 2;
    const result = ruleEngine.simulateMove(position.board, position.currentEngineSelectedMove, color, []);
    assert.ok(result.legal, `engine selected move must be legal for ${position.positionId}`);
  }
}

assert.ok(fs.existsSync(path.join(root, ".gitignore")));
process.stdout.write("evaluation/test-v200-coordinate-roundtrip: ok\n");
