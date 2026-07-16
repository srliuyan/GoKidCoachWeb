#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ruleEngine = require("../rule-engine.js");
const v15 = require("./run-v15-middlegame-audit.js");

const ROOT = path.join(__dirname, "..");
const OUT = __dirname;
const LETTERS = "ABCDEFGHJKLMNOPQRST";
const BLACK = 1;
const WHITE = 2;
const EMPTY = 0;
const BASELINE_RECALL = 0.28125;

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8"));
}

function write(name, payload) {
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sha(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex");
}

function pointKey(point) {
  return point ? `${point.x},${point.y}` : "pass";
}

function gtpToPoint(move, size = 19) {
  if (!move || String(move).toLowerCase() === "pass") return null;
  const x = LETTERS.indexOf(String(move)[0].toUpperCase());
  const y = size - Number(String(move).slice(1));
  return x >= 0 && Number.isFinite(y) ? { x, y } : null;
}

function pointToGtp(point, size = 19) {
  if (!point) return "pass";
  return `${LETTERS[point.x]}${size - point.y}`;
}

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function rate(rows, predicate) {
  return Number((rows.filter(predicate).length / Math.max(1, rows.length)).toFixed(6));
}

function avg(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)) : 0;
}

function phaseSplit(positionId) {
  return crypto.createHash("sha256").update(positionId).digest("hex")[0] < "c" ? "development" : "holdout";
}

function adjacentGroups(board, point, color) {
  return ruleEngine.adjacentGroups(board, point, color);
}

function classifyMoveFamily(position, point) {
  if (!point) return "other";
  const board = position.board;
  const color = position.sideToMove === "B" ? BLACK : WHITE;
  const opponent = color === BLACK ? WHITE : BLACK;
  const ownNear = adjacentGroups(board, point, color);
  const oppNear = adjacentGroups(board, point, opponent);
  const edge = Math.min(point.x, point.y, board.length - 1 - point.x, board.length - 1 - point.y);
  const tags = (position.sourceTags || []).join(" ");
  if (oppNear.some(group => group.liberties.size <= 1)) return "capture_or_atari";
  if (ownNear.some(group => group.liberties.size <= 1)) return "urgent_group_defense";
  if (oppNear.length >= 2) return "cut";
  if (ownNear.length >= 2) return "connection";
  if (ownNear.some(group => group.liberties.size <= 3)) return "escape";
  if (oppNear.some(group => group.liberties.size <= 3)) return "counterattack";
  if (/endgame/.test(tags) || position.moveNumber >= 201) return edge <= 2 ? "sente_endgame" : "large_endgame";
  if (edge <= 3 && position.moveNumber <= 40) return "enclosure_or_corner";
  if (edge >= 3 && edge <= 5 && position.moveNumber >= 80) return "invasion";
  if (position.moveNumber >= 21 && position.moveNumber <= 120) return "whole_board_direction";
  if (position.moveNumber >= 121 && edge >= 2 && edge <= 6) return "reduction";
  return "shape";
}

function topMovesByProfile(analysis) {
  const priority = { quick: 1, standard: 2, deep_sample: 3 };
  const map = new Map();
  for (const row of analysis.results || []) {
    if (row.analysisKind === "played") continue;
    const id = row.parentPositionId || row.positionId;
    const previous = map.get(id);
    if (!previous || (priority[row.profile] || 0) > (priority[previous.profile] || 0)) map.set(id, row);
  }
  return map;
}

function selectedQuality(row, analysisRow, sideToMove) {
  if (!row.newSelectedGtp || !analysisRow) return null;
  const infos = analysisRow.moveInfos || [];
  const best = infos[0];
  const selected = infos.find(info => info.move === row.newSelectedGtp);
  if (!best || !selected) return null;
  const bestScore = Number(best.scoreLead || 0);
  const selectedScore = Number(selected.scoreLead || 0);
  const scoreLoss = sideToMove === "B" ? Math.max(0, bestScore - selectedScore) : Math.max(0, selectedScore - bestScore);
  return {
    rank: infos.indexOf(selected) + 1,
    selectedInsideTop3: infos.indexOf(selected) < 3,
    selectedInsideTop5: infos.indexOf(selected) < 5,
    selectedInsideTop10: infos.indexOf(selected) < 10,
    scoreLoss: Number(scoreLoss.toFixed(6))
  };
}

function summarize(rows) {
  const actionable = rows.filter(row => !row.katagoUncertain);
  const qualities = actionable.map(row => row.newSelectionQuality).filter(Boolean);
  return {
    positionsEvaluated: rows.length,
    actionablePositions: actionable.length,
    baselineCandidateRecall: BASELINE_RECALL,
    newCandidateRecall: rate(actionable, row => row.newContainsBest || row.equivalentNearbyPresent),
    exactBestCandidateRecall: rate(actionable, row => row.newContainsBest),
    nearEquivalentCandidateRecall: rate(actionable, row => row.equivalentNearbyPresent),
    top3CandidateRecall: rate(actionable, row => row.newContainsTop3),
    baselineTop3CandidateRecall: rate(actionable, row => row.baselineContainsTop3),
    averageCandidateCountBefore: avg(actionable.map(row => row.baselineCandidateCount)),
    averageCandidateCountAfter: avg(actionable.map(row => row.newCandidateCount)),
    duplicateRateBefore: avg(actionable.map(row => row.baselineDuplicateRate)),
    duplicateRateAfter: avg(actionable.map(row => row.newDuplicateRate)),
    qualityCoveredSelectionCount: qualities.length,
    top1MatchAfterCovered: rate(qualities, item => item.rank === 1),
    top3MatchAfterCovered: rate(qualities, item => item.selectedInsideTop3),
    top5MatchAfterCovered: rate(qualities, item => item.selectedInsideTop5),
    top10MatchAfterCovered: rate(qualities, item => item.selectedInsideTop10),
    averageScoreLossAfterCovered: avg(qualities.map(item => item.scoreLoss)),
    severeErrorRateAfterCovered: rate(qualities, item => item.scoreLoss > 10),
    improvedRecallCount: actionable.filter(row => !row.baselineContainsBest && (row.newContainsBest || row.equivalentNearbyPresent)).length,
    worsenedRecallCount: actionable.filter(row => row.baselineContainsBest && !row.newContainsBest && !row.equivalentNearbyPresent).length,
    illegalCandidateCount: actionable.reduce((sum, row) => sum + row.illegalCandidateCount, 0)
  };
}

function familySummary(rows) {
  const map = new Map();
  for (const row of rows) {
    if (row.baselineContainsBest || row.katagoUncertain) continue;
    const entry = map.get(row.moveFamily) || {
      family: row.moveFamily,
      totalMisses: 0,
      recoveredByV201: 0,
      equivalentNearbyAlreadyPresent: 0,
      averageScoreLoss: 0,
      severeErrorCount: 0,
      phaseDistribution: {},
      similarDistance1: 0,
      similarDistance2: 0,
      similarDistance3: 0,
      lossStages: {}
    };
    entry.totalMisses += 1;
    if (row.newContainsBest) entry.recoveredByV201 += 1;
    if (row.baselineNearbyDistance <= 2) entry.equivalentNearbyAlreadyPresent += 1;
    entry.averageScoreLoss += Number(row.baselineScoreLoss || 0);
    if (row.baselineScoreLoss > 10) entry.severeErrorCount += 1;
    entry.phaseDistribution[row.phase] = (entry.phaseDistribution[row.phase] || 0) + 1;
    if (row.baselineNearbyDistance <= 1) entry.similarDistance1 += 1;
    if (row.baselineNearbyDistance <= 2) entry.similarDistance2 += 1;
    if (row.baselineNearbyDistance <= 3) entry.similarDistance3 += 1;
    entry.lossStages[row.lossStage] = (entry.lossStages[row.lossStage] || 0) + 1;
    map.set(row.moveFamily, entry);
  }
  return Array.from(map.values()).map(item => ({
    ...item,
    averageScoreLoss: Number((item.averageScoreLoss / Math.max(1, item.totalMisses)).toFixed(6)),
    uniqueContributionPotential: item.recoveredByV201
  })).sort((a, b) => b.totalMisses - a.totalMisses);
}

function run(options = {}) {
  const positionsPayload = read("v200-positions.json");
  const attribution = read("v200-error-attribution.json");
  const combined = fs.existsSync(path.join(OUT, "v200-katago-analysis-combined.json"))
    ? read("v200-katago-analysis-combined.json")
    : read("v200-katago-analysis-root.json");
  const analysisById = topMovesByProfile(combined);
  const positions = new Map((positionsPayload.positions || []).map(position => [position.positionId, position]));
  const rows = [];
  for (const baseline of attribution.rows || []) {
    const position = positions.get(baseline.positionId);
    if (!position || position.difficultyMode !== "MAX_STRENGTH_FIXED") continue;
    const bestPoint = gtpToPoint(baseline.katagoBestMove, position.board.length || 19);
    const bestKey = pointKey(bestPoint);
    const analysis = analysisById.get(position.positionId);
    const top3 = (analysis?.moveInfos || []).slice(0, 3).map(info => pointKey(gtpToPoint(info.move, position.board.length || 19)));
    const baselineCandidates = position.currentTop10Candidates || [];
    const generated = v15.generateCandidates(position.board, position.sideToMove === "B" ? BLACK : WHITE, { v201CandidateRecall: true });
    const newCandidates = generated.slice(0, 10).map((candidate, index) => ({
      ...candidate,
      move: pointKey(candidate.point),
      engineRank: index + 1
    }));
    const baselineKeys = baselineCandidates.map(candidate => candidate.move || pointKey(candidate.point));
    const newKeys = newCandidates.map(candidate => candidate.move);
    const baselineDistances = baselineCandidates.map(candidate => distance(candidate.point, bestPoint));
    const newDistances = newCandidates.map(candidate => distance(candidate.point, bestPoint));
    const legalChecks = newCandidates.map(candidate => ruleEngine.simulateMove(position.board, candidate.point, position.sideToMove === "B" ? BLACK : WHITE, []));
    const baselineContainsBest = baselineKeys.includes(bestKey);
    const newContainsBest = newKeys.includes(bestKey);
    const equivalentNearbyPresent = !newContainsBest && Math.min(...newDistances, Infinity) <= 2;
    const lossStage = baselineContainsBest
      ? "generated_top10"
      : Math.min(...baselineDistances, Infinity) <= 2
        ? "equivalent_nearby_move_already_present"
        : newContainsBest
          ? "recall_only_recoverable"
          : "never_generated";
    const row = {
      positionId: position.positionId,
      split: phaseSplit(position.positionId),
      phase: position.phase,
      moveNumber: position.moveNumber,
      sideToMove: position.sideToMove,
      katagoBestMove: baseline.katagoBestMove,
      katagoBestPoint: bestPoint,
      moveFamily: classifyMoveFamily(position, bestPoint),
      baselineScoreLoss: baseline.scoreLoss,
      baselineErrorBand: baseline.errorBand,
      baselineDominantErrorCategory: baseline.dominantErrorCategory,
      katagoUncertain: baseline.dominantErrorCategory === "katago_uncertain",
      baselineContainsBest,
      baselineContainsTop3: top3.some(move => baselineKeys.includes(move)),
      newContainsBest,
      newContainsTop3: top3.some(move => newKeys.includes(move)),
      equivalentNearbyPresent,
      baselineNearbyDistance: Math.min(...baselineDistances, Infinity),
      newNearbyDistance: Math.min(...newDistances, Infinity),
      baselineCandidateCount: baselineCandidates.length,
      newCandidateCount: newCandidates.length,
      baselineDuplicateRate: Number((1 - new Set(baselineKeys).size / Math.max(1, baselineKeys.length)).toFixed(6)),
      newDuplicateRate: Number((1 - new Set(newKeys).size / Math.max(1, newKeys.length)).toFixed(6)),
      illegalCandidateCount: legalChecks.filter(result => !result.legal).length,
      v201Sources: newCandidates.flatMap(candidate => candidate.sourceTags || []).filter(tag => /^v201_/.test(tag)),
      lossStage,
      oracleAudit: {
        recallOnlyRecoverable: lossStage === "recall_only_recoverable",
        generatedButMisranked: newContainsBest && newKeys.indexOf(bestKey) > 2,
        generatedButReadingRejected: false,
        generatedButFinalSelectorRejected: false,
        note: "Reading/final-selector rejection needs explicit runtime trace for the injected move; this audit does not fabricate unavailable traces."
      },
      newSelectedMove: newCandidates[0]?.move || null,
      newSelectedGtp: newCandidates[0] ? pointToGtp(newCandidates[0].point, position.board.length || 19) : null,
      newSelectionQuality: null
    };
    row.newSelectionQuality = selectedQuality(row, analysis, position.sideToMove);
    rows.push(row);
  }

  const bySplit = {
    development: summarize(rows.filter(row => row.split === "development")),
    holdout: summarize(rows.filter(row => row.split === "holdout"))
  };
  const summary = summarize(rows);
  const families = familySummary(rows);
  const generatorContribution = rows.reduce((acc, row) => {
    for (const source of row.v201Sources) acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const gate = {
    evaluationVersion: "2.0.1-dev",
    passed: bySplit.holdout.newCandidateRecall > BASELINE_RECALL
      && bySplit.holdout.nearEquivalentCandidateRecall >= bySplit.development.nearEquivalentCandidateRecall * 0.5
      && summary.illegalCandidateCount === 0
      && summary.averageCandidateCountAfter <= 10,
    failedGates: [],
    runtimeBehaviorChanged: true,
    lowerModeBehaviorChanged: false,
    kataGoRuntimeDependency: false,
    deploymentOccurred: false
  };
  if (bySplit.holdout.newCandidateRecall <= BASELINE_RECALL) gate.failedGates.push("holdout_candidate_recall_not_improved");
  if (summary.illegalCandidateCount !== 0) gate.failedGates.push("illegal_candidate");
  if (summary.averageCandidateCountAfter > 10) gate.failedGates.push("candidate_explosion");
  const payload = {
    evaluationVersion: "2.0.1-dev",
    sourceHashes: {
      baseline: sha("evaluation/baselines/v200-external-baseline-summary.json"),
      positions: crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, "v200-positions.json"))).digest("hex"),
      attribution: crypto.createHash("sha256").update(fs.readFileSync(path.join(OUT, "v200-error-attribution.json"))).digest("hex")
    },
    summary,
    bySplit,
    families,
    generatorContribution,
    rows,
    gate
  };
  if (options.writeReports) {
    write("v201-candidate-recall-audit.json", payload);
    write("v201-move-family-misses.json", families);
    write("v201-gate-result.json", gate);
  }
  return payload;
}

function main(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const result = run({ writeReports: !check });
  process.stdout.write(`${JSON.stringify({
    passed: result.gate.passed,
    failedGates: result.gate.failedGates,
    baselineCandidateRecall: result.summary.baselineCandidateRecall,
    newCandidateRecall: result.summary.newCandidateRecall,
    holdoutRecall: result.bySplit.holdout.newCandidateRecall,
    topFamilies: result.families.slice(0, 5).map(item => ({ family: item.family, totalMisses: item.totalMisses, recoveredByV201: item.recoveredByV201 }))
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = { run, classifyMoveFamily };
