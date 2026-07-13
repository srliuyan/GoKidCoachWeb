(function (root, factory) {
  const api = factory(root.GoKidCoachStudentModel);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachCompanionEngine = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (studentModel) {
  const supportedAreas = [
    "opening",
    "capture",
    "atari",
    "connection",
    "lifeDeath",
    "ladder",
    "territory",
    "endgame"
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function baselineLevel(studentProfile) {
    if (studentModel?.getOverallLevel) return studentModel.getOverallLevel(studentProfile);
    return 50;
  }

  function weakAreas(studentProfile, limit) {
    if (studentModel?.getWeakAreas) return studentModel.getWeakAreas(studentProfile, limit || 3);
    return [{ area: "opening", score: 50, strength: 50 }];
  }

  function normalizeResults(results) {
    return (Array.isArray(results) ? results : [])
      .slice(0, 8)
      .map(item => {
        if (typeof item === "boolean") return item;
        if (typeof item?.childWon === "boolean") return item.childWon;
        return item?.result === "childWin" || item?.result === "孩子胜";
      });
  }

  function recentTrend(results) {
    const recent = normalizeResults(results).slice(0, 3);
    if (recent.length === 3 && recent.every(Boolean)) return 1;
    if (recent.length === 3 && recent.every(item => !item)) return -1;
    return 0;
  }

  function getCompanionFocus(studentProfile) {
    const focus = weakAreas(studentProfile, 1)[0]?.area || "opening";
    return supportedAreas.includes(focus) ? focus : "opening";
  }

  function createCompanionState() {
    return {
      moveAssessments: [],
      counts: {
        good: 0,
        acceptable: 0,
        inaccurate: 0,
        mistake: 0,
        blunder: 0
      },
      currentStrength: 50,
      lastAssessment: null,
      influence: 0
    };
  }

  function estimateCurrentStrength(studentProfile, gameState, companionState) {
    const base = baselineLevel(studentProfile);
    const moveCount = numeric(gameState?.moveCount);
    const blackCaptures = numeric(gameState?.blackCaptures);
    const whiteCaptures = numeric(gameState?.whiteCaptures);
    const scoreLead = numeric(gameState?.scoreLead);
    const weakBlackGroups = numeric(gameState?.weakBlackGroups);
    const pressuredWhiteGroups = numeric(gameState?.pressuredWhiteGroups);
    const openingDiscipline = numeric(gameState?.openingDiscipline || 50);
    const completion = numeric(gameState?.completion || 50);
    const influence = numeric(companionState?.influence);

    let estimate = base;
    estimate += clamp((blackCaptures - whiteCaptures) * 4, -14, 14);
    estimate += clamp(scoreLead * 1.4, -12, 12);
    estimate += clamp((pressuredWhiteGroups - weakBlackGroups) * 5, -12, 12);
    estimate += clamp((openingDiscipline - 50) * 0.18, -6, 6);
    estimate += clamp((completion - 50) * 0.12, -5, 5);
    estimate += clamp(influence * 18, -10, 10);
    if (moveCount < 20) estimate += clamp((openingDiscipline - 50) * 0.1, -4, 4);
    if (moveCount > 120) estimate += clamp((completion - 50) * 0.14, -6, 6);

    return clamp(Math.round(estimate), 20, 95);
  }

  function qualityFromGap(rankIndex, gap, candidate) {
    const severe = candidate && (
      candidate.obviousGiveaway
      || candidate.isSuicide
      || numeric(candidate.ruleScore) < -180
      || (numeric(candidate.ownLiberties) <= 1 && numeric(candidate.captures) === 0)
    );
    if (rankIndex === 0 || gap <= 12) return "good";
    if (rankIndex <= 2 && gap <= 45) return "acceptable";
    if (gap <= 95) return "inaccurate";
    if (gap <= 180 && !severe) return "mistake";
    return "blunder";
  }

  function qualityImpact(quality) {
    if (quality === "good") return 0.14;
    if (quality === "acceptable") return 0.05;
    if (quality === "inaccurate") return -0.06;
    if (quality === "mistake") return -0.14;
    return -0.22;
  }

  function cloneProfile(studentProfile) {
    return JSON.parse(JSON.stringify(studentProfile || { scores: {} }));
  }

  function adjustScore(profile, key, delta) {
    if (!profile.scores) profile.scores = {};
    const current = numeric(profile.scores[key] ?? studentModel?.defaultScores?.[key] ?? 50);
    profile.scores[key] = clamp(Math.round(current + delta), 0, 100);
  }

  function classifyMoveQuality(input) {
    const move = input?.move;
    const candidates = Array.isArray(input?.candidates) ? input.candidates.slice() : [];
    if (!move || !candidates.length) {
      return {
        quality: "acceptable",
        rankIndex: 1,
        bestScoreGap: 0,
        selectedCandidate: null,
        bestCandidate: null
      };
    }

    const sorted = candidates
      .slice()
      .sort((a, b) => numeric(b.combinedScore ?? b.adjustedScore) - numeric(a.combinedScore ?? a.adjustedScore));
    const bestCandidate = sorted[0];
    const selectedIndex = sorted.findIndex(candidate => candidate.point?.x === move.x && candidate.point?.y === move.y);
    const selectedCandidate = selectedIndex >= 0 ? sorted[selectedIndex] : null;
    const rankIndex = selectedIndex >= 0 ? selectedIndex : sorted.length;
    const bestScore = numeric(bestCandidate?.combinedScore ?? bestCandidate?.adjustedScore);
    const selectedScore = numeric(selectedCandidate?.combinedScore ?? selectedCandidate?.adjustedScore);
    const gap = Math.max(0, bestScore - selectedScore);
    return {
      quality: qualityFromGap(rankIndex, gap, selectedCandidate),
      rankIndex,
      bestScoreGap: gap,
      selectedCandidate,
      bestCandidate
    };
  }

  function applyLiveProfileUpdate(studentProfile, assessment) {
    const profile = cloneProfile(studentProfile);
    const delta = qualityImpact(assessment.quality);
    const candidate = assessment.selectedCandidate || {};
    const moveNumber = numeric(candidate.moveNumber);

    adjustScore(profile, "readingDepth", delta * 28);
    adjustScore(profile, "blunderRate", -delta * 34);
    if (moveNumber < 30) adjustScore(profile, "opening", delta * 26 + numeric(candidate.openingBookScore) * 0.06);
    if (numeric(candidate.tacticalPressure) > 0 || numeric(candidate.captures) > 0) {
      adjustScore(profile, "capture", delta * 24 + numeric(candidate.captures) * 4);
      adjustScore(profile, "atari", delta * 20 + numeric(candidate.tacticalPressure) * 3);
    }
    if (numeric(candidate.connectionValue) > 0 || numeric(candidate.cutOpportunity) > 0) {
      adjustScore(profile, "connection", delta * 22 + numeric(candidate.connectionValue) * 3);
    }
    if (numeric(candidate.lifeDeathValue) > 0) adjustScore(profile, "lifeDeath", delta * 20 + numeric(candidate.lifeDeathValue) * 2);
    if (numeric(candidate.ladderValue) > 0) adjustScore(profile, "ladder", delta * 16 + numeric(candidate.ladderValue) * 2);
    if (numeric(candidate.territoryValue) > 0) adjustScore(profile, "territory", delta * 16 + numeric(candidate.territoryValue));
    if (moveNumber >= 100) adjustScore(profile, "endgame", delta * 18 + numeric(candidate.endgameValue) * 2);
    return profile;
  }

  function observeStudentMove(input) {
    const assessment = classifyMoveQuality(input);
    const previousState = input?.companionState || createCompanionState();
    const nextState = {
      ...previousState,
      moveAssessments: previousState.moveAssessments.slice(-19),
      counts: { ...previousState.counts }
    };
    nextState.moveAssessments.push({
      quality: assessment.quality,
      rankIndex: assessment.rankIndex,
      bestScoreGap: assessment.bestScoreGap,
      moveNumber: numeric(assessment.selectedCandidate?.moveNumber)
    });
    nextState.counts[assessment.quality] = (nextState.counts[assessment.quality] || 0) + 1;
    nextState.lastAssessment = assessment;
    nextState.influence = clamp(numeric(previousState.influence) * 0.72 + qualityImpact(assessment.quality), -0.8, 0.8);

    const updatedProfile = applyLiveProfileUpdate(input?.studentProfile, assessment);
    nextState.currentStrength = estimateCurrentStrength(updatedProfile, input?.gameState || {}, nextState);
    return {
      assessment,
      updatedProfile,
      companionState: nextState
    };
  }

  function createCompanionPlan(studentProfile, recentGames, gameState, companionState) {
    const results = normalizeResults(recentGames);
    const trend = recentTrend(results);
    const focus = getCompanionFocus(studentProfile);
    const currentStrength = estimateCurrentStrength(studentProfile, gameState || {}, companionState);
    const targetAiStrength = clamp(currentStrength * 1.075, currentStrength + 3, Math.min(98, currentStrength + 10));
    const winRate = results.length ? results.filter(Boolean).length / results.length : 0.5;
    const struggling = trend < 0 || winRate < 0.4;
    const dominating = trend > 0 || winRate > 0.6;
    const precisionBias = clamp((targetAiStrength - 50) / 120 + trend * 0.08 + (winRate - 0.5) * 0.18 + numeric(companionState?.influence) * 0.16, -0.28, 0.28);

    return {
      mode: "companion_engine",
      focus,
      weakAreas: weakAreas(studentProfile, 3).map(item => item.area),
      currentStrength,
      targetAiStrength: Math.round(targetAiStrength),
      precisionBand: struggling ? "soft" : dominating ? "sharp" : "balanced",
      pressureTrend: trend,
      companionInfluence: numeric(companionState?.influence),
      candidateDiversity: clamp(struggling ? 3 : dominating ? 2 : 3, 2, 4),
      tacticalSharpness: clamp(1.0 + precisionBias * 0.85, 0.82, 1.22),
      territorialPreference: clamp(focus === "territory" || focus === "endgame" ? 1.14 : 1.0, 0.92, 1.16),
      openingPrecision: clamp(focus === "opening" ? 1.18 + precisionBias * 0.25 : 1.0 + precisionBias * 0.2, 0.9, 1.28),
      endgamePrecision: clamp(focus === "endgame" ? 1.16 + precisionBias * 0.25 : 0.98 + precisionBias * 0.2, 0.88, 1.25),
      confidenceBase: clamp(0.7 + precisionBias * 0.55, 0.52, 0.9),
      confidenceDrop: struggling ? 0.16 : dominating ? 0.05 : 0.1,
      targetMoveRank: struggling ? 2.6 : dominating ? 1.4 : 2.0,
      reducePrecision: struggling,
      increasePrecision: dominating
    };
  }

  function summarizeCompanionResult(gameRecord, studentProfile, companionState) {
    const currentStrength = estimateCurrentStrength(studentProfile, gameRecord?.gameState || {}, companionState);
    const counts = companionState?.counts || createCompanionState().counts;
    return {
      mode: "companion_engine",
      currentStrength,
      counts,
      summary: `Companion tracked move quality: good ${counts.good}, acceptable ${counts.acceptable}, inaccurate ${counts.inaccurate}, mistake ${counts.mistake}, blunder ${counts.blunder}.`
    };
  }

  return {
    getCompanionFocus,
    createCompanionState,
    classifyMoveQuality,
    observeStudentMove,
    estimateCurrentStrength,
    createCompanionPlan,
    summarizeCompanionResult
  };
}));
