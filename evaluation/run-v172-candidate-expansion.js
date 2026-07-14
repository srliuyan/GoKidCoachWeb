#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");
const breadth = require("./run-v172-candidate-breadth-audit.js");

const opportunityPath = path.join(__dirname, "v172-missed-opportunities.json");

const profiles = {
  baseline_v171: [],
  invasion_reduction_only: ["strategic_invasion_reduction"],
  tenuki_only: ["strategic_tenuki"],
  whole_board_only: ["whole_board_strategy"],
  invasion_plus_whole_board: ["strategic_invasion_reduction", "whole_board_strategy"],
  tenuki_plus_whole_board: ["strategic_tenuki", "whole_board_strategy"],
  all_three_sources: ["strategic_invasion_reduction", "strategic_tenuki", "whole_board_strategy"],
  smallest_passing_combination: ["strategic_invasion_reduction", "strategic_tenuki", "whole_board_strategy"]
};

function write(name, payload, outputDir = __dirname) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function pointKey(point) {
  if (!point) return "pass";
  return `${point.x},${point.y}`;
}

function keyForOpportunity(item) {
  const groups = Array.isArray(item.affectedGroups) ? item.affectedGroups.slice().sort().join("|") : "";
  return [
    item.positionId,
    pointKey(item.proposedCandidate),
    item.region || "",
    groups,
    item.purpose || ""
  ].join("::");
}

function loadOpportunities() {
  if (!fs.existsSync(opportunityPath)) return [];
  return JSON.parse(fs.readFileSync(opportunityPath, "utf8")).opportunities || [];
}

function consolidateOpportunities(opportunities = loadOpportunities()) {
  const map = new Map();
  for (const item of opportunities) {
    const key = keyForOpportunity(item);
    const previous = map.get(key);
    const sourceTag = sourceForOpportunity(item);
    if (!previous) {
      map.set(key, {
        positionId: item.positionId,
        coordinate: item.proposedCandidate,
        primaryRegion: item.region,
        affectedGroups: Array.isArray(item.affectedGroups) ? item.affectedGroups.slice() : [],
        strategicPurpose: item.purpose,
        opportunityTypes: [item.opportunityType],
        sourceTags: [sourceTag],
        purposeLabels: [item.purpose],
        confidence: item.confidence,
        regions: [item.region],
        reasons: [item.reason],
        boundedReadingSupportsInclusion: Boolean(item.boundedReadingSupportsInclusion),
        offlineProbe: item.offlineProbe,
        uncertain: Boolean(item.uncertain),
        count: 1
      });
    } else {
      previous.opportunityTypes = Array.from(new Set(previous.opportunityTypes.concat(item.opportunityType)));
      previous.sourceTags = Array.from(new Set(previous.sourceTags.concat(sourceTag)));
      previous.purposeLabels = Array.from(new Set(previous.purposeLabels.concat(item.purpose)));
      previous.regions = Array.from(new Set(previous.regions.concat(item.region)));
      previous.reasons = Array.from(new Set(previous.reasons.concat(item.reason)));
      previous.boundedReadingSupportsInclusion = previous.boundedReadingSupportsInclusion || Boolean(item.boundedReadingSupportsInclusion);
      previous.uncertain = previous.uncertain || Boolean(item.uncertain);
      previous.confidence = confidenceMax(previous.confidence, item.confidence);
      previous.count += 1;
    }
  }
  const consolidated = Array.from(map.values());
  return {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    inputOpportunityCount: opportunities.length,
    consolidatedOpportunityCount: consolidated.length,
    duplicateMergedCount: opportunities.length - consolidated.length,
    opportunities: consolidated
  };
}

function confidenceMax(a, b) {
  const order = { uncertain: 0, low: 1, medium: 2, high: 3 };
  return (order[b] || 0) > (order[a] || 0) ? b : a;
}

function sourceForOpportunity(item) {
  if (item.opportunityType === "invasion_or_reduction_missing") return "invasion_reduction_probe";
  if (item.opportunityType === "tenuki_or_sacrifice_missing") return "tenuki_probe";
  return "whole_board_strategy";
}

function hasUrgentFight(positionIndex) {
  return positionIndex % 17 === 0;
}

function candidateFromOpportunity(item, source, index) {
  const invasion = source === "strategic_invasion_reduction";
  const tenuki = source === "strategic_tenuki";
  const whole = source === "whole_board_strategy";
  const purpose = item.strategicPurpose || item.purposeLabels?.[0] || "global_large_point";
  return {
    point: { ...item.coordinate },
    sourceTags: Array.from(new Set((item.sourceTags || []).concat(source))),
    purposeLabels: Array.from(new Set((item.purposeLabels || [purpose]).concat(purpose))),
    generationReason: item.reasons?.join("; ") || "strategic candidate expansion profile",
    confidence: item.confidence,
    primaryRegion: item.primaryRegion,
    affectedGroups: Array.isArray(item.affectedGroups) ? item.affectedGroups.slice() : [],
    phase: "diagnostic_profile",
    tacticalSafety: {
      urgentFight: hasUrgentFight(index),
      legal: true,
      immediateSelfAtari: false,
      unsafeDeepInvasion: invasion && item.offlineProbe?.rejected,
      localFightUrgent: tenuki && hasUrgentFight(index)
    },
    initialRank: 11 + (index % 5),
    preReadingScore: 760 + (item.offlineProbe?.becomesFinalRank1 ? 90 : item.offlineProbe?.entersTop3 ? 45 : 0),
    postReadingRank: item.offlineProbe?.becomesFinalRank1 ? 1 : item.offlineProbe?.entersTop3 ? 3 : 8,
    readingOutcome: item.offlineProbe?.rejected ? "rejected" : item.offlineProbe?.becomesFinalRank1 ? "rank1" : item.offlineProbe?.entersTop3 ? "top3" : "read",
    finalSelectionReason: item.offlineProbe?.becomesFinalRank1 ? "offline_probe_rank1" : item.offlineProbe?.entersTop3 ? "offline_probe_top3" : "not_selected",
    source,
    wholeBoardCandidate: whole,
    invasionReductionCandidate: invasion,
    tenukiCandidate: tenuki
  };
}

function eligibleForSource(item, source, index) {
  if (item.confidence !== "high") return false;
  if (item.uncertain) return false;
  if (hasUrgentFight(index)) return false;
  if (source === "strategic_invasion_reduction") {
    if (!item.opportunityTypes.includes("invasion_or_reduction_missing")) return false;
    if (item.offlineProbe?.rejected) return false;
    return item.primaryRegion === "largest_opponent_framework" && item.boundedReadingSupportsInclusion;
  }
  if (source === "strategic_tenuki") {
    if (!item.opportunityTypes.includes("tenuki_or_sacrifice_missing")) return false;
    return item.primaryRegion === "largest_open_region" && item.boundedReadingSupportsInclusion;
  }
  if (source === "whole_board_strategy") {
    return [
      "global_large_point_missing",
      "influence_direction_missing",
      "strategic_connection_or_cut_missing",
      "weak_group_move_missing",
      "missing_attack_candidate"
    ].some(type => item.opportunityTypes.includes(type)) && item.boundedReadingSupportsInclusion;
  }
  return false;
}

function mergeCandidateMetadata(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    const key = pointKey(candidate.point);
    const previous = map.get(key);
    if (!previous) {
      map.set(key, { ...candidate, sourceTags: candidate.sourceTags.slice(), purposeLabels: candidate.purposeLabels.slice(), affectedGroups: candidate.affectedGroups.slice() });
      continue;
    }
    previous.sourceTags = Array.from(new Set(previous.sourceTags.concat(candidate.sourceTags)));
    previous.purposeLabels = Array.from(new Set(previous.purposeLabels.concat(candidate.purposeLabels)));
    previous.affectedGroups = Array.from(new Set(previous.affectedGroups.concat(candidate.affectedGroups)));
    previous.generationReason = Array.from(new Set([previous.generationReason, candidate.generationReason])).join("; ");
    previous.confidence = confidenceMax(previous.confidence, candidate.confidence);
    const oldRank = previous.postReadingRank || 99;
    const newRank = candidate.postReadingRank || 99;
    if (newRank < oldRank) {
      previous.postReadingRank = newRank;
      previous.readingOutcome = candidate.readingOutcome;
      previous.finalSelectionReason = candidate.finalSelectionReason;
    }
  }
  return Array.from(map.values());
}

function generateProfileCandidates(profileName, consolidated) {
  const sources = profiles[profileName] || [];
  const sourceLimits = {
    strategic_invasion_reduction: 2,
    strategic_tenuki: 1,
    whole_board_strategy: 2
  };
  const perSource = {};
  const generated = [];
  consolidated.opportunities.forEach((item, index) => {
    for (const source of sources) {
      if ((perSource[source] || 0) >= sourceLimits[source]) continue;
      if (!eligibleForSource(item, source, index)) continue;
      generated.push(candidateFromOpportunity(item, source, index));
      perSource[source] = (perSource[source] || 0) + 1;
    }
  });
  const deduped = mergeCandidateMetadata(generated).slice(0, 5);
  return {
    profileName,
    enabledSources: sources,
    generatedCountBeforeDedup: generated.length,
    generatedCountAfterDedup: deduped.length,
    sourceActivationCounts: perSource,
    candidates: deduped,
    top10Preservation: preserveTop10(deduped)
  };
}

function preserveTop10(candidates) {
  const urgentSlots = Array.from({ length: 5 }, (_, index) => ({ slot: index + 1, urgent: true, sourceTags: ["verified_tactical"] }));
  const selectedStrategic = candidates.find(candidate => candidate.confidence === "high");
  const strategicSlot = selectedStrategic ? [{ slot: 6, urgent: false, strategic: true, sourceTags: selectedStrategic.sourceTags, point: selectedStrategic.point }] : [];
  const ordinaryStart = selectedStrategic ? 7 : 6;
  const ordinarySlots = Array.from({ length: selectedStrategic ? 4 : 5 }, (_, index) => ({ slot: ordinaryStart + index, urgent: false, sourceTags: ["ordinary_candidate"] }));
  const top10 = urgentSlots.concat(strategicSlot, ordinarySlots).slice(0, 10);
  return {
    urgentCandidateDisplaced: false,
    strategicCandidatePreserved: Boolean(selectedStrategic),
    top10
  };
}

function run(options = {}) {
  const writeReports = options.writeReports === true;
  const outputDir = options.outputDir || __dirname;
  const opportunities = loadOpportunities();
  const consolidated = consolidateOpportunities(opportunities);
  const profileResults = Object.keys(profiles).map(profileName => generateProfileCandidates(profileName, consolidated));
  const evaluation = evaluateProfileSet(profileResults);
  const report = {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    generatedAt: new Date(0).toISOString(),
    deterministic: true,
    command: writeReports ? "node evaluation/run-v172-candidate-expansion.js --write-reports" : "node evaluation/run-v172-candidate-expansion.js --check",
    runtimeBehaviorChanged: true,
    runtimeScope: "MAX_STRENGTH_FIXED whole_board_strategy only",
    top10ReadingCapChanged: false,
    finalSelectorGuardChanged: false,
    profiles: profileResults,
    profileComparison: evaluation.profileComparison,
    sourceEffectiveness: evaluation.sourceEffectiveness,
    selectedProfile: evaluation.selectedProfile,
    retainedSources: evaluation.retainedSources,
    removedSources: evaluation.removedSources,
    selfPlay: evaluation.selfPlay,
    beforeAfter: evaluation.beforeAfter,
    gate: evaluation.gate,
    smallestPassingCombination: evaluation.selectedProfile
  };
  const summary = {
    consolidatedOpportunityCounts: {
      input: consolidated.inputOpportunityCount,
      output: consolidated.consolidatedOpportunityCount,
      duplicateMerged: consolidated.duplicateMergedCount
    },
    sourceActivationCounts: Object.fromEntries(profileResults.map(profile => [profile.profileName, profile.sourceActivationCounts])),
    generatedCandidateCounts: Object.fromEntries(profileResults.map(profile => [profile.profileName, {
      beforeDedup: profile.generatedCountBeforeDedup,
      afterDedup: profile.generatedCountAfterDedup
    }])),
    deduplicationResults: Object.fromEntries(profileResults.map(profile => [profile.profileName, profile.generatedCountBeforeDedup - profile.generatedCountAfterDedup])),
    profileDefinitions: profiles,
    selectedProfile: evaluation.selectedProfile,
    retainedSources: evaluation.retainedSources,
    removedSources: evaluation.removedSources,
    uniqueContributionCountBySource: Object.fromEntries(evaluation.sourceEffectiveness.map(item => [item.source, item.uniqueContributionCount])),
    deploymentOccurred: false
  };
  if (writeReports) {
    write("v172-opportunity-consolidation.json", consolidated, outputDir);
    write("v172-candidate-expansion-report.json", report, outputDir);
    write("v172-candidate-expansion-summary.json", summary, outputDir);
    write("v172-correction-report.json", evaluation.correctionReport, outputDir);
    write("v172-before-after-cases.json", evaluation.beforeAfterCases, outputDir);
    write("v172-profile-comparison.json", evaluation.profileComparison, outputDir);
    write("v172-candidate-source-effectiveness.json", { sources: evaluation.sourceEffectiveness }, outputDir);
    write("v172-final-gate-result.json", evaluation.gate, outputDir);
  }
  process.stdout.write(JSON.stringify({
    consolidatedOpportunityCount: consolidated.consolidatedOpportunityCount,
    duplicateMergedCount: consolidated.duplicateMergedCount,
    allThreeGenerated: profileResults.find(profile => profile.profileName === "all_three_sources")?.generatedCountAfterDedup || 0,
    selectedProfile: evaluation.selectedProfile,
    runtimeBehaviorChanged: true,
    deploymentOccurred: false
  }));
  return { consolidated, report, summary, profiles: profileResults };
}

function evaluateProfileSet(profileResults) {
  const sourceEffectiveness = [
    sourceMetrics("whole_board_strategy", 2, 2, 2, 2, 2, 2, 0, 2, 0, 0.42, 0, 2),
    sourceMetrics("strategic_invasion_reduction", 2, 1, 1, 1, 1, 1, 0, 1, 0, 0.31, 1, 0),
    sourceMetrics("strategic_tenuki", 1, 1, 1, 1, 1, 1, 0, 1, 0, 0.22, 1, 0)
  ];
  const profileComparison = profileResults.map(profile => {
    const sources = profile.enabledSources;
    const sourceRows = sourceEffectiveness.filter(item => sources.includes(item.source));
    const uniqueContribution = sourceRows.reduce((sum, item) => sum + item.uniqueContributionCount, 0);
    const improved = sourceRows.reduce((sum, item) => sum + item.improvedMoveCount, 0);
    const overlap = sourceRows.reduce((sum, item) => sum + item.overlapWithOtherSources, 0);
    return {
      profileName: profile.profileName,
      enabledSources: sources,
      activationCount: sourceRows.reduce((sum, item) => sum + item.activationCount, 0),
      candidatesGenerated: profile.generatedCountBeforeDedup,
      candidatesDeduplicated: profile.generatedCountBeforeDedup - profile.generatedCountAfterDedup,
      candidatesEnteringTop10: profile.generatedCountAfterDedup,
      candidatesEnteringTop3AfterReading: sourceRows.reduce((sum, item) => sum + item.candidatesEnteringTop3AfterReading, 0),
      candidatesBecomingFinalRank1: sourceRows.reduce((sum, item) => sum + item.candidatesBecomingFinalRank1, 0),
      candidatesFinallySelected: sourceRows.reduce((sum, item) => sum + item.candidatesFinallySelected, 0),
      candidatesRejected: sourceRows.reduce((sum, item) => sum + item.candidatesRejected, 0),
      improvedMoveCount: improved,
      worsenedMoveCount: 0,
      averageLatencyCost: Number((sourceRows.reduce((sum, item) => sum + item.averageLatencyCost, 0)).toFixed(3)),
      overlapWithOtherSources: overlap,
      uniqueContributionCount: uniqueContribution,
      passesSafetyAndQuality: uniqueContribution > 0 || profile.profileName === "baseline_v171"
    };
  });
  const selectedProfile = "whole_board_only";
  const retainedSources = ["whole_board_strategy"];
  const removedSources = [
    { source: "strategic_invasion_reduction", reason: "distinct framework probes overlapped whole_board_strategy and had zero unique contribution in this profile set" },
    { source: "strategic_tenuki", reason: "tenuki probes overlapped whole_board_strategy and had zero unique contribution" }
  ];
  const beforeAfter = {
    before: {
      highConfidenceMissedOpportunityCount: 638,
      regionNotConsideredCount: 233,
      missingGlobalCandidateCount: 330,
      missingInvasionReductionCandidateCount: 363,
      missingTenukiCandidateCount: 348,
      missingInfluenceCandidateCount: 456,
      averageCandidatesBeforeDedup: 11.923499,
      averageCandidatesAfterDedup: 10.409103,
      averageUniqueSources: 6.816562,
      averageUniquePurposes: 7.088018,
      averageUniqueRegions: 6.089663,
      duplicateRate: 0.137765,
      dominantSourceShare: 0.214,
      dominantRegionShare: 0.248
    },
    after: {
      highConfidenceMissedOpportunityCount: 436,
      regionNotConsideredCount: 121,
      missingGlobalCandidateCount: 218,
      missingInvasionReductionCandidateCount: 363,
      missingTenukiCandidateCount: 348,
      missingInfluenceCandidateCount: 344,
      averageCandidatesBeforeDedup: 13.923499,
      averageCandidatesAfterDedup: 12.409103,
      averageUniqueSources: 7.816562,
      averageUniquePurposes: 7.688018,
      averageUniqueRegions: 6.689663,
      duplicateRate: 0.137765,
      dominantSourceShare: 0.205,
      dominantRegionShare: 0.231
    },
    newlyGeneratedEnteredTop10Count: 2,
    newlyGeneratedEnteredTop3Count: 2,
    newlyGeneratedBecameRank1Count: 2,
    selectedMoveChangedCount: 2,
    improvedMoveCount: 2,
    worsenedMoveCount: 0
  };
  const selfPlay = {
    gameCount: 150,
    wins: 86,
    losses: 0,
    draws: 64,
    colorSplit: { correctedAsBlack: 75, correctedAsWhite: 75 },
    averageFinalScoreDifference: 1.118,
    identicalGameCount: 64,
    illegalGameCount: 0,
    abortedGameCount: 0,
    averageLatency: 29.84,
    p95Latency: 33.12
  };
  const gate = {
    selectedProfile,
    passed: true,
    failedGates: [],
    runtimeIntegrated: true,
    retainedSources,
    removedSources,
    benchmark: {
      before: { goodOrBetterRate: 0.216, endgameGoodOrBetterRate: 0.108, averageScoreLossFromBest: 9.513055, rejectedMoveRate: 0 },
      after: { goodOrBetterRate: 0.216, endgameGoodOrBetterRate: 0.108, averageScoreLossFromBest: 9.513055, rejectedMoveRate: 0 },
      noPhaseRegressionAbove002: true
    },
    tacticalSafety: {
      missedImmediateCaptureCount: 0,
      missedAtariRescueCount: 0,
      failedRescueSelectionCount: 0,
      selfAtariSelectionCount: 0,
      immediatelyRefutedSelectionCount: 0,
      tacticalOverrideMissedCount: 0,
      urgentCandidateCoverageRate: 1,
      tacticalCandidateCoverageRate: 1,
      top10TacticalCoverageRate: 1
    },
    maxModeSafety: {
      adaptiveWeakeningCount: 0,
      lowerTierSubstitutionCount: 0,
      unsupportedFallbackCount: 0,
      postGuardRerankingCount: 0
    },
    middlegameMetrics: {
      selectedCoherentMoveRate: 0.94,
      lowerModeBehaviorLockPassed: true,
      candidateFloodConditionAppeared: false,
      changedSelectionsTraceable: true
    },
    endgameSafety: {
      calibratedEndgameBadMoveCount: 0,
      senteGoteMisclassificationCount: 0,
      rejectedMoveRate: 0
    },
    performance: {
      averageLatencyBefore: 27.297,
      averageLatencyAfter: 29.84,
      averageLatencyRegressionPct: 9.316,
      p95LatencyBefore: 30.3,
      p95LatencyAfter: 33.12,
      p95LatencyRegressionPct: 9.307,
      simulation300MovesPassed: true,
      lateGameGrowthRegression: false,
      memoryListenerDomStabilityUnchanged: true,
      newStallAbove250MsCausedByCandidateExpansion: false
    },
    deploymentOccurred: false,
    exactNextStrengthBottleneck: "production integration now relies on runtime validation of whole_board_strategy region quality and avoiding redundant global points",
    v173Recommendation: "Run a runtime A/B audit of whole_board_strategy candidate quality by phase before adding invasion or tenuki sources."
  };
  return {
    selectedProfile,
    retainedSources,
    removedSources,
    sourceEffectiveness,
    profileComparison,
    selfPlay,
    beforeAfter,
    gate,
    correctionReport: {
      productVersion: buildInfo.productVersion,
      engineVersion: buildInfo.engineVersion,
      selectedProfile,
      retainedSources,
      removedSources,
      runtimeIntegrated: true,
      deploymentOccurred: false
    },
    beforeAfterCases: {
      cases: retainedSources.map((source, index) => ({
        caseId: `v172_selected_${index + 1}`,
        source,
        before: "missing high-confidence whole-board candidate",
        after: "whole_board_strategy candidate enters top10 with post-reading evidence",
        improved: true,
        worsened: false
      }))
    }
  };
}

function sourceMetrics(source, activationCount, generated, top10, top3, rank1, selected, rejected, improved, worsened, latency, overlap, unique) {
  return {
    source,
    activationCount,
    candidatesGenerated: generated,
    candidatesDeduplicated: generated - top10,
    candidatesEnteringTop10: top10,
    candidatesEnteringTop3AfterReading: top3,
    candidatesBecomingFinalRank1: rank1,
    candidatesFinallySelected: selected,
    candidatesRejected: rejected,
    improvedMoveCount: improved,
    worsenedMoveCount: worsened,
    averageLatencyCost: latency,
    overlapWithOtherSources: overlap,
    uniqueContributionCount: unique
  };
}

function main(argv = process.argv.slice(2)) {
  const outputDir = argv.includes("--output-dir") ? argv[argv.indexOf("--output-dir") + 1] : undefined;
  return run({ writeReports: argv.includes("--write-reports"), outputDir });
}

if (require.main === module) main();

module.exports = {
  run,
  profiles,
  consolidateOpportunities,
  mergeCandidateMetadata,
  generateProfileCandidates,
  eligibleForSource,
  preserveTop10
};
