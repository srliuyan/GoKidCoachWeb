const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const configPath = path.join(__dirname, "evaluation", "benchmark-config.json");
const reportPath = path.join(__dirname, "evaluation", "benchmark-report.json");
const ablationPath = path.join(__dirname, "evaluation", "ablation-report.json");
const tacticalConflictPath = path.join(__dirname, "evaluation", "tactical-conflict-cases.json");
const endgameValueCasesPath = path.join(__dirname, "evaluation", "endgame-value-cases.json");
const endgameValueReportPath = path.join(__dirname, "evaluation", "endgame-value-report.json");
const endgameLabelAuditPath = path.join(__dirname, "evaluation", "endgame-label-audit.json");
const endgameLabelValidationPath = path.join(__dirname, "evaluation", "endgame-label-validation.json");
const endgameLabelConsistencyPath = path.join(__dirname, "evaluation", "endgame-label-consistency-report.json");
const endgameCandidateCoverageAuditPath = path.join(__dirname, "evaluation", "endgame-candidate-coverage-audit.json");
const endgameCandidateExpandedPath = path.join(__dirname, "evaluation", "endgame-candidate-expanded.json");
const endgameRankingErrorsPath = path.join(__dirname, "evaluation", "endgame-ranking-errors.json");
const endgameSourceAttributionPath = path.join(__dirname, "evaluation", "endgame-source-attribution.json");
const endgamePairwiseReportPath = path.join(__dirname, "evaluation", "endgame-pairwise-report.json");
const endgameScoreScaleReportPath = path.join(__dirname, "evaluation", "endgame-score-scale-report.json");
const endgameErrorSummaryPath = path.join(__dirname, "evaluation", "endgame-error-summary.json");
const positionScoreErrorComponentsPath = path.join(__dirname, "evaluation", "position-score-error-components.json");
const positionScoreGatingReportPath = path.join(__dirname, "evaluation", "position-score-gating-report.json");
const finalScorePipelineAuditPath = path.join(__dirname, "evaluation", "final-score-pipeline-audit.json");
const urgentOverrideCasesPath = path.join(__dirname, "evaluation", "urgent-override-cases.json");
const urgentOverrideReplayPath = path.join(__dirname, "evaluation", "urgent-override-replay.json");
const finalScoreOverrideReportPath = path.join(__dirname, "evaluation", "final-score-override-report.json");
const rawUrgentSourceAuditPath = path.join(__dirname, "evaluation", "raw-urgent-source-audit.json");
const rawUrgentSourceReportPath = path.join(__dirname, "evaluation", "raw-urgent-source-report.json");
const shallowTacticalVerificationReportPath = path.join(__dirname, "evaluation", "shallow-tactical-verification-report.json");
const localReadingProfileReportPath = path.join(__dirname, "evaluation", "local-reading-profile-report.json");
const localReadingSelectionDiffPath = path.join(__dirname, "evaluation", "local-reading-selection-diff.json");
const localReadingErrorCasesPath = path.join(__dirname, "evaluation", "local-reading-error-cases.json");
const localReadingLatencyReportPath = path.join(__dirname, "evaluation", "local-reading-latency-report.json");
const localReadingGateResultPath = path.join(__dirname, "evaluation", "local-reading-gate-result.json");
const localReadingEffectivenessTracePath = path.join(__dirname, "evaluation", "local-reading-effectiveness-trace.json");
const localReadingOpportunityCoveragePath = path.join(__dirname, "evaluation", "local-reading-opportunity-coverage.json");
const localReadingTerminalClassificationPath = path.join(__dirname, "evaluation", "local-reading-terminal-classification-report.json");
const localReadingBridgePath = path.join(__dirname, "evaluation", "run-local-reading-profile.js");
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const swSource = fs.readFileSync(path.join(__dirname, "sw.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
const qualityTiers = ["best", "strong", "good", "acceptable", "weak", "rejected"];

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function numeric(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compareBenchmark(current, baseline) {
  if (!baseline) {
    return { status: "WARN", reasons: ["No baseline available"], baselineFound: false };
  }
  const reasons = [];
  const warnings = [];
  const currentQuality = current.qualityMetrics || {};
  const baselineQuality = baseline.qualityMetrics || {};
  const currentPhase = current.phaseMetrics || {};
  const baselinePhase = baseline.phaseMetrics || {};
  const rejectedDelta = numeric(currentQuality.rejectedMoveRate) - numeric(baselineQuality.rejectedMoveRate);
  const goodDelta = numeric(currentQuality.goodOrBetterRate) - numeric(baselineQuality.goodOrBetterRate);
  const currentLoss = numeric(currentQuality.averageScoreLossFromBest);
  const baselineLoss = numeric(baselineQuality.averageScoreLossFromBest);
  const currentLatency = numeric(currentQuality.averageLatencyMs);
  const baselineLatency = numeric(baselineQuality.averageLatencyMs);

  if (rejectedDelta > 0) reasons.push("rejectedMoveRate increased");
  if (goodDelta < -0.02) reasons.push("goodOrBetterRate dropped");
  if (baselineLoss > 0 && currentLoss > baselineLoss * 1.05) reasons.push("averageScoreLossFromBest worsened");
  for (const phase of ["opening", "fuseki", "middlegame", "endgame"]) {
    const delta = numeric(currentPhase[phase]?.goodOrBetterRate) - numeric(baselinePhase[phase]?.goodOrBetterRate);
    if (delta < -0.04) reasons.push(`${phase} goodOrBetterRate dropped`);
  }
  if (baselineLatency > 0 && currentLatency > baselineLatency * 1.25) reasons.push("average latency increased");
  if (!reasons.length && (goodDelta < 0 || currentLoss > baselineLoss || currentLatency > baselineLatency)) {
    warnings.push("minor drift");
  }
  return {
    status: reasons.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
    reasons: reasons.length ? reasons : warnings.length ? warnings : ["No regression threshold triggered"],
    baselineFound: true
  };
}

function testDeterministicSamplingMetadata() {
  const config = loadJson(configPath);
  const report = loadJson(reportPath);
  assert.strictEqual(config.seed, report.randomSeed);
  assert.strictEqual(report.randomSeed, 20260710);
  assert.deepStrictEqual(Object.keys(report.positionsRequested), ["opening", "fuseki", "middlegame", "endgame"]);
  assert.strictEqual(report.evaluationVersion, "1.1");
}

function testMinimumBenchmarkSizeHandling() {
  const config = loadJson(configPath);
  const report = loadJson(reportPath);
  assert.strictEqual(config.samplesPerPhase, 250);
  assert.strictEqual(config.minimumPositions, 1000);
  assert(report.positionsRequestedTotal >= 1000);
  assert(report.positionsEvaluated >= Math.min(1000, report.records.length));
  assert.strictEqual(report.positionsEvaluated, report.records.length);
  assert.strictEqual(typeof report.skippedPositions, "number");
  assert.strictEqual(typeof report.skipReasons, "object");
}

function testQualityTierClassification() {
  const report = loadJson(reportPath);
  assert(report.records.length > 0);
  for (const record of report.records) {
    assert(qualityTiers.includes(record.aiMoveQualityTier));
    assert(qualityTiers.includes(record.sgfMoveQualityTier));
    assert.strictEqual(typeof record.aiMoveScore, "number");
    assert.strictEqual(typeof record.bestCandidateScore, "number");
    assert.strictEqual(typeof record.scoreLossFromBest, "number");
  }
}

function testTopKCalculations() {
  const report = loadJson(reportPath);
  for (const record of report.records) {
    assert.strictEqual(record.exactMatch, record.sgfMove === record.aiTop1);
    assert.strictEqual(record.top3Match, record.aiTop3.includes(record.sgfMove));
    assert.strictEqual(record.top5Match, record.aiTop5.includes(record.sgfMove));
    assert(record.aiTop3.length <= 3);
    assert(record.aiTop5.length <= 5);
  }
}

function testRejectedMoveDetection() {
  const report = loadJson(reportPath);
  for (const record of report.records) {
    assert.strictEqual(typeof record.rejectedMove, "boolean");
    assert.strictEqual(record.rejectedMove, record.sgfMoveQualityTier === "rejected");
  }
  assert.strictEqual(typeof report.qualityMetrics.rejectedMoveRate, "number");
}

function testPerPhaseMetrics() {
  const report = loadJson(reportPath);
  for (const phase of ["opening", "fuseki", "middlegame", "endgame"]) {
    const metrics = report.phaseMetrics[phase];
    assert(metrics);
    assert.strictEqual(typeof metrics.exactMatchRate, "number");
    assert.strictEqual(typeof metrics.top3MatchRate, "number");
    assert.strictEqual(typeof metrics.top5MatchRate, "number");
    assert.strictEqual(typeof metrics.goodOrBetterRate, "number");
  }
}

function testSourceDiagnostics() {
  const report = loadJson(reportPath);
  const diagnostics = report.sourceDiagnostics;
  assert(diagnostics.sources.patternHit);
  assert(diagnostics.sources.shapeHit);
  assert(diagnostics.sources.fusekiHit);
  assert(diagnostics.sources.tacticalHit);
  assert(diagnostics.sources.josekiHit);
  assert(diagnostics.sources.endgameHit);
  assert.strictEqual(typeof diagnostics.conflictingSourceFrequency, "number");
  assert.strictEqual(typeof diagnostics.lowConfidenceFrequency, "number");
  assert.strictEqual(typeof diagnostics.sourceMostAssociatedWithWeakMoves, "string");
}

function testBaselineComparison() {
  const report = loadJson(reportPath);
  assert(["PASS", "WARN", "FAIL"].includes(report.regressionComparison.status));
  const pass = compareBenchmark(report, JSON.parse(JSON.stringify(report)));
  assert.strictEqual(pass.status, "PASS");
}

function testRegressionStatusRules() {
  const baseline = loadJson(reportPath);
  const current = JSON.parse(JSON.stringify(baseline));
  current.qualityMetrics.goodOrBetterRate = Math.max(0, baseline.qualityMetrics.goodOrBetterRate - 0.03);
  const fail = compareBenchmark(current, baseline);
  assert.strictEqual(fail.status, "FAIL");

  const warnCurrent = JSON.parse(JSON.stringify(baseline));
  warnCurrent.qualityMetrics.goodOrBetterRate = Math.max(0, baseline.qualityMetrics.goodOrBetterRate - 0.01);
  const warn = compareBenchmark(warnCurrent, baseline);
  assert.strictEqual(warn.status, "WARN");
}

function testMissingBaselineGracefulFallback() {
  const comparison = compareBenchmark(loadJson(reportPath), null);
  assert.strictEqual(comparison.status, "WARN");
  assert.strictEqual(comparison.baselineFound, false);
}

function testJsonOutputBrowserReadable() {
  const tempPath = path.join(os.tmpdir(), `gokidcoach-report-${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(loadJson(reportPath)));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(tempPath, "utf8")));
  assert(!indexHtml.includes("evaluation/benchmark-config.json"));
  assert(!indexHtml.includes("evaluation/benchmark-report.json"));
  assert(!swSource.includes("evaluation/benchmark-config.json"));
  assert(!swSource.includes("evaluation/benchmark-report.json"));
}

function testDeterministicAblationResults() {
  if (!fs.existsSync(ablationPath)) return;
  const report = loadJson(ablationPath);
  assert.strictEqual(report.randomSeed, 20260710);
  assert(report.profiles.full_current);
  assert(report.profiles.baseline_reverted);
  assert.deepStrictEqual(
    Object.keys(report.profiles),
    loadJson(configPath).ablationProfiles
  );
  assert.strictEqual(report.profiles.full_current.positionsEvaluated, 1000);
}

function testWinningProfileSelectionThresholds() {
  if (!fs.existsSync(ablationPath)) return;
  const report = loadJson(ablationPath);
  for (const [name, profile] of Object.entries(report.profiles)) {
    if (!profile.acceptedCandidate) continue;
    assert(profile.endgameGoodOrBetterRate > 0.108, name);
    assert(profile.goodOrBetterRate >= 0.216, name);
    assert.strictEqual(profile.rejectedMoveRate, 0);
    assert(profile.conflictingSourceFrequency <= 0.2, name);
    const protectedCases = profile.focusedCaseMetrics?.protectedTacticalCases || {};
    assert.strictEqual(protectedCases.necessaryConnectionRegressionCount || 0, 0, name);
    assert.strictEqual(protectedCases.realSenteRegressionCount || 0, 0, name);
    assert.strictEqual(protectedCases.urgentCaptureRegressionCount || 0, 0, name);
  }
}

function testNarrowCapProfilesPresent() {
  if (!fs.existsSync(ablationPath)) return;
  const report = loadJson(ablationPath);
  for (const name of [
    "baseline_reverted",
    "local_cap_10",
    "local_cap_20",
    "local_cap_30",
    "local_cap_ratio_075",
    "local_cap_ratio_050",
    "local_cap_confidence_gated",
    "local_cap_endgame_only",
    "local_cap_late_midgame_and_endgame"
  ]) {
    assert(report.profiles[name], name);
    assert.strictEqual(typeof report.profiles[name].focusedCaseMetrics.localGainCases.correctedCaseCount, "number");
    assert.strictEqual(typeof report.profiles[name].focusedCaseMetrics.protectedTacticalCases.necessaryConnectionRegressionCount, "number");
  }
}

function testEvaluationOnlyProfilesDoNotAlterRuntime() {
  const config = loadJson(configPath);
  assert.strictEqual(config.offlineOnly, true);
  assert.strictEqual(config.browserRuntimeAffected, false);
}

function testEndgameValueAnalysisOutputsReadable() {
  if (!fs.existsSync(endgameValueCasesPath) || !fs.existsSync(endgameValueReportPath)) return;
  const cases = loadJson(endgameValueCasesPath);
  const report = loadJson(endgameValueReportPath);
  assert.strictEqual(cases.offlineOnly, true);
  assert.strictEqual(cases.browserRuntimeAffected, false);
  assert(cases.caseCount > 0);
  assert(cases.categoryDistribution);
  for (const item of cases.cases.slice(0, 5)) {
    assert.strictEqual(typeof item.anonymizedPositionId, "string");
    assert.strictEqual(typeof item.sourceGameIdHash, "string");
    assert.strictEqual(typeof item.currentEndgameScore, "number");
    assert.strictEqual(typeof item.candidateRank, "number");
  }
  assert(report.profiles.baseline_value_estimation);
  const profileNames = Object.keys(report.profiles);
  assert(profileNames.includes("baseline_value_estimation"));
  for (const name of profileNames) {
    assert(report.profiles[name], name);
    assert.strictEqual(typeof report.profiles[name].endgame.dameSelectionRate, "number");
    assert.strictEqual(typeof report.profiles[name].endgame.necessaryConnectionMissRate, "number");
    assert.strictEqual(typeof report.profiles[name].endgame.urgentTacticalDenominator, "number");
  }
}

function testEndgameValueProfilesDeterministicSeed() {
  if (!fs.existsSync(endgameValueReportPath)) return;
  const report = loadJson(endgameValueReportPath);
  assert.strictEqual(report.randomSeed, 20260710);
  assert.strictEqual(report.offlineOnly, true);
  assert.strictEqual(report.browserRuntimeAffected, false);
}

function testEndgameLabelReportsReadable() {
  if (!fs.existsSync(endgameLabelAuditPath) || !fs.existsSync(endgameLabelValidationPath) || !fs.existsSync(endgameLabelConsistencyPath)) return;
  const audit = loadJson(endgameLabelAuditPath);
  const validation = loadJson(endgameLabelValidationPath);
  const consistency = loadJson(endgameLabelConsistencyPath);
  assert.strictEqual(audit.offlineOnly, true);
  assert.strictEqual(validation.randomSeed, 20260710);
  assert.strictEqual(consistency.consistencyFailureCount, 0);
  assert.strictEqual(consistency.overlapViolations, 0);
  for (const label of ["captureOrRescue", "necessaryConnection", "senteYose", "largeGote", "smallTerritoryGain", "dame", "redundantReinforcement", "uncertain"]) {
    assert.strictEqual(typeof consistency.labelCounts[label], "number", label);
    assert(audit.findings.some(item => item.category === label), label);
  }
  for (const item of validation.samples.slice(0, 10)) {
    assert.strictEqual(typeof item.primaryLabel, "string");
    assert(Array.isArray(item.secondaryLabels));
    assert(item.confidence >= 0 && item.confidence <= 1);
    assert(item.evidence);
  }
}

function testPrimaryLabelsMutuallyExclusiveAndEvidenceBased() {
  if (!fs.existsSync(endgameValueCasesPath)) return;
  const cases = loadJson(endgameValueCasesPath);
  for (const item of cases.cases.slice(0, 200)) {
    assert.strictEqual(typeof item.primaryLabel, "string");
    assert(!item.secondaryLabels.includes(item.primaryLabel));
    assert(item.labelConfidence >= 0 && item.labelConfidence <= 1);
    assert.notStrictEqual(item.primaryLabel, item.candidateQualityTier);
    assert.notStrictEqual(String(item.primaryLabel), String(item.candidateRank));
    const e = item.labelEvidence;
    if (item.primaryLabel === "captureOrRescue") {
      assert(e.immediateCaptureCount > 0 || e.preventsImmediateCapture || e.stonesSavedEstimate > 0);
    }
    if (item.primaryLabel === "necessaryConnection") {
      assert(e.groupsConnectedCount >= 2);
      assert.strictEqual(e.connectedGroupsAlreadySafe, false);
    }
    if (item.primaryLabel === "largeGote") {
      assert(e.localTerritoryDelta >= 14 || e.edgeOrCornerBoundaryCompletion >= 18);
    }
    if (item.primaryLabel === "dame") {
      assert(e.noMeaningfulTerritoryChange);
      assert(e.noMeaningfulLibertyChange);
    }
    if (item.primaryLabel === "redundantReinforcement") {
      assert(e.targetGroupStableBefore);
    }
  }
}

function testEndgameCandidateExpansionCoverage() {
  if (!fs.existsSync(endgameCandidateExpandedPath) || !fs.existsSync(endgameCandidateCoverageAuditPath)) return;
  const expanded = loadJson(endgameCandidateExpandedPath);
  const audit = loadJson(endgameCandidateCoverageAuditPath);
  const report = loadJson(reportPath);
  assert.strictEqual(expanded.offlineOnly, true);
  assert.strictEqual(expanded.browserRuntimeAffected, false);
  assert.strictEqual(expanded.randomSeed, 20260710);
  assert(expanded.caseCount >= 10000);
  assert(expanded.averageCandidatesPerPosition >= 12);
  assert.strictEqual(audit.positionsInspected, expanded.positionsAnalyzed);
  assert(audit.averageLegalCandidatesPerPosition >= audit.averageCandidatesRetainedPerPosition);

  for (const origin of ["sgf", "aiTop", "sourceTop", "midRankSample", "lowRankSample", "neutralProbe", "reinforcementProbe", "connectionProbe", "boundaryProbe", "senteProbe", "pass"]) {
    assert(expanded.candidateOriginDistribution[origin] > 0, origin);
  }
  assert(expanded.categoryDistribution.senteYose >= 25);
  assert(expanded.categoryDistribution.dame >= 25);
  assert(expanded.categoryDistribution.redundantReinforcement >= 25);
  assert(expanded.categoryDistribution.uncertain >= 25);
  assert(Object.values(expanded.categoryShortages).length === 0);

  assert(expanded.cases.some(item => item.candidateOrigin === "sgf" && item.exactSgfMatch));
  assert(expanded.cases.some(item => item.candidateOrigin === "midRankSample" && item.candidateRank > 5));
  assert(expanded.cases.some(item => item.candidateOrigin === "lowRankSample" && item.candidateRank > 5));
  assert(expanded.cases.every(item => item.legalStatus === "legal"));
  assert(expanded.cases.every(item => item.ruleSafetyStatus !== "rejected_playable"));
  assert(expanded.cases.some(item => item.candidateOrigin === "pass" && item.offlineOnly));

  const dameProbe = expanded.cases.find(item => item.candidateOrigin === "neutralProbe" && item.primaryLabel === "dame");
  assert(dameProbe);
  assert(dameProbe.labelEvidence.neutralAdjacency);
  assert(dameProbe.labelEvidence.noMeaningfulTerritoryChange);
  const reinforcementProbe = expanded.cases.find(item => item.candidateOrigin === "reinforcementProbe" && item.primaryLabel === "redundantReinforcement");
  assert(reinforcementProbe);
  assert(reinforcementProbe.labelEvidence.targetGroupStableBefore);
  const senteProbe = expanded.cases.find(item => item.candidateOrigin === "senteProbe" && item.primaryLabel === "senteYose");
  assert(senteProbe);
  assert(senteProbe.labelEvidence.responseUrgency >= 0.45);

  for (const item of expanded.cases.slice(0, 500)) {
    assert(!item.secondaryLabels.includes(item.primaryLabel));
    assert.strictEqual(item.labelDependsOnCandidateOrigin, false);
    assert.strictEqual(item.labelDependsOnCandidateRank, false);
    assert.strictEqual(item.labelDependsOnQualityTier, false);
    assert.notStrictEqual(item.primaryLabel, item.candidateOrigin);
    assert.notStrictEqual(String(item.primaryLabel), String(item.candidateRank));
    assert.notStrictEqual(item.primaryLabel, item.candidateQualityTier);
  }

  for (const key of ["necessaryConnectionDenominator", "urgentTacticalDenominator", "senteYoseDenominator", "dameOpportunityDenominator", "redundantReinforcementOpportunityDenominator"]) {
    assert(expanded.metricDenominators[key].totalEligibleCases > 0, key);
    assert(expanded.metricDenominators[key].highConfidenceEligibleCases > 0, key);
    assert.strictEqual(typeof expanded.metricDenominators[key].excludedLowConfidenceCount, "number");
  }
  assert.strictEqual(report.qualityMetrics.exactMatchRate, 0.149);
  assert.strictEqual(report.qualityMetrics.goodOrBetterRate, 0.216);
  assert.strictEqual(report.phaseMetrics.endgame.goodOrBetterRate, 0.108);
  assert.strictEqual(report.qualityMetrics.averageScoreLossFromBest, 9.513055);
  assert.strictEqual(report.sourceDiagnostics.conflictingSourceFrequency, 0.2);
  assert.strictEqual(report.qualityMetrics.rejectedMoveRate, 0);
}

function testEndgameRankingAuditReports() {
  if (
    !fs.existsSync(endgameRankingErrorsPath) ||
    !fs.existsSync(endgameSourceAttributionPath) ||
    !fs.existsSync(endgamePairwiseReportPath) ||
    !fs.existsSync(endgameScoreScaleReportPath) ||
    !fs.existsSync(endgameErrorSummaryPath)
  ) return;
  const ranking = loadJson(endgameRankingErrorsPath);
  const source = loadJson(endgameSourceAttributionPath);
  const pairwise = loadJson(endgamePairwiseReportPath);
  const scale = loadJson(endgameScoreScaleReportPath);
  const summary = loadJson(endgameErrorSummaryPath);
  const benchmark = loadJson(reportPath);

  assert.strictEqual(ranking.randomSeed, 20260710);
  assert.strictEqual(ranking.offlineOnly, true);
  assert.strictEqual(ranking.browserRuntimeAffected, false);
  assert.strictEqual(ranking.positionCount, 250);
  assert.strictEqual(ranking.candidateRecordCount, 13653);
  assert.strictEqual(ranking.clearRankingErrorCount, summary.totalClearErrors);
  assert.strictEqual(summary.totalPositions, ranking.positionCount);

  const clearErrors = ranking.records.filter(item => item.isClearError);
  assert.strictEqual(clearErrors.length, ranking.clearRankingErrorCount);
  assert(ranking.records.some(item => ["correctUrgentChoice", "correctSenteChoice", "correctLargeYoseChoice", "equivalentMeaningfulChoice", "noClearError"].includes(item.rankingErrorType)));
  assert(!ranking.records.some(item => item.rankingErrorType === "uncertainEvaluation" && item.isClearError));

  for (const item of clearErrors) {
    assert.notStrictEqual(item.rankingErrorType, "equivalentMeaningfulChoice");
    assert.notStrictEqual(item.rankingErrorType, "noClearError");
    assert(item.bestEvidenceCandidates.length >= 1);
    assert(item.equivalentBestCandidates.length >= 1);
    assert.strictEqual(typeof item.selectedCandidateScoreBreakdown.finalCombinedScore, "number");
    assert.strictEqual(typeof item.betterCandidateScoreBreakdown.finalCombinedScore, "number");
    assert.notStrictEqual(item.rankingErrorType, item.aiSelectedMove);
  }

  const dameErrors = clearErrors.filter(item => item.rankingErrorType === "choseDameWithMeaningfulAlternative");
  for (const item of dameErrors) {
    assert.strictEqual(item.aiSelectedPrimaryLabel, "dame");
    assert(item.meaningfulYoseCandidateSet.length > 0);
  }
  const redundantErrors = clearErrors.filter(item => item.rankingErrorType === "choseRedundantReinforcementWithMeaningfulAlternative");
  for (const item of redundantErrors) {
    assert.strictEqual(item.aiSelectedPrimaryLabel, "redundantReinforcement");
    assert(item.meaningfulYoseCandidateSet.length > 0);
  }
  const urgentMisses = clearErrors.filter(item => item.rankingErrorType === "missedCaptureOrRescue");
  for (const item of urgentMisses) {
    assert(item.protectedUrgentCandidateSet.some(candidate => candidate.primaryLabel === "captureOrRescue"));
  }
  const connectionMisses = clearErrors.filter(item => item.rankingErrorType === "missedNecessaryConnection");
  for (const item of connectionMisses) {
    assert(item.protectedUrgentCandidateSet.some(candidate => candidate.primaryLabel === "necessaryConnection" && candidate.confidence >= 0.7));
  }

  const matrixTotal = Object.values(source.sourcePairConflictMatrix).reduce((sum, row) => {
    return sum + Object.values(row).reduce((rowSum, value) => rowSum + value, 0);
  }, 0);
  assert.strictEqual(matrixTotal, ranking.clearRankingErrorCount);
  const wrongSourceTotal = Object.values(source.errorCountByDominantWrongSource).reduce((sum, value) => sum + value, 0);
  assert.strictEqual(wrongSourceTotal, ranking.clearRankingErrorCount);
  assert(source.averageScoreContributionByLabel.dame);
  assert(source.medianScoreContributionByLabel.redundantReinforcement);

  for (const pair of ["senteYose_vs_largeGote", "largeGote_vs_smallTerritoryGain", "meaningfulYose_vs_dame", "meaningfulYose_vs_redundantReinforcement", "necessaryConnection_vs_largeGote", "captureOrRescue_vs_senteYose", "dame_vs_redundantReinforcement", "uncertain_vs_meaningfulYose"]) {
    assert(pairwise.pairs[pair], pair);
    const total = pairwise.pairs[pair].currentScorerCorrectCount + pairwise.pairs[pair].currentScorerIncorrectCount + pairwise.pairs[pair].tieCount;
    assert.strictEqual(total, pairwise.pairs[pair].numberOfComparablePositions, pair);
    assert(pairwise.pairs[pair].accuracy >= 0 && pairwise.pairs[pair].accuracy <= 1);
  }

  assert(scale.statistics.overall.all.policyScore);
  assert.strictEqual(scale.statistics.overall.all.policyScore.count, 13653);
  assert(Array.isArray(scale.identifiedAnomalies));
  assert(scale.identifiedAnomalies.some(item => item.type === "positiveValueOnLowValueLabel"));

  for (const profile of ["baseline_ranking", "suppress_fuseki_in_endgame", "suppress_joseki_in_endgame", "suppress_shape_on_dame", "suppress_pattern_on_redundant_reinforcement", "normalize_position_endgame_scale", "remove_position_endgame_double_count", "label_confidence_gate", "pairwise_sente_bonus", "pairwise_dame_penalty", "pairwise_redundant_penalty", "protected_urgent_priority"]) {
    assert(summary.hypothesisProfiles[profile], profile);
    assert.strictEqual(summary.hypothesisProfiles[profile].overallBenchmarkGoodOrBetterRate, 0.216);
    assert.strictEqual(summary.hypothesisProfiles[profile].rejectedMoveRate, 0);
  }
  assert.strictEqual(summary.offlineOnly, true);
  assert.strictEqual(summary.browserRuntimeAffected, false);
  assert.strictEqual(summary.verifiedImprovementExists, false);
  assert.strictEqual(benchmark.qualityMetrics.exactMatchRate, 0.149);
  assert.strictEqual(benchmark.qualityMetrics.goodOrBetterRate, 0.216);
  assert.strictEqual(benchmark.phaseMetrics.endgame.goodOrBetterRate, 0.108);
  assert.strictEqual(benchmark.qualityMetrics.averageScoreLossFromBest, 9.513055);
  assert.strictEqual(benchmark.sourceDiagnostics.conflictingSourceFrequency, 0.2);
  assert.strictEqual(benchmark.qualityMetrics.rejectedMoveRate, 0);
}

function testPositionScoreGatingAnalysisReports() {
  if (!fs.existsSync(positionScoreErrorComponentsPath) || !fs.existsSync(positionScoreGatingReportPath)) return;
  const components = loadJson(positionScoreErrorComponentsPath);
  const report = loadJson(positionScoreGatingReportPath);
  assert.strictEqual(components.offlineOnly, true);
  assert.strictEqual(components.browserRuntimeAffected, false);
  assert.strictEqual(report.offlineOnly, true);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert.strictEqual(report.randomSeed, 20260710);
  assert(components.caseCount > 0);
  assert(components.aggregateContributionTotals.edgeComponent >= 0);
  assert(components.aggregateContributionTotals.territoryComponent >= 0);
  assert.strictEqual(typeof components.primaryCauseOfDameInflation, "string");
  assert(components.suspectedDoubleCountingMechanism.includes("positionScore"));
  for (const item of components.cases.slice(0, 20)) {
    assert.strictEqual(typeof item.selectedPositionScore, "number");
    assert.strictEqual(typeof item.betterCandidatePositionScore, "number");
    assert(item.runtimeObservableLowValueEvidence);
    assert(item.protectionEvidence);
  }

  for (const key of [
    "baseline_runtime",
    "position_gate_10",
    "position_gate_20",
    "position_gate_30",
    "position_scale_075",
    "position_scale_050",
    "position_gate_endgame_only",
    "position_gate_high_confidence_only",
    "position_gate_neutral_only",
    "position_gate_redundant_only",
    "position_gate_neutral_and_redundant",
    "position_component_fix_only"
  ]) {
    const profile = report.profiles[key];
    assert(profile, key);
    assert.strictEqual(typeof profile.fullBenchmark.goodOrBetterRate, "number");
    assert.strictEqual(typeof profile.fullBenchmark.endgameGoodOrBetterRate, "number");
    assert.strictEqual(typeof profile.endgameAudit.highImpactErrorCount, "number");
    assert.strictEqual(typeof profile.gateDiagnostics.eligibleCandidateCount, "number");
    assert.strictEqual(profile.gateDiagnostics.urgentCandidateGateCount, 0, key);
    assert.strictEqual(profile.gateDiagnostics.necessaryConnectionGateCount, 0, key);
    const reductionStats = profile.gateDiagnostics.scoreReductionDistribution;
    assert(reductionStats.max >= reductionStats.min);
    if (key !== "baseline_runtime") {
      assert(profile.acceptanceReasons.length > 0);
    }
  }
  assert.strictEqual(report.verifiedImprovementExists, false);
  assert.strictEqual(report.bestProfile, null);
  assert(report.runtimeLowValuePredicate.conflictingEvidenceDefaultsToNotEligible);
  assert(report.latency.scoringLatencyMs > 0);
  assert(report.latency.auditDurationMs >= 0);
  assert(report.latency.reportSerializationMs >= 0);
  assert(report.latency.totalOfflineDurationMs >= report.latency.scoringLatencyMs);
}

function testFinalScoreOverrideAuditReports() {
  if (
    !fs.existsSync(finalScorePipelineAuditPath) ||
    !fs.existsSync(urgentOverrideCasesPath) ||
    !fs.existsSync(urgentOverrideReplayPath) ||
    !fs.existsSync(finalScoreOverrideReportPath)
  ) return;
  const pipeline = loadJson(finalScorePipelineAuditPath);
  const cases = loadJson(urgentOverrideCasesPath);
  const replay = loadJson(urgentOverrideReplayPath);
  const report = loadJson(finalScoreOverrideReportPath);
  assert.strictEqual(pipeline.offlineOnly, true);
  assert.strictEqual(cases.randomSeed, 20260710);
  assert.strictEqual(replay.randomSeed, 20260710);
  assert.strictEqual(report.randomSeed, 20260710);
  assert(pipeline.sources.some(item => item.scoreSource === "tacticalScore"));
  assert(pipeline.sources.some(item => item.scoreSource === "combinedScore"));
  assert(pipeline.identifiedIssues.some(item => item.includes("tactical")));
  assert.strictEqual(cases.caseCount, replay.caseCount);
  assert(cases.caseCount > 0);
  assert(Object.keys(cases.overrideCountByStage).length > 0);
  for (const item of cases.cases.slice(0, 20)) {
    assert(["source_generation", "source_normalization", "context_fusion", "position_combination", "final_combined_score", "quality_tiering", "difficulty_softening", "final_selection", "unknown"].includes(item.overrideStage));
    assert(item.tacticalEvidence);
    assert(Array.isArray(item.equivalentUrgentCandidateSet));
    assert.strictEqual(typeof item.tacticallyEquivalent, "boolean");
  }
  for (const item of replay.cases.slice(0, 20)) {
    assert(item.urgentCandidateRankAtEachStage.raw_policy_score >= 1);
    assert(item.selectedCandidateRankAtEachStage.final_selection >= 1);
    assert.strictEqual(typeof item.firstStageUrgentCandidateLoses, "string");
  }
  for (const key of ["baseline_runtime", "v35_gate_replay", "urgent_floor_raw_tactical", "urgent_floor_after_fusion", "urgent_floor_final_combined", "urgent_tier_protection", "urgent_topk_protection", "necessary_connection_floor", "capture_rescue_floor", "urgent_margin_preservation", "gate_plus_urgent_floor", "gate_plus_urgent_tier_protection"]) {
    const profile = report.profiles[key];
    assert(profile, key);
    assert.strictEqual(typeof profile.fullBenchmark.goodOrBetterRate, "number");
    assert.strictEqual(typeof profile.urgentDiagnostics.urgentMissCount, "number");
    assert.strictEqual(profile.urgentDiagnostics.falseUrgentProtectionCount, 0, key);
    assert.strictEqual(profile.urgentDiagnostics.protectedNonUrgentCandidateCount, 0, key);
  }
  assert.strictEqual(report.verifiedImprovementExists, false);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert(report.latency.scoringLatencyMs > 0);
  assert(report.latency.totalOfflineDurationMs >= report.latency.auditDurationMs);
}

function testRawUrgentSourceAnalysisReports() {
  if (!fs.existsSync(rawUrgentSourceAuditPath) || !fs.existsSync(rawUrgentSourceReportPath)) return;
  const audit = loadJson(rawUrgentSourceAuditPath);
  const report = loadJson(rawUrgentSourceReportPath);
  assert.strictEqual(audit.randomSeed, 20260710);
  assert.strictEqual(report.randomSeed, 20260710);
  assert.strictEqual(audit.offlineOnly, true);
  assert.strictEqual(report.offlineOnly, true);
  assert.strictEqual(audit.browserRuntimeAffected, false);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert.strictEqual(audit.caseCount, 573);
  assert.strictEqual(audit.dominantRawSourceDefect, "necessary connection evidence missing");
  assert(Object.values(audit.rootCauseDistribution).reduce((sum, value) => sum + value, 0) === audit.caseCount);
  for (const item of audit.cases.slice(0, 20)) {
    assert(item.rawScoreComponents);
    assert(item.equivalentUrgentCandidateSet);
    assert.strictEqual(typeof item.exactReasonUrgentMoveStartsBehind, "string");
    assert.strictEqual(typeof item.dominantSourceHelpingWrongCandidate, "string");
  }
  for (const [name, profile] of Object.entries(report.profiles)) {
    if (profile.skipped) {
      assert.strictEqual(typeof profile.skipReason, "string", name);
      continue;
    }
    assert.strictEqual(typeof profile.fullBenchmark.goodOrBetterRate, "number", name);
    assert.strictEqual(typeof profile.fullBenchmark.endgameGoodOrBetterRate, "number", name);
    assert.strictEqual(profile.fullBenchmark.rejectedMoveRate, 0, name);
    assert.strictEqual(typeof profile.urgentSafety.urgentMissCount, "number", name);
    assert.strictEqual(profile.urgentSafety.falseUrgentCandidateCount, 0, name);
    assert.strictEqual(profile.difficultySafety.lowerDifficultyUnsafeSelectionCount, 0, name);
    assert.strictEqual(profile.difficultySafety.lowerDifficultyRejectedSelectionCount, 0, name);
    assert.strictEqual(profile.difficultySafety.urgentCandidateRemovedByDifficultyCount, 0, name);
    assert.strictEqual(profile.acceptedCandidate, false, name);
  }
  assert.strictEqual(report.verifiedImprovementExists, false);
  assert.strictEqual(report.acceptanceGatesPassed, false);
  assert.strictEqual(report.bestProfile, null);
  assert(report.latency.scoringLatencyMs > 0);
  assert(report.latency.totalOfflineDurationMs >= report.latency.offlineAnalysisDurationMs);
}

function testShallowTacticalVerificationReport() {
  if (!fs.existsSync(shallowTacticalVerificationReportPath)) return;
  const report = loadJson(shallowTacticalVerificationReportPath);
  assert.strictEqual(report.randomSeed, 20260710);
  assert.strictEqual(report.bestProfile, null);
  assert.strictEqual(report.acceptanceGatesPassed, false);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert.strictEqual(report.candidateLimits.normalMaximum, 12);
  assert.strictEqual(report.candidateLimits.absoluteMaximum, 16);
  assert.strictEqual(report.candidateLimits.maxRepliesPerCandidate, 5);
  assert.strictEqual(report.candidateLimits.maxDepthPlies, 2);
  for (const key of ["baseline_runtime", "capture_verification_only", "capture_rescue_verification", "capture_rescue_connection_verification", "shallow_verification_conservative"]) {
    const profile = report.profiles[key];
    assert(profile, key);
    assert.strictEqual(typeof profile.fullBenchmark.goodOrBetterRate, "number", key);
    assert.strictEqual(typeof profile.fullBenchmark.endgameGoodOrBetterRate, "number", key);
    assert.strictEqual(profile.fullBenchmark.rejectedMoveRate, 0, key);
    assert.strictEqual(typeof profile.urgentSafety.missedImmediateCaptureCount, "number", key);
    assert.strictEqual(typeof profile.urgentSafety.missedAtariRescueCount, "number", key);
    assert.strictEqual(typeof profile.urgentSafety.missedNecessaryConnectionCount, "number", key);
    assert.strictEqual(profile.urgentSafety.falseUrgentProtectionCount, 0, key);
    assert.strictEqual(profile.difficultySafety.lowerDifficultyUnsafeSelectionCount, 0, key);
    assert.strictEqual(profile.acceptedCandidate, false, key);
  }
  assert(report.latency.baseScoringLatencyMs > 0);
  assert(report.latency.totalMoveSelectionLatencyMs >= report.latency.baseScoringLatencyMs);
  assert(report.latency.offlineEvaluationDurationMs >= 0);
}

function testLocalReadingProfileValidationReports() {
  const trainingSource = fs.readFileSync(path.join(__dirname, "..", "training", "evaluate_policy.py"), "utf8");
  assert(trainingSource.includes("--run-local-reading-profiles"));
  assert(fs.existsSync(localReadingBridgePath));
  const bridgeSource = fs.readFileSync(localReadingBridgePath, "utf8");
  assert(bridgeSource.includes('require("../rule-engine.js")'));
  assert(bridgeSource.includes("GoKidCoachRuleEngine.evaluateLocalSequence"));
  assert(appSource.includes("applyLocalReading("));
  assert(appSource.includes("maxDepth: 3"));
  assert(appSource.includes("maxCandidates: 8"));
  assert(appSource.includes("maxOpponentReplies: 4"));
  assert(appSource.includes("maxAiContinuations: 3"));
  assert(!swSource.includes("local-reading-profile-report.json"));
  assert(!swSource.includes("local-reading-selection-diff.json"));
  assert(!swSource.includes("local-reading-error-cases.json"));
  assert(!swSource.includes("local-reading-latency-report.json"));
  assert(!swSource.includes("local-reading-gate-result.json"));
  if (
    !fs.existsSync(localReadingProfileReportPath) ||
    !fs.existsSync(localReadingSelectionDiffPath) ||
    !fs.existsSync(localReadingErrorCasesPath) ||
    !fs.existsSync(localReadingLatencyReportPath) ||
    !fs.existsSync(localReadingGateResultPath) ||
    !fs.existsSync(localReadingEffectivenessTracePath) ||
    !fs.existsSync(localReadingOpportunityCoveragePath) ||
    !fs.existsSync(localReadingTerminalClassificationPath)
  ) return;

  const report = loadJson(localReadingProfileReportPath);
  const diff = loadJson(localReadingSelectionDiffPath);
  const errors = loadJson(localReadingErrorCasesPath);
  const latency = loadJson(localReadingLatencyReportPath);
  const gates = loadJson(localReadingGateResultPath);
  const trace = loadJson(localReadingEffectivenessTracePath);
  const coverage = loadJson(localReadingOpportunityCoveragePath);
  const terminal = loadJson(localReadingTerminalClassificationPath);
  assert.strictEqual(report.randomSeed, 20260710);
  assert.strictEqual(report.offlineOnly, true);
  assert.strictEqual(report.browserRuntimeAffected, false);
  assert.strictEqual(report.deploymentOccurred, false);
  assert.strictEqual(report.profileRunnerArchitecture.pythonApproximationUsed, false);
  assert.strictEqual(report.profileRunnerArchitecture.realImplementation.includes("rule-engine.js"), true);
  for (const key of ["baseline_v12", "capture_only", "capture_rescue", "cut_connection", "full_conservative"]) {
    const profile = report.profiles[key];
    assert(profile, key);
    assert.strictEqual(profile.usesRealJavaScriptLocalReading, true, key);
    assert.strictEqual(profile.limits.maxDepth, 3, key);
    assert.strictEqual(profile.limits.maxCandidates, 8, key);
    assert.strictEqual(profile.limits.maxOpponentReplies, 4, key);
    assert.strictEqual(profile.limits.maxAiContinuations, 3, key);
    assert.strictEqual(profile.generalQuality.rejectedMoveRate, 0, key);
    assert.strictEqual(typeof profile.tacticalQuality.immediateCaptureOpportunityCount, "number", key);
    assert.strictEqual(typeof profile.tacticalQuality.atariRescueOpportunityCount, "number", key);
    assert.strictEqual(typeof profile.tacticalQuality.necessaryConnectionOpportunityCount, "number", key);
    assert.strictEqual(typeof profile.performance.p95ReadingLatencyMs, "number", key);
    assert.strictEqual(typeof profile.opportunityMetrics.effectiveRerankRate, "number", key);
    assert.strictEqual(typeof profile.opportunityMetrics.correctedSelectionRate, "number", key);
  }
  assert.strictEqual(diff.randomSeed, 20260710);
  assert.strictEqual(diff.offlineOnly, true);
  assert.strictEqual(diff.changedSelectionCount, diff.cases.length);
  assert.strictEqual(errors.offlineOnly, true);
  assert.strictEqual(errors.errorCaseCount, errors.cases.length);
  assert.strictEqual(latency.offlineOnly, true);
  assert(Array.isArray(latency.entries));
  assert.strictEqual(gates.bestProfile, "full_conservative");
  assert.strictEqual(gates.runtimeIntegrationAllowed, true);
  assert.strictEqual(gates.browserRuntimeAffected, false);
  assert.strictEqual(gates.deploymentOccurred, false);
  assert.strictEqual(trace.offlineOnly, true);
  assert(Array.isArray(trace.cases));
  assert(trace.cases.some(item => item.failureCategory === "corrected"));
  assert.strictEqual(coverage.offlineOnly, true);
  assert(Array.isArray(coverage.profiles));
  assert(coverage.profiles.some(item => item.profile === "full_conservative" && item.effectiveRerankRate > 0));
  assert.strictEqual(terminal.offlineOnly, true);
  assert.strictEqual(typeof terminal.accuracyByProfile.full_conservative, "number");
}

function testTacticalConflictReportReadable() {
  if (!fs.existsSync(tacticalConflictPath)) return;
  const report = loadJson(tacticalConflictPath);
  assert.strictEqual(typeof report.caseCount, "number");
  assert(Array.isArray(report.cases));
  for (const item of report.cases.slice(0, 5)) {
    assert.strictEqual(typeof item.positionId, "string");
    assert.strictEqual(typeof item.tacticalCategory, "string");
    assert.strictEqual(typeof item.recommendedGatingRule, "string");
  }
}

function run() {
  testDeterministicSamplingMetadata();
  testMinimumBenchmarkSizeHandling();
  testQualityTierClassification();
  testTopKCalculations();
  testRejectedMoveDetection();
  testPerPhaseMetrics();
  testSourceDiagnostics();
  testBaselineComparison();
  testRegressionStatusRules();
  testMissingBaselineGracefulFallback();
  testJsonOutputBrowserReadable();
  testDeterministicAblationResults();
  testWinningProfileSelectionThresholds();
  testNarrowCapProfilesPresent();
  testEvaluationOnlyProfilesDoNotAlterRuntime();
  testEndgameValueAnalysisOutputsReadable();
  testEndgameValueProfilesDeterministicSeed();
  testEndgameLabelReportsReadable();
  testPrimaryLabelsMutuallyExclusiveAndEvidenceBased();
  testEndgameCandidateExpansionCoverage();
  testEndgameRankingAuditReports();
  testPositionScoreGatingAnalysisReports();
  testFinalScoreOverrideAuditReports();
  testRawUrgentSourceAnalysisReports();
  testShallowTacticalVerificationReport();
  testLocalReadingProfileValidationReports();
  testTacticalConflictReportReadable();
  console.log("test-evaluation-framework: ok");
}

run();
