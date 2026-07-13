(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachContextFusion = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PHASES = ["opening", "early middlegame", "middlegame", "late middlegame", "endgame"];
  const SOURCE_KEYS = [
    "openingBook",
    "policy",
    "position",
    "pattern",
    "shape",
    "fuseki",
    "tactical",
    "joseki",
    "endgame"
  ];

  const PHASE_WEIGHTS = {
    opening: {
      openingBook: 0.4,
      policy: 0.08,
      position: 0.02,
      pattern: 0.1,
      shape: 0.05,
      fuseki: 0.25,
      tactical: 0,
      joseki: 0.1,
      endgame: 0
    },
    "early middlegame": {
      openingBook: 0.14,
      policy: 0.16,
      position: 0.14,
      pattern: 0.14,
      shape: 0.1,
      fuseki: 0.18,
      tactical: 0.08,
      joseki: 0.06,
      endgame: 0
    },
    middlegame: {
      openingBook: 0.04,
      policy: 0.2,
      position: 0.22,
      pattern: 0.16,
      shape: 0.12,
      fuseki: 0.08,
      tactical: 0.14,
      joseki: 0.04,
      endgame: 0
    },
    "late middlegame": {
      openingBook: 0,
      policy: 0.14,
      position: 0.24,
      pattern: 0.15,
      shape: 0.1,
      fuseki: 0.05,
      tactical: 0.27,
      joseki: 0.05,
      endgame: 0
    },
    endgame: {
      openingBook: 0,
      policy: 0.08,
      position: 0.22,
      pattern: 0.1,
      shape: 0.05,
      fuseki: 0,
      tactical: 0.1,
      joseki: 0.05,
      endgame: 0.4
    }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function estimateTerritoryMaturity(candidate = {}, context = {}) {
    const moveNumber = numeric(context.moveNumber ?? candidate.moveNumber);
    const explicit = context.territoryMaturity ?? candidate.territoryMaturity;
    if (Number.isFinite(Number(explicit))) return clamp(Number(explicit), 0, 1);
    const endgameValue = clamp(numeric(candidate.endgameValue) / 8, 0, 1);
    const territoryValue = clamp(numeric(candidate.territoryValue) / 30, 0, 1);
    const moveCurve = clamp((moveNumber - 80) / 90, 0, 1);
    return clamp(moveCurve * 0.68 + territoryValue * 0.2 + endgameValue * 0.12, 0, 1);
  }

  function estimateGamePhase(candidate = {}, context = {}) {
    const moveNumber = numeric(context.moveNumber ?? candidate.moveNumber);
    const maturity = estimateTerritoryMaturity(candidate, context);
    if (moveNumber < 24 && maturity < 0.12) return "opening";
    if (moveNumber < 55 && maturity < 0.28) return "early middlegame";
    if (moveNumber < 95 && maturity < 0.48) return "middlegame";
    if (moveNumber < 135 && maturity < 0.78) return "late middlegame";
    return "endgame";
  }

  function estimateLocalTacticalIntensity(candidate = {}, context = {}) {
    const explicit = context.localFightIntensity ?? candidate.localFightIntensity;
    if (Number.isFinite(Number(explicit))) return clamp(Number(explicit), 0, 1);
    const tacticalPressure = clamp(numeric(candidate.tacticalPressure) / 4, 0, 1);
    const rescueValue = clamp(numeric(candidate.rescueValue) / 3, 0, 1);
    const captures = clamp(numeric(candidate.captures) / 3, 0, 1);
    const lifeDeath = clamp(numeric(candidate.lifeDeathValue) / 4, 0, 1);
    const ladder = clamp(numeric(candidate.ladderValue) / 3, 0, 1);
    const libertyRisk = clamp((3 - numeric(candidate.ownLiberties, 3)) / 2, 0, 1);
    return clamp(
      tacticalPressure * 0.28 +
      rescueValue * 0.18 +
      captures * 0.16 +
      lifeDeath * 0.16 +
      ladder * 0.12 +
      libertyRisk * 0.1,
      0,
      1
    );
  }

  function estimateUnsettledGroups(candidate = {}, context = {}) {
    const explicit = context.unsettledGroups ?? candidate.unsettledGroups;
    if (Number.isFinite(Number(explicit))) return clamp(Number(explicit), 0, 12);
    return clamp(
      numeric(candidate.tacticalPressure) +
      numeric(candidate.rescueValue) +
      Math.max(0, 3 - numeric(candidate.ownLiberties, 3)) +
      numeric(candidate.lifeDeathValue) * 0.5,
      0,
      12
    );
  }

  function estimateBoardStability(candidate = {}, context = {}) {
    const explicit = context.boardStability ?? candidate.boardStability;
    if (Number.isFinite(Number(explicit))) return clamp(Number(explicit), 0, 1);
    const intensity = estimateLocalTacticalIntensity(candidate, context);
    const maturity = estimateTerritoryMaturity(candidate, context);
    const unsettled = clamp(estimateUnsettledGroups(candidate, context) / 8, 0, 1);
    const stability = 0.42 + maturity * 0.38 - intensity * 0.34 - unsettled * 0.22;
    return clamp(stability, 0, 1);
  }

  function estimateEndgameReadiness(candidate = {}, context = {}) {
    const moveNumber = numeric(context.moveNumber ?? candidate.moveNumber);
    const maturity = estimateTerritoryMaturity(candidate, context);
    const stability = estimateBoardStability(candidate, context);
    const unsettled = clamp(estimateUnsettledGroups(candidate, context) / 8, 0, 1);
    const emptyRatio = Number.isFinite(Number(context.emptyIntersectionRatio ?? candidate.emptyIntersectionRatio))
      ? clamp(Number(context.emptyIntersectionRatio ?? candidate.emptyIntersectionRatio), 0, 1)
      : null;
    const settledRatio = Number.isFinite(Number(context.settledGroupRatio ?? candidate.settledGroupRatio))
      ? clamp(Number(context.settledGroupRatio ?? candidate.settledGroupRatio), 0, 1)
      : null;
    const moveCurve = clamp((moveNumber - 105) / 65, 0, 1);
    const emptyCurve = emptyRatio === null ? 0.45 : clamp((0.42 - emptyRatio) / 0.24, 0, 1);
    const settledCurve = settledRatio === null ? stability : settledRatio;
    return clamp(
      moveCurve * 0.32 +
      maturity * 0.28 +
      stability * 0.14 +
      emptyCurve * 0.14 +
      settledCurve * 0.12 -
      unsettled * 0.22,
      0,
      1
    );
  }

  function normalizeWeights(weights) {
    let total = 0;
    for (const key of SOURCE_KEYS) {
      weights[key] = Math.max(0, numeric(weights[key]));
      total += weights[key];
    }
    if (total <= 0) {
      weights.policy = 1;
      total = 1;
    }
    for (const key of SOURCE_KEYS) weights[key] = weights[key] / total;
    return weights;
  }

  function generateDynamicWeights(candidate = {}, context = {}) {
    const phase = PHASES.includes(context.gamePhase) ? context.gamePhase : estimateGamePhase(candidate, context);
    const weights = { ...PHASE_WEIGHTS[phase] };
    const intensity = estimateLocalTacticalIntensity(candidate, context);
    const stability = estimateBoardStability(candidate, context);
    const maturity = estimateTerritoryMaturity(candidate, context);
    const unsettled = clamp(estimateUnsettledGroups(candidate, context) / 8, 0, 1);
    const childStrength = clamp(numeric(context.childStrengthEstimate ?? context.companionPlan?.currentStrength ?? context.difficultySettings?.currentStrengthEstimate ?? 50), 0, 100);
    const aiCalibration = clamp(numeric(context.aiCalibrationLevel ?? context.difficultySettings?.suggestedAiStrength ?? context.companionPlan?.targetAiStrength ?? 55), 0, 100);
    const precision = clamp((aiCalibration - childStrength + 12) / 30, 0, 1);
    weights.tactical += intensity * (0.16 + precision * 0.08) + unsettled * 0.05;
    weights.position += stability * 0.08 + maturity * 0.05;
    weights.endgame += maturity * (0.16 + precision * 0.04);
    weights.shape += (1 - stability) * 0.04 + (1 - precision) * 0.03;
    weights.pattern += (1 - maturity) * 0.05;
    weights.openingBook *= clamp(1.12 - intensity * 0.55 - maturity * 0.85, 0, 1.25);
    weights.fuseki *= clamp(1.08 - maturity * 0.8 + stability * 0.12, 0, 1.25);
    weights.joseki *= clamp(1.05 - maturity * 0.55, 0.35, 1.15);
    if (intensity > 0.45 || unsettled > 0.35) weights.tactical += Math.max(intensity, unsettled) * 0.12;

    return normalizeWeights(weights);
  }

  function sourceScores(candidate = {}) {
    return {
      openingBook: numeric(candidate.openingBookScore),
      policy: numeric(candidate.policyScore),
      position: numeric(candidate.positionScore),
      pattern: numeric(candidate.patternScore),
      shape: numeric(candidate.shapeScore),
      fuseki: numeric(candidate.fusekiScore),
      tactical: numeric(candidate.tacticalScore),
      joseki: numeric(candidate.josekiScore),
      endgame: numeric(candidate.endgameScore)
    };
  }

  function fusePolicyScore(candidate = {}, context = {}) {
    if (candidate.legal === false || candidate.ruleLegal === false || numeric(candidate.ruleScore) <= -900) {
      return {
        fusedPolicyScore: -99999,
        weights: normalizeWeights({ policy: 1 }),
        phase: estimateGamePhase(candidate, context),
        localTacticalIntensity: 0,
      boardStability: 0,
      territoryMaturity: 0,
      endgameReadiness: 0,
      unsettledGroups: 0
      };
    }

    const weights = generateDynamicWeights(candidate, context);
    const scores = sourceScores(candidate);
    const confidence = clamp(numeric(candidate.confidence, 0.5), 0, 1);
    const confidenceScale = 0.9 + confidence * 0.2;
    let fused = 0;

    for (const key of SOURCE_KEYS) {
      fused += scores[key] * weights[key] * SOURCE_KEYS.length;
    }

    const phase = estimateGamePhase(candidate, context);
    const localTacticalIntensity = estimateLocalTacticalIntensity(candidate, context);
    const boardStability = estimateBoardStability(candidate, context);
    const territoryMaturity = estimateTerritoryMaturity(candidate, context);
    const endgameReadiness = estimateEndgameReadiness(candidate, context);
    const unsettledGroups = estimateUnsettledGroups(candidate, context);

    return {
      fusedPolicyScore: Number((fused * confidenceScale).toFixed(3)),
      weights,
      phase,
      localTacticalIntensity: Number(localTacticalIntensity.toFixed(3)),
      boardStability: Number(boardStability.toFixed(3)),
      territoryMaturity: Number(territoryMaturity.toFixed(3)),
      endgameReadiness: Number(endgameReadiness.toFixed(3)),
      unsettledGroups: Number(unsettledGroups.toFixed(3))
    };
  }

  function fuseCandidate(candidate = {}, context = {}) {
    const fusion = fusePolicyScore(candidate, context);
    if (fusion.fusedPolicyScore <= -900) {
      return {
        ...candidate,
        fusedPolicyScore: fusion.fusedPolicyScore,
        contextFusion: fusion
      };
    }
    const ruleScore = numeric(candidate.ruleScore);
    const midgameScore = numeric(candidate.midgameScore);
    return {
      ...candidate,
      fusedPolicyScore: fusion.fusedPolicyScore,
      contextFusion: fusion,
      combinedScore: Number((ruleScore + fusion.fusedPolicyScore + midgameScore).toFixed(3))
    };
  }

  return {
    estimateGamePhase,
    estimateLocalTacticalIntensity,
    estimateBoardStability,
    estimateEndgameReadiness,
    generateDynamicWeights,
    fusePolicyScore,
    fuseCandidate
  };
}));
