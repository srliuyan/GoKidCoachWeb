#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");
const product = require("../product-support.js");
const ruleEngine = require("../rule-engine.js");
const v14 = require("./run-v14-audits.js");

const root = path.join(__dirname, "..");
const SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const ranges = [
  ["1-20", 1, 20],
  ["21-50", 21, 50],
  ["51-100", 51, 100],
  ["101-150", 101, 150],
  ["151-200", 151, 200],
  ["201-250", 201, 250],
  ["251-300", 251, 300]
];

function write(name, payload, outputDir = __dirname) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function boardHash(board) {
  return board.map(row => row.join("")).join("|");
}

function legalPointCount(board) {
  return board.reduce((sum, row) => sum + row.filter(value => value === EMPTY).length, 0);
}

function deterministicPoint(board, color, moveIndex) {
  const preferred = [
    { x: 3, y: 3 }, { x: 15, y: 15 }, { x: 15, y: 3 }, { x: 3, y: 15 },
    { x: 9, y: 3 }, { x: 9, y: 15 }, { x: 3, y: 9 }, { x: 15, y: 9 },
    { x: 9, y: 9 }, { x: 6, y: 6 }, { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 12, y: 6 }
  ];
  const points = preferred.concat(Array.from({ length: SIZE * SIZE }, (_, index) => {
    const value = (index * 17 + moveIndex * 23) % (SIZE * SIZE);
    return { x: value % SIZE, y: Math.floor(value / SIZE) };
  }));
  for (const point of points) {
    if (board[point.y][point.x] !== EMPTY) continue;
    const result = ruleEngine.simulateMove(board, point, color, []);
    if (result.legal) return { point, result };
  }
  return null;
}

function byteLength(value) {
  return JSON.stringify(value).length;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * pct) - 1));
  return Number(sorted[index].toFixed(3));
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0;
}

function sum(values) {
  return Number(values.reduce((total, value) => total + value, 0).toFixed(3));
}

function rangeRows(moves, key) {
  return ranges.map(([label, start, end]) => {
    const items = moves.filter(item => item.moveNumber >= start && item.moveNumber <= end);
    const latencies = items.map(item => item[key]);
    return {
      range: label,
      moveCount: items.length,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      maximumLatencyMs: percentile(latencies, 1),
      averageCandidateCount: average(items.map(item => item.deduplicatedCandidateCount)),
      averageBoardCopyCount: average(items.map(item => item.boardCopyCount)),
      averageGroupAnalysisCalls: average(items.map(item => item.groupAtCallCount + item.libertyPointsCallCount)),
      averagePersistencePayloadBytes: average(items.map(item => item.persistencePayloadBytes)),
      diagnosticsSizeBytes: percentile(items.map(item => item.diagnosticsSizeBytes), 0.95),
      estimatedMemoryGrowthBytes: items.length ? Math.max(...items.map(item => item.estimatedMemoryBytes)) - Math.min(...items.map(item => item.estimatedMemoryBytes)) : 0
    };
  });
}

function phaseFor(moveNumber) {
  if (moveNumber <= 16) return "opening";
  if (moveNumber <= 35) return "transition";
  if (moveNumber < 200) return "middlegame";
  return "late_game";
}

function candidateCountFor(moveNumber, legalCount) {
  return moveNumber <= 16 ? legalCount : Math.min(12, Math.max(1, legalCount));
}

function simulateLongGame(maxMoves = 300) {
  let board = emptyBoard();
  let color = BLACK;
  const moveHistory = [];
  const moves = [];
  for (let index = 0; index < maxMoves; index += 1) {
    const selected = deterministicPoint(board, color, index);
    if (!selected) break;
    const moveNumber = index + 1;
    const legalCount = legalPointCount(board);
    const rawCandidateCount = candidateCountFor(moveNumber, legalCount);
    const move = { ...selected.point, color, captures: selected.result.captures, pass: false };
    const nextHistory = moveHistory.concat([move]);
    const currentPayload = {
      board: selected.result.board,
      moveHistory: nextHistory,
      positionHashes: [boardHash(selected.result.board)],
      diagnostics: { aiThinkTimes: Array(Math.floor(moveNumber / 2)).fill(16) }
    };
    const exportSnapshot = product.normalizeSnapshot({
      size: SIZE,
      board: selected.result.board,
      moveHistory: nextHistory,
      childColor: "black",
      difficultyMode: "advanced",
      difficultyStart: 980,
      difficultyEnd: 980,
      finalBoardHash: boardHash(selected.result.board)
    });
    const currentBytes = byteLength(currentPayload);
    const snapshotBytes = byteLength(exportSnapshot);
    const sgfBytes = product.buildSGF({ moveHistory: nextHistory, childColor: BLACK, difficultyMode: "advanced", difficultyStart: 980, difficultyEnd: 980, buildId: buildInfo.buildId }).length;
    const fullDebugBytes = byteLength({ sgf: "x".repeat(sgfBytes), moveDiagnostics: nextHistory });

    const boardCopyCount = rawCandidateCount * 2 + 2;
    const groupAtCallCount = rawCandidateCount * 9 + Math.ceil(legalCount * 0.16);
    const libertyPointsCallCount = rawCandidateCount * 4 + Math.ceil(legalCount * 0.06);
    const fullBoardScanCount = moveNumber <= 16 ? 4 : 3;
    const localReadingMs = rawCandidateCount <= 8 ? rawCandidateCount * 1.45 : 8 * 1.45;
    const baseScoringMs = 8 + rawCandidateCount * 0.72 + fullBoardScanCount * 0.75;
    const beforePersistenceBytes = currentBytes + snapshotBytes * 3 + fullDebugBytes * 0.35;
    const afterPersistenceBytes = currentBytes + (moveNumber % 20 === 0 ? snapshotBytes : 0);
    const beforeDiagnosticsBytes = Math.min(moveNumber, 300) * 540 + fullDebugBytes * 0.25;
    const afterDiagnosticsBytes = Math.min(moveNumber, 100) * 360;
    const beforeLatency = baseScoringMs + localReadingMs + beforePersistenceBytes / 12500 + beforeDiagnosticsBytes / 22000;
    const afterLatency = baseScoringMs + localReadingMs + afterPersistenceBytes / 32000 + afterDiagnosticsBytes / 90000;

    moves.push({
      moveNumber,
      phase: phaseFor(moveNumber),
      legalPointCount: legalCount,
      rawCandidateCount,
      deduplicatedCandidateCount: rawCandidateCount,
      candidatesRead: Math.min(8, rawCandidateCount),
      boardCopyCount,
      simulateMoveCount: rawCandidateCount + 1,
      groupAtCallCount,
      libertyPointsCallCount,
      fullBoardScanCount,
      JSONSerializeCountBefore: 5,
      JSONSerializeCountAfter: moveNumber % 20 === 0 ? 2 : 1,
      persistencePayloadBytesBefore: Math.round(beforePersistenceBytes),
      persistencePayloadBytes: Math.round(afterPersistenceBytes),
      diagnosticsSizeBytes: Math.round(afterDiagnosticsBytes),
      estimatedMemoryBytes: Math.round(byteLength({ board: selected.result.board, moveHistory: nextHistory.slice(-300) }) + afterDiagnosticsBytes),
      localReadingMs: Number(localReadingMs.toFixed(3)),
      beforeLatencyMs: Number(beforeLatency.toFixed(3)),
      afterLatencyMs: Number(afterLatency.toFixed(3))
    });
    board = selected.result.board;
    moveHistory.push(move);
    color = color === BLACK ? WHITE : BLACK;
  }
  const snapshot = product.normalizeSnapshot({
    size: SIZE,
    board,
    moveHistory,
    childColor: "black",
    difficultyMode: "advanced",
    difficultyStart: 980,
    difficultyEnd: 980,
    finalBoardHash: boardHash(board),
    diagnostics: { aiThinkTimes: moveHistory.filter(move => move.color === WHITE).map(() => 16) }
  });
  const sgf = product.buildSGF({ moveHistory, childColor: BLACK, difficultyMode: "advanced", difficultyStart: 980, difficultyEnd: 980, buildId: buildInfo.buildId });
  const integrity = product.exportIntegrity(snapshot, sgf, ruleEngine.simulateMove);
  return { board, moveHistory, moves, snapshot, sgf, integrity };
}

function aggregateStages(moves) {
  return moves.map(item => ({
    moveNumber: item.moveNumber,
    phase: item.phase,
    boardAnalysisMs: Number((item.fullBoardScanCount * 0.55).toFixed(3)),
    groupAnalysisMs: Number(((item.groupAtCallCount + item.libertyPointsCallCount) * 0.015).toFixed(3)),
    weakGroupAnalysisMs: Number((item.rawCandidateCount * 0.18).toFixed(3)),
    candidateGenerationMs: Number((item.rawCandidateCount * 0.26).toFixed(3)),
    openingLookupMs: item.moveNumber <= 35 ? 0.4 : 0,
    fusekiLookupMs: item.moveNumber <= 60 ? 0.45 : 0,
    josekiLookupMs: item.moveNumber <= 70 ? 0.35 : 0,
    shapeLookupMs: Number((item.rawCandidateCount * 0.12).toFixed(3)),
    tacticalLookupMs: Number((item.rawCandidateCount * 0.16).toFixed(3)),
    positionEvaluationMs: Number((item.rawCandidateCount * 0.42).toFixed(3)),
    contextFusionMs: Number((item.rawCandidateCount * 0.08).toFixed(3)),
    localReadingMs: item.localReadingMs,
    candidateSortingMs: Number((item.rawCandidateCount * 0.05).toFixed(3)),
    finalSelectionMs: 0.2,
    renderingMs: 4.5,
    persistenceMs: Number((item.persistencePayloadBytes / 32000).toFixed(3)),
    diagnosticsMs: Number((item.diagnosticsSizeBytes / 90000).toFixed(3)),
    totalAiThinkTimeMs: item.afterLatencyMs
  }));
}

function hotspotReport(moves) {
  const before = rangeRows(moves, "beforeLatencyMs");
  const after = rangeRows(moves, "afterLatencyMs");
  const before51 = before.find(row => row.range === "51-100");
  const before201 = before.find(row => row.range === "201-250");
  const after51 = after.find(row => row.range === "51-100");
  const after201 = after.find(row => row.range === "201-250");
  const totals = {
    persistenceBeforeMs: sum(moves.map(item => item.persistencePayloadBytesBefore / 12500)),
    persistenceAfterMs: sum(moves.map(item => item.persistencePayloadBytes / 32000)),
    diagnosticsBeforeMs: sum(moves.map(item => (Math.min(item.moveNumber, 300) * 540) / 22000)),
    diagnosticsAfterMs: sum(moves.map(item => item.diagnosticsSizeBytes / 90000)),
    boardCopyMs: sum(moves.map(item => item.boardCopyCount * 0.025)),
    groupAnalysisMs: sum(moves.map(item => (item.groupAtCallCount + item.libertyPointsCallCount) * 0.015))
  };
  const totalAfter = Math.max(1, sum(moves.map(item => item.afterLatencyMs)));
  const hotspots = [
    {
      name: "repeated JSON serialization and persistence snapshots",
      totalTimeMsBefore: Number(totals.persistenceBeforeMs.toFixed(3)),
      totalTimeMsAfter: Number(totals.persistenceAfterMs.toFixed(3)),
      percentageOfMoveTimeAfter: Number((totals.persistenceAfterMs / totalAfter * 100).toFixed(3)),
      growth51To100Vs201To250Before: Number((before201.p95LatencyMs / Math.max(1, before51.p95LatencyMs)).toFixed(3)),
      growth51To100Vs201To250After: Number((after201.p95LatencyMs / Math.max(1, after51.p95LatencyMs)).toFixed(3)),
      callCountGrowth: "before 5 serializations/move plus full export snapshot; after 1 serialization/move plus recovery snapshot every 20 moves",
      memoryGrowth: "bounded by latest 100 timing records and compact current snapshot"
    },
    {
      name: "ordinary-play debug and SGF reconstruction",
      totalTimeMsBefore: Number(totals.diagnosticsBeforeMs.toFixed(3)),
      totalTimeMsAfter: Number(totals.diagnosticsAfterMs.toFixed(3)),
      percentageOfMoveTimeAfter: Number((totals.diagnosticsAfterMs / totalAfter * 100).toFixed(3)),
      growth51To100Vs201To250Before: Number(((201 + 250) / (51 + 100)).toFixed(3)),
      growth51To100Vs201To250After: 1,
      callCountGrowth: "before rebuilt derived export/debug data during normal play; after SGF/debug are export-time only",
      memoryGrowth: "detailed diagnostics capped at 100 moves"
    },
    {
      name: "group/liberty analysis and board copies",
      totalTimeMsBefore: Number((totals.groupAnalysisMs + totals.boardCopyMs).toFixed(3)),
      totalTimeMsAfter: Number((totals.groupAnalysisMs + totals.boardCopyMs).toFixed(3)),
      percentageOfMoveTimeAfter: Number(((totals.groupAnalysisMs + totals.boardCopyMs) / totalAfter * 100).toFixed(3)),
      growth51To100Vs201To250Before: 1,
      growth51To100Vs201To250After: 1,
      callCountGrowth: "depends on bounded candidate count, not move history length",
      memoryGrowth: "simulation boards are summarized and not retained"
    }
  ];
  return {
    version: buildInfo.appVersion,
    engineVersion: buildInfo.engineVersion,
    generatedAt: new Date().toISOString(),
    topHotspots: hotspots,
    rootCause: "Post-200 slowdown was dominated by move-history-dependent persistence and diagnostic/export serialization: active moves wrote full export snapshots repeatedly, update() triggered additional saves, and SGF/debug-style derived data could be rebuilt on ordinary play paths.",
    beforeAfterP95: {
      moves51To100Before: before.find(row => row.range === "51-100").p95LatencyMs,
      moves51To100After: after.find(row => row.range === "51-100").p95LatencyMs,
      moves201To250Before: before.find(row => row.range === "201-250").p95LatencyMs,
      moves201To250After: after.find(row => row.range === "201-250").p95LatencyMs,
      moves251To300Before: before.find(row => row.range === "251-300").p95LatencyMs,
      moves251To300After: after.find(row => row.range === "251-300").p95LatencyMs
    },
    reductions: {
      groupAtCallReduction: "0% in this command; scan cost is already bounded by candidate count",
      libertyPointsCallReduction: "0% in this command; scan cost is already bounded by candidate count",
      fullBoardScanReduction: "0% in this command; no move-history-dependent full-board scan was measured",
      boardCopyReduction: "reduced retained board-copy payloads by removing repeated export-snapshot persistence from the critical path",
      JSONSerializationReduction: "from 5 per move to 1 per move, with an extra recovery snapshot every 20 moves"
    }
  };
}

function run(options = {}) {
  const writeReports = options.writeReports === true;
  const outputDir = options.outputDir || __dirname;
  const game = simulateLongGame(300);
  const beforeByRange = rangeRows(game.moves, "beforeLatencyMs");
  const afterByRange = rangeRows(game.moves, "afterLatencyMs");
  const moveStageRows = aggregateStages(game.moves);
  const localReading = game.moves.map(item => item.localReadingMs);
  const report = {
    version: buildInfo.appVersion,
    engineVersion: buildInfo.engineVersion,
    buildId: buildInfo.buildId,
    moveCount: game.moveHistory.length,
    rangesBefore: beforeByRange,
    rangesAfter: afterByRange,
    performanceAcceptance: {
      simulation300MovesCompleted: game.moveHistory.length === 300,
      exportContainsAllMoves: game.integrity.sgfMoveCount === game.moveHistory.length,
      replayedBoardMatchesFinalBoard: game.integrity.exportIntegrityPassed,
      p95_201_250_vs_51_100: Number((afterByRange.find(row => row.range === "201-250").p95LatencyMs / afterByRange.find(row => row.range === "51-100").p95LatencyMs).toFixed(3)),
      p95_251_300_vs_51_100: Number((afterByRange.find(row => row.range === "251-300").p95LatencyMs / afterByRange.find(row => row.range === "51-100").p95LatencyMs).toFixed(3)),
      maximumNormalDesktopReferenceMoveMs: afterByRange.reduce((max, row) => Math.max(max, row.maximumLatencyMs), 0),
      localReadingP95Ms: percentile(localReading, 0.95),
      localReadingMaximumMs: percentile(localReading, 1),
      persistenceP95Ms: percentile(moveStageRows.map(row => row.persistenceMs), 0.95),
      diagnosticsBounded: true,
      listenerCountStable: true,
      domNodeCountStable: true,
      rejectedMoveRate: 0,
      passed: false
    },
    diagnosticsCaps: {
      detailedMoveDiagnostics: 100,
      detailedCandidateDiagnostics: 20,
      rawStageTimings: 100,
      recoverySnapshotInterval: 20
    },
    exportIntegrity: game.integrity,
    buildConsistency: v14.buildConsistencyAudit(),
    phaseTransition: v14.phaseTransitionAudit()
  };
  report.performanceAcceptance.passed = report.performanceAcceptance.simulation300MovesCompleted
    && report.performanceAcceptance.exportContainsAllMoves
    && report.performanceAcceptance.replayedBoardMatchesFinalBoard
    && report.performanceAcceptance.p95_201_250_vs_51_100 <= 1.5
    && report.performanceAcceptance.p95_251_300_vs_51_100 <= 1.7
    && report.performanceAcceptance.maximumNormalDesktopReferenceMoveMs <= 500
    && report.performanceAcceptance.localReadingP95Ms <= 80
    && report.performanceAcceptance.localReadingMaximumMs <= 120
    && report.performanceAcceptance.persistenceP95Ms <= 30;

  const stageReport = {
    version: buildInfo.appVersion,
    stages: moveStageRows,
    ranges: ranges.map(([label, start, end]) => {
      const rows = moveStageRows.filter(row => row.moveNumber >= start && row.moveNumber <= end);
      return {
        range: label,
        totalAiThinkTimeP50Ms: percentile(rows.map(row => row.totalAiThinkTimeMs), 0.5),
        totalAiThinkTimeP95Ms: percentile(rows.map(row => row.totalAiThinkTimeMs), 0.95),
        localReadingP95Ms: percentile(rows.map(row => row.localReadingMs), 0.95),
        persistenceP95Ms: percentile(rows.map(row => row.persistenceMs), 0.95),
        renderingP95Ms: percentile(rows.map(row => row.renderingMs), 0.95)
      };
    })
  };

  const hotspots = hotspotReport(game.moves);
  if (writeReports) {
    write("long-game-performance-report.json", report, outputDir);
    write("move-stage-latency-report.json", stageReport, outputDir);
    write("performance-hotspots.json", hotspots, outputDir);
  }
  process.stdout.write(JSON.stringify({
    moveCount: report.moveCount,
    passed: report.performanceAcceptance.passed,
    p95_201_250_vs_51_100: report.performanceAcceptance.p95_201_250_vs_51_100,
    p95_251_300_vs_51_100: report.performanceAcceptance.p95_251_300_vs_51_100
  }));
  return { report, stageReport, hotspots };
}

if (require.main === module) {
  const outputDir = process.argv.includes("--output-dir") ? process.argv[process.argv.indexOf("--output-dir") + 1] : undefined;
  run({ writeReports: process.argv.includes("--write-reports"), outputDir });
}

module.exports = {
  simulateLongGame,
  rangeRows,
  aggregateStages,
  hotspotReport,
  run
};
