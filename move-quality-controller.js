(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachMoveQualityController = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function isMaxStrengthMode(mode) {
    return mode === "MAX_STRENGTH_FIXED" || mode === "advanced";
  }

  function pointTieBreak(a, b) {
    const pa = a?.point || {};
    const pb = b?.point || {};
    return numeric(pa.y ?? 99) - numeric(pb.y ?? 99)
      || numeric(pa.x ?? 99) - numeric(pb.x ?? 99);
  }

  function compareBaseStrength(a, b) {
    return numeric(b.adjustedScore ?? b.combinedScore) - numeric(a.adjustedScore ?? a.combinedScore)
      || numeric(b.combinedScore) - numeric(a.combinedScore)
      || pointTieBreak(a, b);
  }

  function averageQualityImpact(recentMoveAssessments) {
    const items = (Array.isArray(recentMoveAssessments) ? recentMoveAssessments : []).slice(-12);
    if (!items.length) return 0;
    const map = {
      good: 0.18,
      acceptable: 0.07,
      inaccurate: -0.06,
      mistake: -0.14,
      blunder: -0.22
    };
    return items.reduce((sum, item) => sum + (map[item?.quality] || 0), 0) / items.length;
  }

  function smoothStrengthAdjustment(companionState, recentMoveAssessments) {
    const influence = numeric(companionState?.influence);
    const recent = averageQualityImpact(recentMoveAssessments);
    const lastQuality = companionState?.lastAssessment?.quality || null;
    const lastImpactMap = {
      good: 0.08,
      acceptable: 0.03,
      inaccurate: -0.03,
      mistake: -0.06,
      blunder: -0.09
    };
    const lastImpact = lastImpactMap[lastQuality] || 0;
    const smoothed = clamp(influence * 0.62 + recent * 0.28 + lastImpact * 0.1, -0.32, 0.32);
    return {
      smoothedInfluence: smoothed,
      pressureDelta: smoothed * 0.75,
      targetMoveRankDelta: clamp(-smoothed * 2.2, -0.45, 0.45),
      confidenceDelta: clamp(smoothed * 0.18, -0.06, 0.06)
    };
  }

  function invalidMove(candidate) {
    if (!candidate || candidate.legal === false || candidate.ruleLegal === false) return true;
    if (candidate.immediatelyRefuted && !candidate.verifiedUrgent) return true;
    if (candidate.coherentClass === "rejected" || candidate.coherentClass === "immediatelyRefuted") return true;
    if ((candidate.coherentClass === "lowValue" || candidate.lowValueCandidate || candidate.dameCandidate || candidate.redundantReinforcement) && !candidate.verifiedUrgent) return true;
    if (candidate.isSuicide || candidate.obviousGiveaway) return true;
    if (candidate.isMeaninglessFirstLine || candidate.isRandomFlyaway) return true;
    if (numeric(candidate.ruleScore) <= -900) return true;
    if (!Number.isFinite(numeric(candidate.adjustedScore ?? candidate.combinedScore))) return true;
    return false;
  }

  function createContext(baseContext) {
    const companionState = baseContext?.companionState || {};
    const recentMoveAssessments = baseContext?.recentMoveAssessments || companionState.moveAssessments || [];
    const smoothing = smoothStrengthAdjustment(companionState, recentMoveAssessments);
    const companionPlan = baseContext?.companionPlan || {};
    const difficultySettings = baseContext?.difficultySettings || {};
    const maxStrength = isMaxStrengthMode(difficultySettings.releaseDifficultyMode);
    if (maxStrength) {
      return {
        focus: "max",
        currentStrength: 100,
        targetAiStrength: 100,
        precisionBand: "fixed",
        candidateDiversity: 1,
        tacticalSharpness: 1,
        territorialPreference: 1,
        openingPrecision: 1,
        endgamePrecision: 1,
        confidenceBase: 0.9,
        confidenceDrop: 0.04,
        targetMoveRank: 1,
        reducePrecision: false,
        increasePrecision: true,
        smoothing: { smoothedInfluence: 0, pressureDelta: 0, targetMoveRankDelta: 0, confidenceDelta: 0 },
        moveNumber: numeric(baseContext?.moveNumber),
        maxStrengthFixed: true
      };
    }
    return {
      focus: companionPlan.focus || difficultySettings.focusArea || "opening",
      currentStrength: numeric(companionPlan.currentStrength || difficultySettings.currentStrengthEstimate || companionState.currentStrength || 50),
      targetAiStrength: numeric(companionPlan.targetAiStrength || difficultySettings.suggestedAiStrength || 55),
      precisionBand: companionPlan.precisionBand || "balanced",
      candidateDiversity: clamp(numeric(companionPlan.candidateDiversity || difficultySettings.candidateTopK || 3), 2, 4),
      tacticalSharpness: clamp(numeric(companionPlan.tacticalSharpness || difficultySettings.tacticalStrictness || 1) + smoothing.pressureDelta * 0.4, 0.82, 1.22),
      territorialPreference: clamp(numeric(companionPlan.territorialPreference || 1), 0.9, 1.16),
      openingPrecision: clamp(numeric(companionPlan.openingPrecision || difficultySettings.openingBookWeight || 1) + smoothing.pressureDelta * 0.08, 0.9, 1.3),
      endgamePrecision: clamp(numeric(companionPlan.endgamePrecision || difficultySettings.endgamePrecision || 1) + smoothing.pressureDelta * 0.08, 0.88, 1.25),
      confidenceBase: clamp(numeric(companionPlan.confidenceBase || 0.7) + smoothing.confidenceDelta, 0.52, 0.9),
      confidenceDrop: clamp(numeric(companionPlan.confidenceDrop || 0.1), 0.04, 0.18),
      targetMoveRank: clamp(numeric(companionPlan.targetMoveRank || 2) + smoothing.targetMoveRankDelta, 1, 3),
      reducePrecision: Boolean(companionPlan.reducePrecision || smoothing.smoothedInfluence < -0.06),
      increasePrecision: Boolean(companionPlan.increasePrecision || smoothing.smoothedInfluence > 0.06),
      smoothing,
      moveNumber: numeric(baseContext?.moveNumber)
    };
  }

  function scoreCandidate(candidate, context) {
    const moveNumber = numeric(candidate.moveNumber ?? context.moveNumber);
    let score = 0;
    if (Number.isFinite(Number(candidate.fusedPolicyScore))) {
      score += numeric(candidate.fusedPolicyScore);
    } else {
      score += numeric(candidate.policyScore);
      score += numeric(candidate.patternScore);
      score += numeric(candidate.shapeScore);
      score += numeric(candidate.fusekiScore);
      score += numeric(candidate.tacticalScore);
      score += numeric(candidate.josekiScore);
      score += numeric(candidate.endgameScore);
      score += numeric(candidate.positionScore);
      score += numeric(candidate.openingBookScore) * context.openingPrecision;
    }
    score += numeric(candidate.midgameScore);
    score += numeric(candidate.ruleScore);
    score += numeric(candidate.tacticalPressure) * 24 * context.tacticalSharpness;
    score += numeric(candidate.rescueValue) * 18 * context.tacticalSharpness;
    score += numeric(candidate.connectionValue) * 14;
    score += numeric(candidate.cutOpportunity) * 12;
    score += numeric(candidate.territoryValue) * 10 * context.territorialPreference;
    score += numeric(candidate.endgameValue) * 12 * context.endgamePrecision;
    if (moveNumber < 30) score += numeric(candidate.openingBookScore) * 0.35 * context.openingPrecision;

    if (context.focus === "connection") score += numeric(candidate.connectionValue) * 24 + numeric(candidate.cutOpportunity) * 18;
    if (context.focus === "capture" || context.focus === "atari") score += numeric(candidate.tacticalPressure) * 28 + numeric(candidate.captures) * 24;
    if (context.focus === "lifeDeath" || context.focus === "ladder") score += numeric(candidate.lifeDeathValue) * 22 + numeric(candidate.ladderValue) * 22;
    if (context.focus === "territory") score += numeric(candidate.territoryValue) * 18;
    if (context.focus === "opening" && moveNumber < 30) score += numeric(candidate.openingBookScore) * 0.45;
    if (context.focus === "endgame" && moveNumber >= 100) score += numeric(candidate.endgameValue) * 18;
    return score;
  }

  function classifyMoveQuality(candidate, baseContext) {
    const context = createContext(baseContext);
    if (invalidMove(candidate)) {
      return {
        bucket: "rejectedMoves",
        allowed: false,
        finalQualityScore: -99999,
        confidence: 0,
        reasons: ["unsafe_move"]
      };
    }

    const rankIndex = numeric(candidate.rankIndex);
    const bestScoreGap = Math.max(0, numeric(candidate.bestScoreGap));
    const baseScore = numeric(candidate.adjustedScore ?? candidate.combinedScore);
    const finalQualityScore = Math.round(scoreCandidate(candidate, context) + baseScore * (context.increasePrecision ? 0.18 : 0.08));
    const confidence = clamp(
      Number((context.confidenceBase - Math.min(0.42, bestScoreGap / 220) - rankIndex * context.confidenceDrop).toFixed(3)),
      0.18,
      0.96
    );

    let bucket = "acceptableMoves";
    if (rankIndex === 0 && bestScoreGap <= 8) bucket = "bestMove";
    else if (rankIndex <= 1 && bestScoreGap <= 32) bucket = "strongMoves";
    else if (rankIndex <= 2 && bestScoreGap <= 72) bucket = "goodMoves";
    else if (bestScoreGap <= 150) bucket = "acceptableMoves";
    else bucket = "weakButLegalMoves";
    if (candidate.verifiedUrgent && bucket === "weakButLegalMoves") bucket = "acceptableMoves";
    if (candidate.coherentClass === "coherentTactical" && bucket === "weakButLegalMoves" && bestScoreGap <= 190) bucket = "acceptableMoves";

    const reasons = [];
    if (bucket === "bestMove") reasons.push("best_move");
    if (bucket === "strongMoves") reasons.push("strong_move");
    if (bucket === "goodMoves") reasons.push("good_move");
    if (bucket === "acceptableMoves") reasons.push("acceptable_move");
    if (bucket === "weakButLegalMoves") reasons.push("weak_but_legal");
    if (context.reducePrecision) reasons.push("reduced_precision");
    if (context.increasePrecision) reasons.push("increased_precision");

    return {
      bucket,
      allowed: bucket !== "rejectedMoves",
      finalQualityScore,
      confidence,
      reasons,
      context
    };
  }

  function rankCandidates(candidates, baseContext) {
    const context = createContext(baseContext);
    const sorted = (Array.isArray(candidates) ? candidates : [])
      .slice()
      .sort(compareBaseStrength);
    const bestScore = numeric(sorted[0]?.adjustedScore ?? sorted[0]?.combinedScore);
    const groups = {
      bestMove: [],
      strongMoves: [],
      goodMoves: [],
      acceptableMoves: [],
      weakButLegalMoves: [],
      rejectedMoves: []
    };

    const ranked = sorted.map((candidate, index) => {
      const decorated = {
        ...candidate,
        rankIndex: index,
        bestScoreGap: bestScore - numeric(candidate.adjustedScore ?? candidate.combinedScore)
      };
      const quality = classifyMoveQuality(decorated, context);
      const item = {
        ...decorated,
        moveQualityBucket: quality.bucket,
        moveQualityScore: quality.finalQualityScore,
        confidence: quality.confidence,
        moveQualityReasons: quality.reasons
      };
      groups[quality.bucket].push(item);
      return item;
    });

    return {
      context,
      ranked,
      groups
    };
  }

  function chooseMoveByQuality(candidates, baseContext) {
    const rankedResult = Array.isArray(candidates?.ranked) && candidates?.groups
      ? candidates
      : rankCandidates(candidates, baseContext);
    const { context, groups } = rankedResult;
    const mode = baseContext?.difficultySettings?.releaseDifficultyMode || "adaptive";
    if (isMaxStrengthMode(mode)) {
      return (rankedResult.ranked || [])
        .filter(candidate => candidate.moveQualityBucket !== "rejectedMoves")
        .sort(compareBaseStrength)[0] || null;
    }
    const hasAcceptableOrBetter = groups.bestMove.length + groups.strongMoves.length + groups.goodMoves.length + groups.acceptableMoves.length > 0;
    let pools;
    if (mode === "advanced") {
      pools = [...groups.bestMove, ...groups.strongMoves, ...groups.goodMoves.filter(candidate => numeric(candidate.bestScoreGap) <= 20)];
    } else if (mode === "basic") {
      pools = [...groups.strongMoves, ...groups.goodMoves, ...groups.bestMove, ...groups.acceptableMoves.filter(candidate => numeric(candidate.bestScoreGap) <= 36)];
    } else if (mode === "beginner") {
      pools = [...groups.goodMoves, ...groups.acceptableMoves, ...groups.strongMoves, ...groups.bestMove];
    } else {
      pools = context.increasePrecision
        ? [...groups.bestMove, ...groups.strongMoves, ...groups.goodMoves]
        : context.reducePrecision
          ? [...groups.goodMoves, ...groups.acceptableMoves, ...groups.strongMoves]
          : [...groups.strongMoves, ...groups.goodMoves, ...groups.bestMove, ...groups.acceptableMoves];
    }
    if (!pools.length && !hasAcceptableOrBetter) pools = groups.weakButLegalMoves.slice(0, 1);

    const filtered = pools
      .filter(candidate => candidate.moveQualityBucket !== "rejectedMoves")
      .sort((a, b) => b.moveQualityScore - a.moveQualityScore);
    if (!filtered.length) return null;

    const capped = filtered.slice(0, Math.max(2, context.candidateDiversity));
    const targetIndex = clamp(Math.round(context.targetMoveRank) - 1, 0, capped.length - 1);
    const precisionFloor = numeric(capped[0].moveQualityScore) - (context.reducePrecision ? 42 : 26);
    const safePool = capped.filter(candidate => numeric(candidate.moveQualityScore) >= precisionFloor);
    return safePool.find(candidate => candidate.rankIndex === targetIndex)
      || safePool.find(candidate => candidate.moveQualityBucket === "goodMoves" && context.reducePrecision)
      || safePool.find(candidate => candidate.moveQualityBucket === "acceptableMoves" && context.reducePrecision)
      || safePool[0]
      || capped[0];
  }

  function explainMoveQuality(candidate) {
    if (!candidate) return "No move selected.";
    return `Bucket ${candidate.moveQualityBucket}, confidence ${Math.round(numeric(candidate.confidence) * 100)}%, rank ${numeric(candidate.rankIndex) + 1}.`;
  }

  return {
    classifyMoveQuality,
    rankCandidates,
    chooseMoveByQuality,
    smoothStrengthAdjustment,
    explainMoveQuality
  };
}));
