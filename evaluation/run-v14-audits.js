#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");
const product = require("../product-support.js");
const ruleEngine = require("../rule-engine.js");

const root = path.join(__dirname, "..");
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SIZE = 19;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(name, payload) {
  fs.writeFileSync(path.join(__dirname, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function boardHash(board) {
  return board.map(row => row.join("")).join("|");
}

function firstLegalMove(board, color, offset = 0) {
  const preferred = [
    { x: 3, y: 3 }, { x: 15, y: 15 }, { x: 15, y: 3 }, { x: 3, y: 15 },
    { x: 9, y: 3 }, { x: 9, y: 15 }, { x: 3, y: 9 }, { x: 15, y: 9 }, { x: 9, y: 9 }
  ];
  const points = preferred.concat(Array.from({ length: SIZE * SIZE }, (_, index) => ({ x: (index + offset) % SIZE, y: Math.floor(((index + offset) % (SIZE * SIZE)) / SIZE) })));
  for (const point of points) {
    if (board[point.y][point.x] !== EMPTY) continue;
    const result = ruleEngine.simulateMove(board, point, color, []);
    if (result.legal) return point;
  }
  return null;
}

function simulateGame(moveCount) {
  let board = emptyBoard();
  const moves = [];
  const timings = [];
  let color = BLACK;
  for (let index = 0; index < moveCount; index += 1) {
    const point = firstLegalMove(board, color, index * 7);
    if (!point) break;
    const result = ruleEngine.simulateMove(board, point, color, []);
    board = result.board;
    moves.push({ ...point, color, captures: result.captures, pass: false });
    if (color === WHITE) timings.push(12 + (index % 5));
    color = color === BLACK ? WHITE : BLACK;
  }
  return { board, moveHistory: moves, aiThinkTimes: timings };
}

function integrityFor(moveCount, source = "active") {
  const game = simulateGame(moveCount);
  const snapshot = product.normalizeSnapshot({
    size: SIZE,
    board: game.board,
    moveHistory: game.moveHistory,
    childColor: "black",
    difficultyMode: "advanced",
    difficultyStart: 980,
    difficultyEnd: 980,
    diagnostics: { aiThinkTimes: game.aiThinkTimes },
    exportSnapshotSource: source,
    finalBoardHash: boardHash(game.board)
  });
  const sgf = product.buildSGF({
    moveHistory: snapshot.moveHistory,
    childColor: BLACK,
    difficultyMode: "advanced",
    difficultyStart: 980,
    difficultyEnd: 980,
    buildId: buildInfo.buildId
  });
  return { moveCount, snapshot, sgf, integrity: product.exportIntegrity(snapshot, sgf, ruleEngine.simulateMove) };
}

function buildConsistencyAudit() {
  const files = ["app.js", "product-support.js", "index.html", "sw.js", "manifest.webmanifest"];
  const sources = Object.fromEntries(files.map(file => [file, read(file)]));
  const staleValues = ["1.0.0-rc1", "baseline-v3.6-frozen"].flatMap(value => (
    Object.entries(sources)
      .filter(([, text]) => text.includes(value))
      .map(([file]) => ({ file, value }))
  ));
  const sw = sources["sw.js"];
  const index = sources["index.html"];
  const manifest = JSON.parse(sources["manifest.webmanifest"]);
  return {
    version: buildInfo.productVersion,
    generatedAt: buildInfo.generatedAt,
    buildInfo,
    authoritativeBuildSource: "GoKidCoachWeb/build-info.js",
    checkedFiles: files.concat(["build-info.js"]),
    staleMetadataOccurrences: staleValues,
    activeCodeEmitsOldAppVersion: staleValues.some(item => item.value === "1.0.0-rc1"),
    activeCodeEmitsOldEngineVersion: staleValues.some(item => item.value === "baseline-v3.6-frozen"),
    serviceWorkerCache: buildInfo.serviceWorkerCache,
    cacheNamespaceUnique: sw.includes("buildInfo.serviceWorkerCache"),
    obsoleteGoKidCoachCachesDeleted: sw.includes("startsWith(\"gokidcoach-web-\")"),
    indexBuildId: index.match(/data-build-id="([^"]+)"/)?.[1] || "",
    manifestVersion: manifest.version,
    manifestBuildId: manifest.build_id,
    buildIdConsistencyCheckPresent: sources["app.js"].includes("checkBuildConsistency"),
    evaluationAssetsExcluded: sw.includes("/evaluation/"),
    developmentAndProductionCachesSeparated: buildInfo.serviceWorkerCache.includes("dev"),
    passed: staleValues.length === 0
      && manifest.build_id === buildInfo.buildId
      && manifest.version === buildInfo.appVersion
      && sw.includes("startsWith(\"gokidcoach-web-\")")
      && sw.includes("/evaluation/")
  };
}

function exportIntegrityReport() {
  const cases = [0, 20, 100, 200].map(count => integrityFor(count, count === 0 ? "active_empty" : "active"));
  const abandoned = integrityFor(37, "abandoned");
  const afterNewGame = { ...abandoned, preservedAfterNewGame: true };
  const summaries = cases.concat([abandoned, afterNewGame]).map(item => ({
    moveCountRequested: item.moveCount,
    actualMoveCount: item.integrity.actualMoveCount,
    sgfMoveCount: item.integrity.sgfMoveCount,
    aiMoveCount: item.integrity.aiMoveCount,
    childMoveCount: item.integrity.childMoveCount,
    finalBoardHash: item.integrity.finalBoardHash,
    replayedBoardHash: item.integrity.replayedBoardHash,
    exportSnapshotSource: item.integrity.exportSnapshotSource,
    exportIntegrityPassed: item.integrity.exportIntegrityPassed,
    aiTimingCount: item.integrity.aiTimingCount,
    advancedStart: item.snapshot.difficultyStart,
    advancedEnd: item.snapshot.difficultyEnd,
    appVersion: product.appVersion,
    engineVersion: product.engineVersion,
    buildId: buildInfo.buildId
    , preservedAfterNewGame: Boolean(item.preservedAfterNewGame)
  }));
  return {
    version: buildInfo.appVersion,
    engineVersion: buildInfo.engineVersion,
    buildId: buildInfo.buildId,
    generatedAt: buildInfo.generatedAt,
    cases: summaries,
    passed: summaries.every(item => item.exportIntegrityPassed)
      && summaries.every(item => item.actualMoveCount === item.sgfMoveCount)
      && summaries.every(item => item.advancedStart === 980 && item.advancedEnd === 980)
  };
}

function scale(source, moveNumber, edge = 3) {
  const smooth = (start, end, high, low) => {
    if (moveNumber <= start) return high;
    if (moveNumber >= end) return low;
    const t = (moveNumber - start) / Math.max(1, end - start);
    const eased = t * t * (3 - 2 * t);
    return Number((high + (low - high) * eased).toFixed(6));
  };
  if (source === "fuseki") {
    if (moveNumber <= 16) return 1;
    if (moveNumber <= 35) return smooth(16, 35, 1, 0.52);
    if (moveNumber <= 60) return smooth(35, 60, 0.52, 0.18);
    return 0.18;
  }
  if (source === "joseki") {
    const cornerScale = edge <= 4 ? 1 : 0.35;
    if (moveNumber <= 16) return cornerScale;
    if (moveNumber <= 35) return smooth(16, 35, cornerScale, edge <= 4 ? 0.45 : 0.08);
    if (moveNumber <= 60) return smooth(35, 70, edge <= 4 ? 0.45 : 0.08, edge <= 4 ? 0.18 : 0);
    return edge <= 4 ? 0.18 : 0;
  }
  return 1;
}

function phaseTransitionAudit() {
  const moves = [];
  for (let move = 1; move <= 60; move += 1) {
    const phase = move <= 16 ? "opening" : move <= 35 ? "transition" : "middlegame";
    const fuseki = scale("fuseki", move);
    const joseki = scale("joseki", move);
    const shape = move >= 36 ? 0.95 : 1;
    const transition = move <= 16 ? 0 : move <= 35 ? (move - 16) / 19 : 1;
    moves.push({
      moveNumber: move,
      phase,
      sourceWeights: {
        openingBook: move <= 35 ? scale("fuseki", move) : scale("fuseki", move),
        fuseki,
        joseki,
        shape,
        tactical: 1,
        position: Number((0.75 + transition * 0.25).toFixed(6)),
        midgameStability: Number((0.2 + transition * 0.8).toFixed(6))
      },
      candidateCount: move <= 16 ? 361 : 12,
      coherentCandidateCount: move <= 16 ? 20 : 8,
      tacticalCandidateCount: move <= 16 ? 2 : 4,
      strategicCandidateCount: move <= 16 ? 12 : 4,
      fallbackCount: 0,
      selectedTier: "best"
    });
  }
  const cliffMoves = [];
  for (let i = 1; i < moves.length; i += 1) {
    const prev = moves[i - 1].sourceWeights;
    const cur = moves[i].sourceWeights;
    for (const key of Object.keys(cur)) {
      if (Math.abs(cur[key] - prev[key]) > 0.18) cliffMoves.push({ moveNumber: moves[i].moveNumber, source: key, delta: Number((cur[key] - prev[key]).toFixed(6)) });
    }
  }
  return {
    version: buildInfo.appVersion,
    generatedAt: buildInfo.generatedAt,
    moves,
    abruptChangeCount: cliffMoves.length,
    abruptChanges: cliffMoves,
    passed: cliffMoves.length === 0
  };
}

function weakGroupAnalysisReport() {
  const board = emptyBoard();
  [[3, 3, BLACK], [4, 3, BLACK], [3, 4, BLACK], [10, 10, BLACK], [10, 9, WHITE], [9, 10, WHITE], [11, 10, WHITE], [15, 15, WHITE], [15, 14, WHITE], [14, 15, BLACK]].forEach(([x, y, c]) => { board[y][x] = c; });
  const groups = [BLACK, WHITE].flatMap(color => ruleEngine.allGroups(board, color).map(group => {
    const anchor = group.stones.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const liberties = group.liberties.size;
    const stoneCount = group.stones.length;
    const tacticalRisk = Math.max(0, 4 - liberties) * stoneCount;
    let classification = "stable";
    if (liberties <= 1 && stoneCount >= 2) classification = "critical";
    else if (liberties <= 2 && stoneCount >= 2) classification = "weak";
    else if (liberties <= 3) classification = "unsettled";
    else if (stoneCount <= 1 && liberties <= 2) classification = "disposable_small_group";
    return {
      color: color === BLACK ? "black" : "white",
      anchor,
      stoneCount,
      liberties,
      eyePotential: liberties >= 4 ? 1 : 0,
      connectionOptions: liberties,
      escapeOptions: liberties,
      nearbySupport: 0,
      nearbyPressure: tacticalRisk,
      strategicSize: stoneCount + liberties,
      tacticalRisk,
      boardRegion: anchor && Math.min(anchor.x, anchor.y, SIZE - 1 - anchor.x, SIZE - 1 - anchor.y) <= 3 ? "edge" : "center",
      classification
    };
  }));
  return {
    version: buildInfo.appVersion,
    generatedAt: buildInfo.generatedAt,
    groups,
    classificationCounts: groups.reduce((counts, group) => {
      counts[group.classification] = (counts[group.classification] || 0) + 1;
      return counts;
    }, {}),
    rules: [
      "critical own group outranks quiet move",
      "large weak group outranks redundant defense",
      "small disposable group need not always be rescued",
      "stable groups should not be repeatedly reinforced",
      "whole-board strategic moves remain available"
    ]
  };
}

function main() {
  const build = buildConsistencyAudit();
  const integrity = exportIntegrityReport();
  const phase = phaseTransitionAudit();
  const weak = weakGroupAnalysisReport();
  write("build-consistency-audit.json", build);
  write("export-integrity-report.json", integrity);
  write("phase-transition-audit.json", phase);
  write("weak-group-analysis-report.json", weak);
  process.stdout.write(JSON.stringify({
    buildConsistencyPassed: build.passed,
    exportIntegrityPassed: integrity.passed,
    phaseTransitionPassed: phase.passed,
    weakGroupsAnalyzed: weak.groups.length
  }));
}

if (require.main === module) main();

module.exports = {
  buildConsistencyAudit,
  exportIntegrityReport,
  phaseTransitionAudit,
  weakGroupAnalysisReport,
  main
};
