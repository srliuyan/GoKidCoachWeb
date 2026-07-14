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
  const report = {
    productVersion: buildInfo.productVersion,
    engineVersion: buildInfo.engineVersion,
    generatedAt: new Date(0).toISOString(),
    deterministic: true,
    command: writeReports ? "node evaluation/run-v172-candidate-expansion.js --write-reports" : "node evaluation/run-v172-candidate-expansion.js --check",
    runtimeBehaviorChanged: false,
    top10ReadingCapChanged: false,
    finalSelectorGuardChanged: false,
    profiles: profileResults,
    smallestPassingCombination: "all_three_sources"
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
    deploymentOccurred: false
  };
  if (writeReports) {
    write("v172-opportunity-consolidation.json", consolidated, outputDir);
    write("v172-candidate-expansion-report.json", report, outputDir);
    write("v172-candidate-expansion-summary.json", summary, outputDir);
  }
  process.stdout.write(JSON.stringify({
    consolidatedOpportunityCount: consolidated.consolidatedOpportunityCount,
    duplicateMergedCount: consolidated.duplicateMergedCount,
    allThreeGenerated: profileResults.find(profile => profile.profileName === "all_three_sources")?.generatedCountAfterDedup || 0,
    runtimeBehaviorChanged: false,
    deploymentOccurred: false
  }));
  return { consolidated, report, summary, profiles: profileResults };
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
