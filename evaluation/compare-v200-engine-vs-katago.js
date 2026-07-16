#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_POSITIONS = path.join(__dirname, "v200-positions.json");
const DEFAULT_ANALYSIS = path.join(__dirname, "v200-katago-analysis.json");
const PROFILE_PRIORITY = { quick: 1, standard: 2, deep_sample: 3 };
const ERROR_BANDS = [
  ["equivalent", 0, 0.5],
  ["small", 0.5, 2],
  ["medium", 2, 5],
  ["large", 5, 10],
  ["severe", 10, Infinity]
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { positions: DEFAULT_POSITIONS, analysis: DEFAULT_ANALYSIS, outDir: __dirname, check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--positions") args.positions = argv[index += 1];
    else if (item === "--analysis") args.analysis = argv[index += 1];
    else if (item === "--out-dir") args.outDir = argv[index += 1];
    else if (item === "--check") args.check = true;
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(outDir, name, payload) {
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function avg(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)) : 0;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * pct) - 1)].toFixed(6));
}

function bandFor(scoreLoss) {
  const found = ERROR_BANDS.find(([, min, max]) => scoreLoss > min && scoreLoss <= max);
  return found ? found[0] : scoreLoss <= 0.5 ? "equivalent" : "severe";
}

function moveRank(moveInfos, move) {
  const index = (moveInfos || []).findIndex(item => item.move === move);
  return index >= 0 ? index + 1 : null;
}

function scoreFor(moveInfos, move) {
  const found = (moveInfos || []).find(item => item.move === move);
  return found ? Number(found.scoreLead || 0) : null;
}

function winrateFor(moveInfos, move) {
  const found = (moveInfos || []).find(item => item.move === move);
  return found ? Number(found.winrate || 0) : null;
}

function gtpToPoint(move, size = 19) {
  if (!move || move.toLowerCase() === "pass") return null;
  const letters = "ABCDEFGHJKLMNOPQRST";
  const x = letters.indexOf(move[0].toUpperCase());
  const y = size - Number(move.slice(1));
  return x >= 0 && Number.isFinite(y) ? { x, y } : null;
}

function pointKey(point) {
  return point ? `${point.x},${point.y}` : "pass";
}

function pointKeyToKataGo(move, size = 19) {
  if (!move || move === "pass") return "pass";
  if (/^[A-Z][0-9]+$/i.test(move)) return move.toUpperCase();
  const [x, y] = String(move).split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return move;
  const letters = "ABCDEFGHJKLMNOPQRST";
  return `${letters[x]}${size - y}`;
}

function classify(row, position) {
  if (row.errorBand === "equivalent") return { category: "equivalent_move_false_alarm", confidence: "high", evidence: "KataGo score loss is within equivalent threshold." };
  if (row.katagoUncertain) return { category: "katago_uncertain", confidence: "high", evidence: "Marked unstable by stability pass." };
  const bestPointKey = pointKey(gtpToPoint(row.katagoBestMove));
  const candidateKeys = (position.currentTop10Candidates || []).map(candidate => candidate.move);
  if (!candidateKeys.includes(bestPointKey)) {
    return { category: "best_move_not_generated", confidence: "medium", evidence: "KataGo best move is absent from current top-10 candidate pool." };
  }
  const generatedIndex = candidateKeys.indexOf(bestPointKey);
  if (generatedIndex >= 10) {
    return { category: "best_move_generated_but_below_top10", confidence: "medium", evidence: "KataGo best exists but is below top-10 reading cap." };
  }
  if ((position.sourceTags || []).includes("weak_group")) {
    return { category: "weak_group_evaluation_error", confidence: "medium", evidence: "Best move was generated; position is tagged as weak-group sensitive." };
  }
  if ((position.sourceTags || []).includes("tactical_high_risk")) {
    return { category: "tactical_evaluation_error", confidence: "medium", evidence: "Best move was generated; position is tagged as tactical/high-risk." };
  }
  if ((position.sourceTags || []).includes("whole_board_strategy")) {
    return { category: "whole_board_direction_error", confidence: "medium", evidence: "Best move was generated; whole-board source tags are present." };
  }
  if ((position.sourceTags || []).includes("endgame")) {
    return { category: "territory_or_endgame_evaluation_error", confidence: "medium", evidence: "Best move was generated; endgame/territory tags are present." };
  }
  return { category: "leaf_evaluation_error", confidence: "low", evidence: "Best move was in the candidate pool but the available traces do not isolate a narrower cause." };
}

function bestByProfile(items) {
  return items.slice().sort((a, b) => (PROFILE_PRIORITY[b.profile] || 0) - (PROFILE_PRIORITY[a.profile] || 0))[0] || null;
}

function compare(positionsPayload, analysisPayload) {
  const positions = new Map((positionsPayload.positions || []).map(position => [position.positionId, position]));
  const grouped = {};
  for (const result of analysisPayload.results || []) {
    const parent = result.parentPositionId || String(result.positionId || "").replace(/::played$/, "");
    grouped[parent] ||= { root: [], played: [] };
    grouped[parent][result.analysisKind === "played" ? "played" : "root"].push(result);
  }
  const rows = [];
  for (const [positionId, group] of Object.entries(grouped)) {
    const result = bestByProfile(group.root);
    if (!result) continue;
    const playedResult = bestByProfile(group.played);
    const position = positions.get(positionId);
    if (!position) continue;
    const moveInfos = result.moveInfos || [];
    const best = moveInfos[0] || {};
    const engineMoveKey = result.engineMove;
    const engineMove = pointKeyToKataGo(engineMoveKey, (position.board || []).length || 19);
    const rank = moveRank(moveInfos, engineMove);
    const bestScore = Number(best.scoreLead || 0);
    const playedScoreFromRoot = scoreFor(moveInfos, engineMove);
    const playedScoreFromFollowup = playedResult?.scoreLead ?? null;
    const playedScore = playedScoreFromRoot !== null ? playedScoreFromRoot : playedScoreFromFollowup;
    const bestWinrate = Number(best.winrate || 0);
    const playedWinrateFromRoot = winrateFor(moveInfos, engineMove);
    const playedWinrateFromFollowup = playedResult?.winrate ?? null;
    const playedWinrate = playedWinrateFromRoot !== null ? playedWinrateFromRoot : playedWinrateFromFollowup;
    const side = position.sideToMove || result.sideToMove || "W";
    const scoreLoss = playedScore === null
      ? null
      : side === "B"
        ? Math.max(0, bestScore - playedScore)
        : Math.max(0, playedScore - bestScore);
    const winrateLoss = playedWinrate === null
      ? null
      : side === "B"
        ? Math.max(0, bestWinrate - playedWinrate)
        : Math.max(0, playedWinrate - bestWinrate);
    const candidateKeys = (position.currentTop10Candidates || []).map(candidate => candidate.move);
    const katagoBestPointKey = pointKey(gtpToPoint(best.move));
    const top3Katago = moveInfos.slice(0, 3).map(item => pointKey(gtpToPoint(item.move)));
    const row = {
      positionId: result.positionId,
      phase: position.phase,
      moveNumber: position.moveNumber,
      difficultyMode: position.difficultyMode,
      engineMove: engineMoveKey,
      engineMoveKatago: engineMove,
      katagoBestMove: best.move || null,
      katagoRankOfSelectedMove: rank,
      policyProbability: best.prior || null,
      scoreLoss,
      winrateLoss,
      errorBand: scoreLoss === null ? "invalid_placeholder_data" : bandFor(scoreLoss),
      playedMoveEvaluationSource: playedScoreFromRoot !== null ? "root_moveInfos" : playedResult ? "explicit_played_move_followup" : "missing",
      invalidPlaceholderData: playedScore === null,
      selectedInsideTop3: rank !== null && rank <= 3,
      selectedInsideTop5: rank !== null && rank <= 5,
      selectedInsideTop10: rank !== null && rank <= 10,
      candidatePoolContainsKatagoBest: candidateKeys.includes(katagoBestPointKey),
      candidatePoolContainsKatagoTop3: top3Katago.some(move => candidateKeys.includes(move)),
      katagoBestLegalAndAvailable: true,
      existingLocalReadingRejectedKatagoBest: candidateKeys.includes(katagoBestPointKey) && position.currentEngineSelectedMoveKey !== katagoBestPointKey,
      finalSelectorGuardChangedAwayFromKatagoPreferred: false,
      principalVariation: best.pv || [],
      currentCandidatePool: position.currentTop10Candidates || [],
      currentReadingTrace: position.readingTrace || null,
      currentFinalSelectorTrace: position.finalSelectorTrace || null,
      katagoProfile: result.profile,
      visits: result.visits || best.visits || null
    };
    const attribution = classify(row, position);
    rows.push({ ...row, dominantErrorCategory: attribution.category, confidence: attribution.confidence, evidence: attribution.evidence });
  }
  return rows;
}

function summarize(rows) {
  const actionableRows = rows.filter(row => !row.invalidPlaceholderData && row.dominantErrorCategory !== "katago_uncertain");
  const scoreLosses = actionableRows.map(row => row.scoreLoss);
  const winrateLosses = actionableRows.map(row => row.winrateLoss);
  const byPhase = {};
  for (const row of rows) {
    byPhase[row.phase] ||= [];
    byPhase[row.phase].push(row);
  }
  const phaseSummary = Object.fromEntries(Object.entries(byPhase).map(([phase, items]) => [phase, metrics(items)]));
  return {
    evaluationVersion: "2.0.0-dev",
    generatedAt: new Date().toISOString(),
    positionsEvaluated: rows.length,
    actionablePositionsEvaluated: actionableRows.length,
    invalidPlaceholderDataCount: rows.filter(row => row.invalidPlaceholderData).length,
    averageKataGoRank: avg(actionableRows.map(row => row.katagoRankOfSelectedMove || 11)),
    top1MatchRate: rate(actionableRows, row => row.katagoRankOfSelectedMove === 1),
    top3MatchRate: rate(actionableRows, row => row.selectedInsideTop3),
    top5MatchRate: rate(actionableRows, row => row.selectedInsideTop5),
    top10MatchRate: rate(actionableRows, row => row.selectedInsideTop10),
    averageScoreLoss: avg(scoreLosses),
    medianScoreLoss: median(scoreLosses),
    p90ScoreLoss: percentile(scoreLosses, 0.9),
    averageWinrateLoss: avg(winrateLosses),
    severeErrorRate: rate(actionableRows, row => row.errorBand === "severe"),
    bestMoveCandidateRecall: rate(actionableRows, row => row.candidatePoolContainsKatagoBest),
    top3CandidateRecall: rate(actionableRows, row => row.candidatePoolContainsKatagoTop3),
    candidateGenerationFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "best_move_not_generated"),
    readingFailureRate: rate(actionableRows, row => ["best_move_entered_reading_but_rejected", "opponent_reply_missing", "reading_depth_insufficient"].includes(row.dominantErrorCategory)),
    leafEvaluationFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "leaf_evaluation_error"),
    finalSelectorFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "final_selector_error"),
    wholeBoardDirectionFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "whole_board_direction_error"),
    tacticalFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "tactical_evaluation_error"),
    weakGroupFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "weak_group_evaluation_error"),
    endgameFailureRate: rate(actionableRows, row => row.dominantErrorCategory === "territory_or_endgame_evaluation_error"),
    byDifficultyMode: Object.fromEntries(Object.entries(groupBy(actionableRows, row => row.difficultyMode || "unknown")).map(([mode, items]) => [mode, metrics(items)])),
    phaseSummary
  };
}

function metrics(rows) {
  return {
    positionsEvaluated: rows.length,
    averageKataGoRank: avg(rows.map(row => row.katagoRankOfSelectedMove || 11)),
    top1MatchRate: rate(rows, row => row.katagoRankOfSelectedMove === 1),
    top3MatchRate: rate(rows, row => row.selectedInsideTop3),
    top5MatchRate: rate(rows, row => row.selectedInsideTop5),
    top10MatchRate: rate(rows, row => row.selectedInsideTop10),
    averageScoreLoss: avg(rows.map(row => row.scoreLoss).filter(Number.isFinite)),
    medianScoreLoss: median(rows.map(row => row.scoreLoss).filter(Number.isFinite)),
    p90ScoreLoss: percentile(rows.map(row => row.scoreLoss).filter(Number.isFinite), 0.9),
    severeErrorRate: rate(rows, row => row.errorBand === "severe"),
    candidateRecall: rate(rows, row => row.candidatePoolContainsKatagoBest)
  };
}

function groupBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row);
    acc[key] ||= [];
    acc[key].push(row);
    return acc;
  }, {});
}

function rate(rows, predicate) {
  return rows.length ? Number((rows.filter(predicate).length / rows.length).toFixed(6)) : 0;
}

function categorySummary(rows) {
  const counts = {};
  for (const row of rows.filter(item => ["medium", "large", "severe"].includes(item.errorBand))) {
    counts[row.dominantErrorCategory] = (counts[row.dominantErrorCategory] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({
    category,
    count,
    rate: rows.length ? Number((count / rows.length).toFixed(6)) : 0
  }));
}

function realGameReport(rows, positionsPayload, outDir) {
  const realRows = rows.filter(row => String(row.positionId).startsWith("uploaded_real_game_20260714:"));
  const missing = positionsPayload.realGameFixture?.fixtureStatus !== "loaded";
  const payload = {
    evaluationVersion: "2.0.0-dev",
    fixtureStatus: positionsPayload.realGameFixture?.fixtureStatus || "unknown",
    sgfPath: positionsPayload.realGameFixture?.sgfPath,
    debugPath: positionsPayload.realGameFixture?.debugPath,
    note: missing ? "Uploaded real-game fixture was not available in this environment; no real-game conclusions are reported." : "Uploaded real-game positions analyzed.",
    aiMoveCountAnalyzed: realRows.length,
    worstTenAiMoves: realRows.slice().sort((a, b) => b.scoreLoss - a.scoreLoss).slice(0, 10)
  };
  write(outDir, "v200-real-game-analysis-20260714.json", payload);
  fs.writeFileSync(path.join(outDir, "v200-real-game-analysis-20260714.txt"), [
    "GoKidCoach V2.0.0-dev Real Game Analysis",
    `fixtureStatus: ${payload.fixtureStatus}`,
    `sgfPath: ${payload.sgfPath}`,
    `debugPath: ${payload.debugPath}`,
    payload.note,
    `aiMoveCountAnalyzed: ${payload.aiMoveCountAnalyzed}`
  ].join("\n") + "\n", "utf8");
  return payload;
}

function writeMarkdown(outDir, summary, categories, realGame, gate) {
  const lines = [
    "# GoKidCoach V2.0.0 External Benchmark",
    "",
    "This is an offline development-time KataGo benchmark. It does not integrate KataGo into the browser runtime.",
    "",
    "## Status",
    "",
    `- Positions evaluated: ${summary.positionsEvaluated}`,
    `- Real-game fixture: ${realGame.fixtureStatus}`,
    `- Gate passed: ${gate.passed}`,
    `- Runtime behavior changed: ${gate.runtimeBehaviorChanged}`,
    `- Deployment occurred: ${gate.deploymentOccurred}`,
    "",
    "## Top Metrics",
    "",
    `- Average KataGo rank: ${summary.averageKataGoRank}`,
    `- Top 1 / 3 / 5 / 10 rates: ${summary.top1MatchRate} / ${summary.top3MatchRate} / ${summary.top5MatchRate} / ${summary.top10MatchRate}`,
    `- Average / median / p90 score loss: ${summary.averageScoreLoss} / ${summary.medianScoreLoss} / ${summary.p90ScoreLoss}`,
    `- Severe error rate: ${summary.severeErrorRate}`,
    `- Best-move candidate recall: ${summary.bestMoveCandidateRecall}`,
    "",
    "## Dominant Error Categories",
    "",
    ...categories.slice(0, 8).map(item => `- ${item.category}: ${item.count} (${item.rate})`),
    "",
    "## Recommended V2.0.1 Priorities",
    "",
    "1. Use only high-confidence external attributions once the full 2000-position run and real-game fixture are available.",
    "2. Separate candidate-generation misses from evaluator/ranking misses before changing runtime strength logic.",
    "3. Re-run standard and deep_sample stability on critical positions before accepting any runtime patch.",
    ""
  ];
  fs.writeFileSync(path.join(outDir, "V200-EXTERNAL-BENCHMARK.md"), `${lines.join("\n")}\n`, "utf8");
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.check) {
    const status = {
      positionsFileExists: fs.existsSync(args.positions),
      analysisFileExists: fs.existsSync(args.analysis),
      runtimeBehaviorChanged: false,
      deploymentOccurred: false
    };
    process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    return status.positionsFileExists ? 0 : 1;
  }
  const positionsPayload = readJson(args.positions);
  const analysisPayload = readJson(args.analysis);
  const rows = compare(positionsPayload, analysisPayload);
  const summary = summarize(rows);
  const categories = categorySummary(rows);
  const realGame = realGameReport(rows, positionsPayload, args.outDir);
  const severe = rows.filter(row => row.errorBand === "severe").sort((a, b) => b.scoreLoss - a.scoreLoss);
  const candidateRecall = rows.map(row => ({
    positionId: row.positionId,
    phase: row.phase,
    candidatePoolContainsKatagoBest: row.candidatePoolContainsKatagoBest,
    candidatePoolContainsKatagoTop3: row.candidatePoolContainsKatagoTop3,
    katagoBestMove: row.katagoBestMove,
    currentCandidatePool: row.currentCandidatePool
  }));
  const readingFailures = rows.filter(row => /reading|opponent_reply/.test(row.dominantErrorCategory));
  const evaluatorFailures = rows.filter(row => /evaluation|whole_board|territory|tactical|weak_group|leaf/.test(row.dominantErrorCategory));
  const stability = {
    evaluationVersion: "2.0.0-dev",
    status: "not_run",
    reason: "Run standard duplicate/deep_sample profiles with run-v200-katago-analysis.py, then feed results here.",
    bestMoveAgreementRate: null,
    top3AgreementRate: null,
    averageScoreLeadDifference: null,
    averageWinrateDifference: null,
    unstablePositionCount: null
  };
  const gate = {
    evaluationVersion: "2.0.0-dev",
    passed: positionsPayload.uniquePositions >= 2000
      && (analysisPayload.results || []).length >= 2000
      && realGame.fixtureStatus === "loaded"
      && stability.status === "passed",
    failedGates: [],
    runtimeBehaviorChanged: false,
    deploymentOccurred: false
  };
  if (positionsPayload.uniquePositions < 2000) gate.failedGates.push("position_count");
  if ((analysisPayload.results || []).length < 2000) gate.failedGates.push("analysis_count");
  if (realGame.fixtureStatus !== "loaded") gate.failedGates.push("uploaded_real_game_missing");
  if (stability.status !== "passed") gate.failedGates.push("katago_stability_not_run");
  write(args.outDir, "v200-external-benchmark-summary.json", summary);
  write(args.outDir, "v200-phase-summary.json", summary.phaseSummary);
  write(args.outDir, "v200-error-attribution.json", { categories, rows });
  write(args.outDir, "v200-severe-errors.json", severe);
  write(args.outDir, "v200-candidate-recall.json", candidateRecall);
  write(args.outDir, "v200-reading-failures.json", readingFailures);
  write(args.outDir, "v200-evaluator-failures.json", evaluatorFailures);
  write(args.outDir, "v200-katago-stability.json", stability);
  write(args.outDir, "v200-gate-result.json", gate);
  writeMarkdown(args.outDir, summary, categories, realGame, gate);
  process.stdout.write(`${JSON.stringify({ positionsEvaluated: summary.positionsEvaluated, passed: gate.passed, failedGates: gate.failedGates })}\n`);
  return gate.passed ? 0 : 2;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = { compare, summarize, categorySummary };
