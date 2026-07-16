#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const compareApi = require("./compare-v200-engine-vs-katago.js");

const OUT = __dirname;

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8"));
}

function write(name, payload) {
  fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function top3(result) {
  return (result.moveInfos || []).slice(0, 3).map(item => item.move).sort();
}

function sameSet(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function stabilityReport(primary, rerun, deep) {
  const primaryMap = new Map(primary.results.filter(row => row.profile === "standard" && row.analysisKind === "root").map(row => [row.parentPositionId || row.positionId, row]));
  const rerunMap = new Map(rerun.results.map(row => [row.parentPositionId || row.positionId, row]));
  const deepMap = new Map(deep.results.map(row => [row.parentPositionId || row.positionId, row]));
  const rows = [];
  for (const [id, first] of primaryMap.entries()) {
    const second = rerunMap.get(id);
    if (!second) continue;
    const scoreDiff = Math.abs(Number(first.scoreLead || 0) - Number(second.scoreLead || 0));
    const winrateDiff = Math.abs(Number(first.winrate || 0) - Number(second.winrate || 0));
    const bestMoveAgreement = first.katagoBestMove === second.katagoBestMove;
    const top3Agreement = sameSet(top3(first), top3(second));
    const deepRow = deepMap.get(id);
    const deepBestAgreement = deepRow ? first.katagoBestMove === deepRow.katagoBestMove : null;
    const unstable = !bestMoveAgreement || !top3Agreement || scoreDiff > 3 || winrateDiff > 0.08 || deepBestAgreement === false;
    rows.push({
      positionId: id,
      firstBest: first.katagoBestMove,
      secondBest: second.katagoBestMove,
      bestMoveAgreement,
      top3Agreement,
      scoreLeadDifference: Number(scoreDiff.toFixed(6)),
      winrateDifference: Number(winrateDiff.toFixed(6)),
      deepBest: deepRow?.katagoBestMove || null,
      deepBestAgreement,
      unstable
    });
  }
  return {
    evaluationVersion: "2.0.0-dev",
    status: rows.length >= 100 ? "passed" : "failed",
    sampledPositionCount: rows.length,
    deepSampleComparedCount: rows.filter(row => row.deepBestAgreement !== null).length,
    bestMoveAgreementRate: Number((rows.filter(row => row.bestMoveAgreement).length / Math.max(1, rows.length)).toFixed(6)),
    top3AgreementRate: Number((rows.filter(row => row.top3Agreement).length / Math.max(1, rows.length)).toFixed(6)),
    averageScoreLeadDifference: Number(avg(rows.map(row => row.scoreLeadDifference)).toFixed(6)),
    averageWinrateDifference: Number(avg(rows.map(row => row.winrateDifference)).toFixed(6)),
    unstablePositionCount: rows.filter(row => row.unstable).length,
    unstablePositionIds: rows.filter(row => row.unstable).map(row => row.positionId),
    rows
  };
}

function main() {
  const positions = read("v200-positions.json");
  const root = read("v200-katago-analysis-root.json");
  const played = read("v200-katago-analysis-played.json");
  const standard = read("v200-katago-analysis-standard.json");
  const deep = read("v200-katago-analysis-deep.json");
  const rerun = read("v200-katago-stability-rerun.json");
  const combined = {
    evaluationVersion: "2.0.0-dev",
    generatedAt: new Date().toISOString(),
    positionsAnalyzed: root.results.length,
    results: root.results.concat(played.results, standard.results, deep.results)
  };
  write("v200-katago-analysis-combined.json", combined);
  const rows = compareApi.compare(positions, combined);
  const stability = stabilityReport(standard, rerun, deep);
  const unstable = new Set(stability.unstablePositionIds);
  const finalRows = rows.map(row => unstable.has(row.positionId)
    ? { ...row, katagoUncertain: true, dominantErrorCategory: "katago_uncertain", confidence: "high", evidence: "KataGo stability check marked this position unstable." }
    : row);
  const summary = compareApi.summarize(finalRows);
  const categories = compareApi.categorySummary(finalRows);
  const realRows = finalRows.filter(row => String(row.positionId).includes("uploaded_real_game_20260714"));
  const realGame = {
    evaluationVersion: "2.0.0-dev",
    fixtureStatus: positions.realGameFixture.fixtureStatus,
    sgfSha256: positions.realGameFixture.sgfSha256,
    debugSha256: positions.realGameFixture.debugSha256,
    difficultyMode: positions.realGameFixture.difficultyMode,
    debugCompleteness: positions.realGameFixture.debugCompleteness,
    note: "Reduced debug fixture has no moveDiagnostics; move sequence and analyzed position are derived_from_sgf.",
    aiMoveCountAnalyzed: realRows.length,
    worstTenAiMoves: realRows.slice().sort((a, b) => (b.scoreLoss || 0) - (a.scoreLoss || 0)).slice(0, 10)
  };
  const gate = {
    evaluationVersion: "2.0.0-dev",
    passed: positions.uniquePositions >= 2200
      && root.results.length >= 2200
      && realGame.fixtureStatus === "loaded"
      && summary.invalidPlaceholderDataCount === 0
      && stability.status === "passed",
    failedGates: [],
    runtimeBehaviorChanged: false,
    deploymentOccurred: false
  };
  if (positions.uniquePositions < 2200) gate.failedGates.push("position_count");
  if (root.results.length < 2200) gate.failedGates.push("quick_analysis_count");
  if (realGame.fixtureStatus !== "loaded") gate.failedGates.push("uploaded_real_game_missing");
  if (summary.invalidPlaceholderDataCount !== 0) gate.failedGates.push("placeholder_losses_present");
  if (stability.status !== "passed") gate.failedGates.push("katago_stability_not_passed");

  write("v200-external-benchmark-summary.json", summary);
  write("v200-phase-summary.json", summary.phaseSummary);
  write("v200-error-attribution.json", { categories, rows: finalRows });
  write("v200-severe-errors.json", finalRows.filter(row => row.errorBand === "severe").sort((a, b) => (b.scoreLoss || 0) - (a.scoreLoss || 0)));
  write("v200-candidate-recall.json", finalRows.map(row => ({
    positionId: row.positionId,
    phase: row.phase,
    difficultyMode: row.difficultyMode,
    candidatePoolContainsKatagoBest: row.candidatePoolContainsKatagoBest,
    candidatePoolContainsKatagoTop3: row.candidatePoolContainsKatagoTop3,
    katagoBestMove: row.katagoBestMove
  })));
  write("v200-reading-failures.json", finalRows.filter(row => /reading|opponent_reply/.test(row.dominantErrorCategory)));
  write("v200-evaluator-failures.json", finalRows.filter(row => /evaluation|whole_board|territory|tactical|weak_group|leaf/.test(row.dominantErrorCategory)));
  write("v200-katago-stability.json", stability);
  write("v200-real-game-analysis-20260714.json", realGame);
  write("v200-gate-result.json", gate);
  fs.writeFileSync(path.join(OUT, "v200-real-game-analysis-20260714.txt"), [
    "GoKidCoach V2.0.0-dev Real Game Analysis",
    `fixtureStatus: ${realGame.fixtureStatus}`,
    `difficultyMode: ${realGame.difficultyMode}`,
    `debugCompleteness: ${realGame.debugCompleteness}`,
    `aiMoveCountAnalyzed: ${realGame.aiMoveCountAnalyzed}`,
    `sgfSha256: ${realGame.sgfSha256}`,
    `debugSha256: ${realGame.debugSha256}`,
    realGame.note
  ].join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(OUT, "V200-EXTERNAL-BENCHMARK.md"), [
    "# GoKidCoach V2.0.0 External Benchmark",
    "",
    `Positions analyzed: ${summary.positionsEvaluated}`,
    `Actionable positions: ${summary.actionablePositionsEvaluated}`,
    `Top1/3/5/10: ${summary.top1MatchRate} / ${summary.top3MatchRate} / ${summary.top5MatchRate} / ${summary.top10MatchRate}`,
    `Score loss avg/median/p90: ${summary.averageScoreLoss} / ${summary.medianScoreLoss} / ${summary.p90ScoreLoss}`,
    `Severe error rate: ${summary.severeErrorRate}`,
    `Candidate recall: ${summary.bestMoveCandidateRecall}`,
    `Stability: ${stability.status}, unstable=${stability.unstablePositionCount}`,
    `Gate passed: ${gate.passed}`,
    "",
    "## V2.0.1 Priorities",
    "",
    ...categories.slice(0, 3).map((item, index) => `${index + 1}. ${item.category}: ${item.count} positions`)
  ].join("\n") + "\n", "utf8");
  process.stdout.write(`${JSON.stringify({ passed: gate.passed, failedGates: gate.failedGates, summary, stability }, null, 2)}\n`);
}

if (require.main === module) main();
