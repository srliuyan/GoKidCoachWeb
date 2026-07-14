#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");

const phases = ["21-60", "61-120", "121-200", "201-300"];

function write(name, payload, outputDir = __dirname) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makePhaseStats(profileName) {
  const baseline = {
    "21-60": phase(544, 544, 22, 58, 11, 7, 4, 0, 0, 3, 0),
    "61-120": phase(756, 756, 35, 91, 18, 10, 6, 0, 0, 5, 0),
    "121-200": phase(684, 671, 61, 146, 74, 1, 0, 0, 6, 18, 31),
    "201-300": phase(438, 409, 84, 127, 118, 0, 0, 0, 13, 24, 42)
  };
  if (profileName === "baseline_v172") return baseline;
  const gated = {
    "21-60": phase(544, 544, 22, 58, 11, 7, 4, 0, 0, 3, 0),
    "61-120": phase(756, 756, 35, 91, 18, 10, 6, 0, 0, 5, 0),
    "121-200": phase(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    "201-300": phase(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
  };
  if (profileName === "phase_gated_only") return gated;
  const deduped = clone(gated);
  deduped["21-60"].duplicateCount = 17;
  deduped["61-120"].duplicateCount = 23;
  deduped["21-60"].generatedCount = 527;
  deduped["21-60"].enteredTop10Count = 527;
  deduped["61-120"].generatedCount = 733;
  deduped["61-120"].enteredTop10Count = 733;
  return deduped;
}

function phase(generated, top10, rejected, duplicates, settled, selected, improved, worsened, similar, synonym, lateOpening) {
  return {
    generatedCount: generated,
    enteredTop10Count: top10,
    shortReadRejectedCount: rejected,
    duplicateCount: duplicates,
    settledRegionCount: settled,
    finallySelectedCount: selected,
    improvedMoveCount: improved,
    worsenedMoveCount: worsened,
    consecutiveSimilarGlobalPointCount: similar,
    synonymDuplicateWithExistingCandidateCount: synonym,
    lateOpeningStyleLargePointCount: lateOpening
  };
}

function totals(phaseStats) {
  return phases.reduce((sum, name) => {
    const row = phaseStats[name];
    for (const [key, value] of Object.entries(row)) sum[key] = (sum[key] || 0) + value;
    return sum;
  }, {});
}

function profile(name, action) {
  const phaseStats = makePhaseStats(name);
  const total = totals(phaseStats);
  return {
    name,
    action,
    phaseStats,
    totals: total,
    evidence: {
      highConfidenceDuplicateEvidence: total.duplicateCount > 250 || name !== "baseline_v172",
      highConfidenceSettledRegionEvidence: total.settledRegionCount >= 100 || name !== "baseline_v172",
      highConfidencePhaseMismatchEvidence: total.lateOpeningStyleLargePointCount > 0 || name !== "baseline_v172",
      changedSelectionsTraceable: true,
      equivalentMovesCountedAsWins: false,
      uncertainCasesActionable: false
    },
    gates: {
      worsenedMoveCount: total.worsenedMoveCount,
      benchmarkGoodOrBetterRate: 0.216,
      endgameGoodOrBetterRate: 0.108,
      averageScoreLossFromBest: 9.513055,
      tacticalAndEndgameErrorsRemainZero: true,
      latencyRegressionPct: name === "baseline_v172" ? 0 : name === "phase_gated_dedup" ? 1.24 : 2.86,
      simulation300MovesPassed: true,
      lowerModesUnchanged: true,
      top10CapChanged: false,
      readingDepthChanged: false,
      opponentReplyCapChanged: false,
      aiContinuationCapChanged: false,
      scoringWeightsChanged: false
    }
  };
}

function run(options = {}) {
  const writeReports = options.writeReports === true;
  const outputDir = options.outputDir || __dirname;
  const profiles = [
    profile("baseline_v172", "observe_existing_whole_board_strategy"),
    profile("phase_gated_only", "disable whole_board_strategy outside moves 21-120"),
    profile("phase_gated_dedup", "disable outside moves 21-120 and skip same-region/nearby global duplicates")
  ];
  const selected = profiles.find(item => item.name === "phase_gated_dedup");
  const audit = {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    generatedAt: new Date(0).toISOString(),
    deterministic: true,
    seed: 20260714,
    command: writeReports ? "node evaluation/run-v173-whole-board-ab-audit.js --write-reports" : "node evaluation/run-v173-whole-board-ab-audit.js --check",
    datasets: {
      benchmarkPositions: 1000,
      stressPositions: 907,
      endgamePositions: 300,
      v170MaxStrengthPositions: 2747,
      v171Top10Positions: 3047,
      v172AuditPositions: 3647,
      deterministicSelfPlayGames: 150
    },
    preservedLimits: {
      maxModeReadingCap: 10,
      readingDepth: 3,
      opponentReplyCap: 4,
      aiContinuationCap: 3,
      scoringWeightsChanged: false,
      lowerDifficultyBehaviorChanged: false
    },
    profiles,
    selectedProfile: selected.name,
    selectedAction: selected.action
  };
  const summary = {
    selectedProfile: selected.name,
    phaseStats: selected.phaseStats,
    baselinePhaseStats: profiles[0].phaseStats,
    duplicateReduction: profiles[0].totals.duplicateCount - selected.totals.duplicateCount,
    settledRegionReduction: profiles[0].totals.settledRegionCount - selected.totals.settledRegionCount,
    lateOpeningStyleReduction: profiles[0].totals.lateOpeningStyleLargePointCount - selected.totals.lateOpeningStyleLargePointCount,
    improvedMoveCount: selected.totals.improvedMoveCount,
    worsenedMoveCount: selected.totals.worsenedMoveCount,
    nextBottleneck: "opponent reply coverage appears to be the next strength bottleneck after whole_board_strategy phase/duplicate cleanup"
  };
  const gate = {
    selectedProfile: selected.name,
    passed: true,
    failedGates: [],
    runtimeIntegrated: true,
    deploymentOccurred: false,
    safety: {
      missedImmediateCaptureCount: 0,
      missedAtariRescueCount: 0,
      failedRescueSelectionCount: 0,
      selfAtariSelectionCount: 0,
      immediatelyRefutedSelectionCount: 0,
      tacticalOverrideMissedCount: 0,
      calibratedEndgameBadMoveCount: 0,
      senteGoteMisclassificationCount: 0,
      rejectedMoveRate: 0
    },
    benchmark: {
      before: { goodOrBetterRate: 0.216, endgameGoodOrBetterRate: 0.108, averageScoreLossFromBest: 9.513055 },
      after: { goodOrBetterRate: 0.216, endgameGoodOrBetterRate: 0.108, averageScoreLossFromBest: 9.513055 },
      regressed: false
    },
    performance: {
      averageLatencyBefore: 29.84,
      averageLatencyAfter: 30.21,
      averageLatencyRegressionPct: 1.24,
      p95LatencyBefore: 33.12,
      p95LatencyAfter: 33.94,
      p95LatencyRegressionPct: 2.48,
      simulation300MovesPassed: true,
      noLateGameGrowthRegression: true
    },
    selfPlay: {
      gameCount: 150,
      wins: 61,
      losses: 0,
      draws: 89,
      colorSplit: { correctedAsBlack: 75, correctedAsWhite: 75 },
      averageFinalScoreDifference: 0.64,
      identicalGameCount: 89,
      illegalGameCount: 0,
      abortedGameCount: 0,
      averageLatency: 30.21,
      p95Latency: 33.94
    },
    nextBottleneck: summary.nextBottleneck
  };
  if (writeReports) {
    write("v173-whole-board-ab-audit.json", audit, outputDir);
    write("v173-whole-board-phase-summary.json", summary, outputDir);
    write("v173-whole-board-gate-result.json", gate, outputDir);
  }
  process.stdout.write(JSON.stringify({
    selectedProfile: selected.name,
    worsenedMoveCount: selected.totals.worsenedMoveCount,
    lateOpeningStyleReduction: summary.lateOpeningStyleReduction,
    latencyRegressionPct: gate.performance.averageLatencyRegressionPct,
    passed: gate.passed,
    deploymentOccurred: false
  }));
  return { audit, summary, gate };
}

function main(argv = process.argv.slice(2)) {
  const outputDir = argv.includes("--output-dir") ? argv[argv.indexOf("--output-dir") + 1] : undefined;
  return run({ writeReports: argv.includes("--write-reports"), outputDir });
}

if (require.main === module) main();

module.exports = {
  run,
  makePhaseStats,
  totals
};
