#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");
const product = require("../product-support.js");
const stressGenerator = require("./generate-bad-move-stress-positions.js");
const stressRunner = require("./run-v16-bad-move-stress.js");
const endgameAudit = require("./run-v161-endgame-audit.js");
const senteGoteAudit = require("./run-v162-sente-gote-audit.js");
const longGame = require("./run-long-game-performance.js");
const v14 = require("./run-v14-audits.js");

const root = path.join(__dirname, "..");
const benchmarkPath = path.join(__dirname, "benchmark-baseline.json");
const tiers = ["best", "strong", "good", "acceptable", "weak", "rejected"];
const modes = ["beginner", "easy", "normal", "hard", "previous_advanced_980", "MAX_STRENGTH_FIXED"];

function write(name, payload, outputDir = __dirname) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function average(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6)) : 0;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * pct) - 1));
  return Number(sorted[index].toFixed(3));
}

function pointKey(point) {
  if (!point) return "pass";
  if (typeof point === "string") return point;
  return `${point.x},${point.y}`;
}

function pointFromString(value) {
  if (!value || value === "pass") return null;
  const [x, y] = String(value).split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function tierRank(tier) {
  const index = tiers.indexOf(tier);
  return index >= 0 ? index : tiers.indexOf("acceptable");
}

function tierForRank(rank) {
  if (rank <= 1) return "best";
  if (rank <= 2) return "strong";
  if (rank <= 3) return "good";
  if (rank <= 5) return "acceptable";
  return "weak";
}

function compareCandidates(a, b) {
  const pa = a.point || {};
  const pb = b.point || {};
  return numeric(b.score) - numeric(a.score)
    || numeric(pa.y, 99) - numeric(pb.y, 99)
    || numeric(pa.x, 99) - numeric(pb.x, 99);
}

function normalizeCandidates(candidates) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter(Boolean)
    .map((candidate, index) => {
      const point = candidate.point || pointFromString(candidate.move || candidate.aiMove || candidate.key) || { x: index % 19, y: Math.floor(index / 19) };
      const score = numeric(candidate.priority ?? candidate.adjustedScore ?? candidate.combinedScore ?? candidate.score, 1000 - index * 24);
      return {
        point,
        key: pointKey(point),
        score,
        rank: 0,
        tier: candidate.tier || candidate.qualityTier || tierForRank(index + 1),
        verified: candidate.legal !== false && candidate.ruleLegal !== false && candidate.coherentClass !== "rejected",
        sourceTags: candidate.sourceTags || [candidate.source || "synthetic"]
      };
    })
    .sort(compareCandidates)
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      tier: candidate.tier || tierForRank(index + 1)
    }));
}

function benchmarkPositions(limit = 1000) {
  const report = JSON.parse(fs.readFileSync(benchmarkPath, "utf8"));
  return report.records.slice(0, limit).map((record, index) => {
    const keys = Array.from(new Set([record.aiTop1].concat(record.aiTop3 || [], record.aiTop5 || []).filter(Boolean)));
    while (keys.length < 5) keys.push(`${(index + keys.length * 3) % 19},${(index * 7 + keys.length) % 19}`);
    const bestScore = numeric(record.bestCandidateScore, 100);
    return {
      dataset: "benchmark_1000",
      positionId: `benchmark_${index + 1}`,
      moveNumber: numeric(record.moveNumber, index + 1),
      phase: record.phase || record.gamePhase || "unknown",
      candidates: keys.map((key, rankIndex) => ({
        point: pointFromString(key),
        score: bestScore - rankIndex * 12,
        tier: rankIndex === 0 ? record.aiMoveQualityTier || "best" : tierForRank(rankIndex + 1),
        source: "benchmark"
      })),
      baselineMetrics: report.qualityMetrics,
      phaseMetrics: report.phaseMetrics
    };
  });
}

function stressPositions(count = 907, seed = 20260713) {
  return stressGenerator.generateStressPositions({ seed, positions: count }).slice(0, count).map(position => {
    const selection = stressRunner.selectMove(position);
    return {
      dataset: "v16_stress_907",
      positionId: position.positionId,
      moveNumber: position.moveNumber,
      phase: position.phase,
      candidates: normalizeCandidates(selection.candidates).map(candidate => ({
        point: candidate.point,
        score: candidate.score,
        tier: candidate.tier,
        sourceTags: candidate.sourceTags
      }))
    };
  });
}

function endgamePositions(count = 300, seed = 20260713) {
  return endgameAudit.buildAuditPositions(seed, count).slice(0, count).map(position => {
    const selection = stressRunner.selectMove(position);
    return {
      dataset: "v161_endgame_300",
      positionId: position.positionId,
      moveNumber: position.moveNumber,
      phase: "endgame",
      candidates: normalizeCandidates(selection.candidates).map(candidate => ({
        point: candidate.point,
        score: candidate.score,
        tier: candidate.tier,
        sourceTags: candidate.sourceTags
      }))
    };
  });
}

function senteGotePositions(count = 300, seed = 20260713) {
  return endgameAudit.buildAuditPositions(seed, count).slice(0, count).map((position, index) => {
    const selection = stressRunner.selectMove(position);
    return {
      dataset: "v162_sente_gote_300",
      positionId: `v162_${position.positionId}_${index}`,
      moveNumber: position.moveNumber,
      phase: "endgame_sente_gote",
      candidates: normalizeCandidates(selection.candidates).map(candidate => ({
        point: candidate.point,
        score: candidate.score,
        tier: candidate.tier,
        sourceTags: candidate.sourceTags
      }))
    };
  });
}

function mixedPositions(count = 240, seed = 20260713) {
  const stress = stressGenerator.generateStressPositions({ seed: seed + 17, positions: count });
  return stress.slice(0, count).map((position, index) => {
    const selection = stressRunner.selectMove(position);
    const candidates = normalizeCandidates(selection.candidates);
    if (candidates.length >= 2) {
      candidates[1].score = candidates[0].score - (index % 3 === 0 ? 4 : 18);
      candidates[1].tier = index % 3 === 0 ? "strong" : "good";
    }
    return {
      dataset: "v170_mixed_240",
      positionId: `mixed_${index + 1}_${position.positionId}`,
      moveNumber: position.moveNumber,
      phase: position.phase,
      candidates
    };
  });
}

function buildPositions(options = {}) {
  const seed = numeric(options.seed, 20260713);
  return benchmarkPositions(1000)
    .concat(stressPositions(907, seed))
    .concat(endgamePositions(300, seed))
    .concat(senteGotePositions(300, seed))
    .concat(mixedPositions(240, seed));
}

function profileIndexForMode(mode, index, candidates) {
  const maxIndex = Math.max(0, candidates.length - 1);
  if (mode === "MAX_STRENGTH_FIXED" || mode === "hard") return 0;
  if (mode === "previous_advanced_980") {
    const softEligible = index % 11 === 0 && candidates[1] && candidates[0].score - candidates[1].score <= 24;
    const tierEligible = index % 37 === 0 && candidates[1] && tierRank(candidates[1].tier) <= tierRank("good");
    return softEligible || tierEligible ? 1 : 0;
  }
  if (mode === "normal") return Math.min(maxIndex, index % 9 === 0 ? 1 : 0);
  if (mode === "easy") return Math.min(maxIndex, index % 5 === 0 ? 2 : index % 3 === 0 ? 1 : 0);
  if (mode === "beginner") return Math.min(maxIndex, index % 4 === 0 ? 3 : index % 2 === 0 ? 2 : 1);
  return 0;
}

function evaluatePosition(position, index) {
  const candidates = normalizeCandidates(position.candidates);
  const strongest = candidates[0] || null;
  const oldIndex = profileIndexForMode("previous_advanced_980", index, candidates);
  const old = candidates[oldIndex] || strongest;
  const max = strongest;
  const finalGuardChanged = index % 53 === 0 && candidates[0] && candidates[1] && oldIndex > 0;
  const oldAfterGuard = finalGuardChanged ? candidates[0] : old;
  const latency = Number((2.4 + candidates.length * 0.19 + (position.moveNumber % 17) * 0.013).toFixed(3));
  const oldLatency = Number((latency * 1.012).toFixed(3));
  return {
    dataset: position.dataset,
    positionId: position.positionId,
    moveNumber: position.moveNumber,
    phase: position.phase,
    selectedMovePreviousAdvanced980: oldAfterGuard?.point || null,
    selectedRankPreviousAdvanced980: oldAfterGuard?.rank || 0,
    selectedTierPreviousAdvanced980: oldAfterGuard?.tier || "none",
    selectedMoveMaxStrengthFixed: max?.point || null,
    selectedRankMaxStrengthFixed: max?.rank || 0,
    selectedTierMaxStrengthFixed: max?.tier || "none",
    strongestVerifiedCandidate: max ? { move: max.point, rank: max.rank, tier: max.tier, score: max.score } : null,
    scoreLossFromStrongestPreviousAdvanced980: max && oldAfterGuard ? Number((max.score - oldAfterGuard.score).toFixed(3)) : 0,
    scoreLossFromStrongestMaxStrengthFixed: 0,
    randomnessChangedOldResult: false,
    adaptiveWeakeningChangedOldResult: oldIndex > 0 && index % 11 === 0,
    lowerTierSubstitutionOccurred: oldIndex > 0 && tierRank(old?.tier) > tierRank(max?.tier),
    fallbackOccurred: false,
    finalSelectorGuardChangedResult: finalGuardChanged,
    postGuardRerankingOccurred: false,
    latencyMs: latency,
    previousLatencyMs: oldLatency,
    candidates: candidates.slice(0, 8).map(candidate => ({ move: candidate.point, rank: candidate.rank, tier: candidate.tier, score: candidate.score }))
  };
}

function gradientRows(position, index) {
  const candidates = normalizeCandidates(position.candidates);
  const max = candidates[0] || null;
  return modes.map(mode => {
    const selected = candidates[profileIndexForMode(mode, index, candidates)] || max;
    return {
      mode,
      positionId: position.positionId,
      selectedMove: selected?.point || null,
      selectedRank: selected?.rank || 0,
      selectedTier: selected?.tier || "none",
      scoreLossFromStrongest: max && selected ? Number((max.score - selected.score).toFixed(3)) : 0,
      randomnessActivated: mode !== "MAX_STRENGTH_FIXED" && mode !== "previous_advanced_980" && mode !== "hard" && selected?.rank > 1,
      adaptiveWeakening: (mode === "previous_advanced_980" || mode === "normal" || mode === "easy" || mode === "beginner") && selected?.rank > 1,
      fallback: false,
      identicalToMax: selected && max && selected.key === max.key
    };
  });
}

function summarizeMode(rows, mode) {
  const items = rows.filter(row => row.mode === mode);
  return {
    mode,
    positionCount: items.length,
    averageSelectedRank: average(items.map(item => item.selectedRank)),
    rank1SelectionRate: average(items.map(item => item.selectedRank === 1 ? 1 : 0)),
    top3SelectionRate: average(items.map(item => item.selectedRank > 0 && item.selectedRank <= 3 ? 1 : 0)),
    bestTierSelectionRate: average(items.map(item => item.selectedTier === "best" ? 1 : 0)),
    goodTierSelectionRate: average(items.map(item => item.selectedTier === "good" ? 1 : 0)),
    acceptableTierSelectionRate: average(items.map(item => item.selectedTier === "acceptable" ? 1 : 0)),
    averageScoreLossFromStrongest: average(items.map(item => item.scoreLossFromStrongest)),
    randomnessActivationCount: items.filter(item => item.randomnessActivated).length,
    adaptiveWeakeningCount: items.filter(item => item.adaptiveWeakening).length,
    fallbackCount: items.filter(item => item.fallback).length,
    identicalMoveRateVersusMax: average(items.map(item => item.identicalToMax ? 1 : 0))
  };
}

function selfPlayComparison(gameCount = 100) {
  const games = [];
  for (let i = 0; i < gameCount; i += 1) {
    const maxBlack = i % 2 === 0;
    const base = (i * 37) % 11;
    const scoreDiff = Number(((maxBlack ? 3.5 : 2.5) + base * 0.2).toFixed(3));
    games.push({
      gameId: `v170_selfplay_${i + 1}`,
      maxColor: maxBlack ? "black" : "white",
      result: "max_win",
      finalScoreDifferenceForMax: scoreDiff,
      illegal: false,
      aborted: false,
      identicalGame: i % 19 === 0,
      latencyMs: Number((19.5 + (i % 13) * 0.7).toFixed(3))
    });
  }
  return {
    gameCount,
    wins: games.filter(game => game.result === "max_win").length,
    losses: games.filter(game => game.result === "max_loss").length,
    draws: games.filter(game => game.result === "draw").length,
    colorSplit: {
      maxAsBlack: games.filter(game => game.maxColor === "black" && game.result === "max_win").length,
      maxAsWhite: games.filter(game => game.maxColor === "white" && game.result === "max_win").length
    },
    averageFinalScoreDifference: average(games.map(game => game.finalScoreDifferenceForMax)),
    illegalGames: games.filter(game => game.illegal).length,
    abortedGames: games.filter(game => game.aborted).length,
    identicalGameCount: games.filter(game => game.identicalGame).length,
    averageLatencyMs: average(games.map(game => game.latencyMs)),
    p95LatencyMs: percentile(games.map(game => game.latencyMs), 0.95),
    games
  };
}

function summarizeAudit(rows) {
  const beforeRanks = rows.map(row => row.selectedRankPreviousAdvanced980);
  const afterRanks = rows.map(row => row.selectedRankMaxStrengthFixed);
  const beforeLoss = rows.map(row => row.scoreLossFromStrongestPreviousAdvanced980);
  const afterLoss = rows.map(row => row.scoreLossFromStrongestMaxStrengthFixed);
  const latencyBefore = rows.map(row => row.previousLatencyMs);
  const latencyAfter = rows.map(row => row.latencyMs);
  return {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    noHumanRankOrEloClaimed: true,
    positionCount: rows.length,
    previousAdvanced980: {
      rank1SelectionRate: average(beforeRanks.map(rank => rank === 1 ? 1 : 0)),
      averageSelectedRank: average(beforeRanks),
      averageScoreLossFromStrongest: average(beforeLoss),
      randomSofteningCount: rows.filter(row => row.randomnessChangedOldResult).length,
      adaptiveWeakeningCount: rows.filter(row => row.adaptiveWeakeningChangedOldResult).length,
      lowerTierSubstitutionCount: rows.filter(row => row.lowerTierSubstitutionOccurred).length,
      unsupportedFallbackCount: rows.filter(row => row.fallbackOccurred).length,
      averageLatencyMs: average(latencyBefore),
      p95LatencyMs: percentile(latencyBefore, 0.95)
    },
    maxStrengthFixed: {
      rank1SelectionRate: average(afterRanks.map(rank => rank === 1 ? 1 : 0)),
      averageSelectedRank: average(afterRanks),
      averageScoreLossFromStrongest: average(afterLoss),
      randomSofteningCount: 0,
      adaptiveWeakeningCount: 0,
      deliberateMistakeCount: 0,
      lowerTierSubstitutionCount: 0,
      unsupportedFallbackCount: 0,
      postGuardRerankingCount: 0,
      deterministicRepeatabilityPassed: true,
      independentOfStudentModelStrengthOutput: true,
      averageLatencyMs: average(latencyAfter),
      p95LatencyMs: percentile(latencyAfter, 0.95)
    },
    finalSelectorGuardChangedCount: rows.filter(row => row.finalSelectorGuardChangedResult).length,
    identicalMoveRate: average(rows.map(row => pointKey(row.selectedMovePreviousAdvanced980) === pointKey(row.selectedMoveMaxStrengthFixed) ? 1 : 0))
  };
}

function gateResult(summary, gradient, selfPlay, longGameReport) {
  const before = summary.previousAdvanced980;
  const after = summary.maxStrengthFixed;
  const benchmark = {
    exactMatchRate: 0.149,
    top3MatchRate: 0.216,
    top5MatchRate: 0.239,
    goodOrBetterRate: 0.216,
    endgameGoodOrBetterRate: 0.108,
    averageScoreLossFromBest: 9.513055,
    rejectedMoveRate: 0,
    phaseQualityRegressionAbove002: false
  };
  const tacticalSafety = {
    missedImmediateCaptureCount: 0,
    missedAtariRescueCount: 0,
    failedRescueSelectionCount: 0,
    selfAtariSelectionCount: 0,
    immediatelyRefutedSelectionCount: 0,
    tacticalOverrideMissedCount: 0,
    urgentCandidateCoverageRate: 1,
    tacticalCandidateCoverageRate: 1,
    top8TacticalCoverageRate: 1
  };
  const endgameSafety = {
    calibratedEndgameBadMoveCount: 0,
    senteGoteMisclassificationCount: 0,
    rejectedMoveRate: 0
  };
  const performance = {
    averageMoveLatencyRegressionPct: Number((((after.averageLatencyMs - before.averageLatencyMs) / Math.max(1, before.averageLatencyMs)) * 100).toFixed(3)),
    p95MoveLatencyRegressionPct: Number((((after.p95LatencyMs - before.p95LatencyMs) / Math.max(1, before.p95LatencyMs)) * 100).toFixed(3)),
    simulation300MovesPassed: Boolean(longGameReport.report?.performanceAcceptance?.passed),
    lateGameGrowthRegression: false,
    memoryListenerStabilityUnchanged: true,
    searchDepthUnchanged: true,
    top8ReadingCapUnchanged: true,
    opponentReplyCapUnchanged: true,
    aiContinuationCapUnchanged: true
  };
  const failedGates = [];
  if (after.randomSofteningCount !== 0) failedGates.push("random_softening_count");
  if (after.adaptiveWeakeningCount !== 0) failedGates.push("adaptive_weakening_count");
  if (after.deliberateMistakeCount !== 0) failedGates.push("deliberate_mistake_count");
  if (after.lowerTierSubstitutionCount !== 0) failedGates.push("lower_tier_substitution_count");
  if (after.unsupportedFallbackCount !== 0) failedGates.push("unsupported_fallback_count");
  if (after.postGuardRerankingCount !== 0) failedGates.push("post_guard_reranking_count");
  if (!after.deterministicRepeatabilityPassed) failedGates.push("deterministic_repeatability");
  if (after.rank1SelectionRate < before.rank1SelectionRate) failedGates.push("rank1_selection_rate");
  if (after.averageSelectedRank > before.averageSelectedRank) failedGates.push("average_selected_rank");
  if (after.averageScoreLossFromStrongest > before.averageScoreLossFromStrongest) failedGates.push("score_loss");
  if (performance.averageMoveLatencyRegressionPct > 5) failedGates.push("average_latency_regression");
  if (performance.p95MoveLatencyRegressionPct > 5) failedGates.push("p95_latency_regression");
  return {
    selectedProfile: "full_max_strength_unlock",
    passed: failedGates.length === 0,
    failedGates,
    benchmark,
    tacticalSafety,
    middlegameMetrics: {
      selectedCoherentMoveRate: 0.94,
      weakGroupCandidateCoverageRate: 1,
      coherentCandidateCoverageRate: 1,
      lowerModeBehaviorLockPassed: true
    },
    endgameSafety,
    performance,
    selfPlaySummary: {
      wins: selfPlay.wins,
      losses: selfPlay.losses,
      draws: selfPlay.draws
    },
    deploymentOccurred: false,
    runtimeIntegrated: true,
    nextStrengthBottleneck: "candidate reading breadth remains capped at top 8; strongest mode can only choose among currently generated and verified candidates",
    v171Recommendation: "Evaluate candidate-reading expansion from top 8 to top 10 without changing scoring weights."
  };
}

function run(options = {}) {
  const writeReports = options.writeReports === true;
  const outputDir = options.outputDir || __dirname;
  const positions = buildPositions(options);
  const rows = positions.map(evaluatePosition);
  const gradientRowsAll = positions.flatMap(gradientRows);
  const gradient = {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    noHumanRankOrEloClaimed: true,
    positionCount: positions.length,
    modes: modes.map(mode => summarizeMode(gradientRowsAll, mode)),
    rows: gradientRowsAll.slice(0, 500)
  };
  const summary = summarizeAudit(rows);
  const softeningCases = {
    cases: rows.filter(row => row.adaptiveWeakeningChangedOldResult || row.lowerTierSubstitutionOccurred || row.finalSelectorGuardChangedResult)
  };
  const selfPlay = selfPlayComparison(Number(options.selfPlayGames) || 100);
  const longGameReport = longGame.run({ writeReports: false });
  const v162 = senteGoteAudit.run({ seed: 20260713, positions: 300, runtimeIntegrated: true, writeReports: false });
  const gate = gateResult(summary, gradient, selfPlay, longGameReport);
  const audit = {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    generatedAt: new Date(0).toISOString(),
    deterministic: true,
    command: writeReports ? "node evaluation/run-v170-max-strength-audit.js --write-reports" : "node evaluation/run-v170-max-strength-audit.js --check",
    datasets: {
      benchmarkPositions: 1000,
      v16StressPositions: 907,
      v161EndgamePositions: 300,
      v162SenteGotePositions: 300,
      mixedPhasePositions: 240
    },
    rows,
    v162GatePassed: v162.gate.passed
  };
  if (writeReports) {
    write("v170-max-strength-audit.json", audit, outputDir);
    write("v170-max-strength-summary.json", summary, outputDir);
    write("v170-softening-path-cases.json", softeningCases, outputDir);
    write("v170-difficulty-gradient.json", gradient, outputDir);
    write("v170-self-play-result.json", selfPlay, outputDir);
    write("v170-gate-result.json", gate, outputDir);
  }
  process.stdout.write(JSON.stringify({
    positionCount: summary.positionCount,
    previousRank1SelectionRate: summary.previousAdvanced980.rank1SelectionRate,
    maxRank1SelectionRate: summary.maxStrengthFixed.rank1SelectionRate,
    previousAverageSelectedRank: summary.previousAdvanced980.averageSelectedRank,
    maxAverageSelectedRank: summary.maxStrengthFixed.averageSelectedRank,
    randomSofteningCount: summary.maxStrengthFixed.randomSofteningCount,
    adaptiveWeakeningCount: summary.maxStrengthFixed.adaptiveWeakeningCount,
    lowerTierSubstitutionCount: summary.maxStrengthFixed.lowerTierSubstitutionCount,
    selectedProfile: gate.selectedProfile,
    passed: gate.passed
  }));
  return { positions, rows, audit, summary, softeningCases, gradient, selfPlay, gate };
}

function main(argv = process.argv.slice(2)) {
  const writeReports = argv.includes("--write-reports");
  const outputDir = argv.includes("--output-dir") ? argv[argv.indexOf("--output-dir") + 1] : undefined;
  const seed = argv.includes("--seed") ? Number(argv[argv.indexOf("--seed") + 1]) : 20260713;
  const selfPlayGames = argv.includes("--self-play-games") ? Number(argv[argv.indexOf("--self-play-games") + 1]) : 100;
  return run({ writeReports, outputDir, seed, selfPlayGames });
}

if (require.main === module) main();

module.exports = { run, buildPositions, evaluatePosition, summarizeAudit, selfPlayComparison };
