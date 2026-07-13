(function (root, factory) {
  const api = factory(root.GoKidCoachStudentModel);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachDifficultyController = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (studentModel) {
  const defaultScores = studentModel?.defaultScores || {
    opening: 50,
    capture: 50,
    atari: 50,
    connection: 50,
    lifeDeath: 50,
    ladder: 50,
    territory: 50,
    endgame: 50,
    blunderRate: 50,
    readingDepth: 50
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeProfile(studentProfile) {
    const scores = {};
    for (const key of Object.keys(defaultScores)) {
      const value = studentProfile?.scores?.[key] ?? studentProfile?.[key];
      scores[key] = clamp(Number.isFinite(Number(value)) ? Number(value) : defaultScores[key], 0, 100);
    }
    return { scores };
  }

  function competency(scores, key) {
    const value = scores[key];
    return key === "blunderRate" ? 100 - value : value;
  }

  function weakAreasFromProfile(studentProfile, limit) {
    if (studentModel?.getWeakAreas) return studentModel.getWeakAreas(studentProfile, limit);
    const normalized = normalizeProfile(studentProfile);
    return Object.keys(defaultScores)
      .map(key => ({ area: key, strength: competency(normalized.scores, key), score: normalized.scores[key] }))
      .sort((a, b) => a.strength - b.strength)
      .slice(0, limit || 3);
  }

  function overallLevel(studentProfile) {
    if (studentModel?.getOverallLevel) return studentModel.getOverallLevel(studentProfile);
    const normalized = normalizeProfile(studentProfile);
    const keys = Object.keys(defaultScores);
    return Math.round(keys.reduce((sum, key) => sum + competency(normalized.scores, key), 0) / keys.length);
  }

  function streakBias(results) {
    const recent = Array.isArray(results) ? results.slice(0, 3) : [];
    if (recent.length === 3 && recent.every(Boolean)) return 1;
    if (recent.length === 3 && recent.every(item => !item)) return -1;
    return 0;
  }

  function winRate(results) {
    const recent = Array.isArray(results) ? results.slice(0, 8) : [];
    if (!recent.length) return 0.5;
    return recent.filter(Boolean).length / recent.length;
  }

  function getDifficultySettings(studentProfile, recentResults, companionPlan) {
    const normalized = normalizeProfile(studentProfile);
    const weakAreas = weakAreasFromProfile(normalized, 3);
    const focusArea = companionPlan?.focus || weakAreas[0]?.area || "opening";
    const overall = companionPlan?.currentStrength || overallLevel(normalized);
    const streak = streakBias(recentResults);
    const recentWinRate = winRate(recentResults);
    const pressure = clamp((recentWinRate - 0.475) * 1.4 + streak * 0.18, -0.32, 0.32);
    const strengthBias = clamp((overall - 50) / 120 + pressure, -0.45, 0.45);

    const settings = {
      targetChildWinRateMin: 0.4,
      targetChildWinRateMax: 0.55,
      suggestedAiStrength: clamp(overall * (1.06 + pressure * 0.1), 35, 95),
      focusArea,
      weakAreas: weakAreas.map(item => item.area),
      openingBookWeight: clamp(1.05 + strengthBias * 0.35, 0.9, 1.45),
      ruleEngineWeight: clamp(1.1 + strengthBias * 0.3, 0.95, 1.45),
      policyTemperature: clamp(0.32 - strengthBias * 0.08, 0.18, 0.42),
      mistakeTolerance: clamp(18 - strengthBias * 18, 10, 28),
      candidateTopK: clamp(Math.round(3 - strengthBias * 3), 1, 4),
      tacticalStrictness: clamp(1.0 + strengthBias * 0.55, 0.8, 1.35),
      endgamePrecision: clamp(0.92 + strengthBias * 0.18, 0.8, 1.08),
      randomness: clamp(0.08 - strengthBias * 0.08, 0.01, 0.14)
    };

    if (focusArea === "opening") {
      settings.openingBookWeight = clamp(settings.openingBookWeight + 0.22, 0.9, 1.6);
      settings.randomness = clamp(settings.randomness - 0.02, 0.01, 0.14);
    }
    if (focusArea === "lifeDeath" || focusArea === "capture" || focusArea === "atari" || focusArea === "ladder") {
      settings.tacticalStrictness = clamp(settings.tacticalStrictness + 0.18, 0.8, 1.45);
      settings.ruleEngineWeight = clamp(settings.ruleEngineWeight + 0.08, 0.95, 1.5);
    }
    if (focusArea === "endgame" || focusArea === "territory") {
      settings.endgamePrecision = clamp(settings.endgamePrecision + 0.08, 0.8, 1.15);
    }

    return settings;
  }

  function candidateIsReasonable(candidate) {
    if (!candidate || candidate.legal === false) return false;
    if (candidate.ruleLegal === false) return false;
    if (candidate.isSuicide || candidate.obviousGiveaway) return false;
    if (candidate.isMeaninglessFirstLine || candidate.isRandomFlyaway) return false;
    if (Number(candidate.ruleScore) <= -900) return false;
    if (!Number.isFinite(Number(candidate.combinedScore))) return false;
    return true;
  }

  function adjustedScore(candidate, difficultySettings) {
    const moveNumber = Number(candidate.moveNumber) || 0;
    const fusedPolicyScore = Number(candidate.fusedPolicyScore);
    let score = Number.isFinite(fusedPolicyScore)
      ? fusedPolicyScore + Number(candidate.midgameScore || 0) + Number(candidate.ruleScore || 0) * difficultySettings.ruleEngineWeight
      : Number(candidate.policyScore || 0) +
        Number(candidate.patternScore || 0) +
        Number(candidate.shapeScore || 0) +
        Number(candidate.fusekiScore || 0) +
        Number(candidate.tacticalScore || 0) +
        Number(candidate.josekiScore || 0) +
        Number(candidate.endgameScore || 0) +
        Number(candidate.positionScore || 0) +
        Number(candidate.midgameScore || 0) +
        Number(candidate.openingBookScore || 0) * difficultySettings.openingBookWeight +
        Number(candidate.ruleScore || 0) * difficultySettings.ruleEngineWeight;

    score += Number(candidate.tacticalPressure || 0) * 38 * difficultySettings.tacticalStrictness;
    score += Number(candidate.rescueValue || 0) * 32 * difficultySettings.tacticalStrictness;
    score += Number(candidate.connectionValue || 0) * 16;
    if (moveNumber >= 120) score += Number(candidate.endgameValue || 0) * 28 * difficultySettings.endgamePrecision;

    if (difficultySettings.focusArea === "opening" && moveNumber < 30) {
      score += Number(candidate.openingBookScore || 0) * 0.45;
    }
    if ((difficultySettings.focusArea === "lifeDeath" || difficultySettings.focusArea === "capture" || difficultySettings.focusArea === "atari")
      && Number(candidate.tacticalPressure || 0) > 0) {
      score += 55;
    }
    if (difficultySettings.focusArea === "connection" && Number(candidate.connectionValue || 0) > 0) {
      score += 30;
    }

    return score;
  }

  function adjustMoveCandidates(candidates, difficultySettings) {
    const prepared = (Array.isArray(candidates) ? candidates : [])
      .filter(candidateIsReasonable)
      .map(candidate => ({
        ...candidate,
        adjustedScore: adjustedScore(candidate, difficultySettings)
      }))
      .sort((a, b) => b.adjustedScore - a.adjustedScore);

    if (!prepared.length) return [];
    const bestScore = prepared[0].adjustedScore;
    const qualityFloor = bestScore - difficultySettings.mistakeTolerance;
    return prepared.filter((candidate, index) => {
      if (index >= Math.max(difficultySettings.candidateTopK * 2, 4)) return false;
      return candidate.adjustedScore >= qualityFloor;
    });
  }

  function weightedChoice(candidates, temperature) {
    const topScore = candidates[0].adjustedScore;
    const weights = candidates.map(candidate => Math.exp((candidate.adjustedScore - topScore) / Math.max(temperature, 0.05)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.random() * total;
    for (let i = 0; i < candidates.length; i += 1) {
      cursor -= weights[i];
      if (cursor <= 0) return candidates[i];
    }
    return candidates[0];
  }

  function chooseAdaptiveMove(candidates, difficultySettings) {
    const adjusted = candidates.length && Number.isFinite(Number(candidates[0].adjustedScore))
      ? candidates.slice()
      : adjustMoveCandidates(candidates, difficultySettings);
    if (!adjusted.length) return null;

    const capped = adjusted.slice(0, difficultySettings.candidateTopK);
    if (capped.length === 1) return capped[0];
    if (difficultySettings.randomness <= 0.015) return capped[0];
    if (Math.random() > difficultySettings.randomness) return capped[0];
    return weightedChoice(capped, difficultySettings.policyTemperature);
  }

  return {
    getDifficultySettings,
    adjustMoveCandidates,
    chooseAdaptiveMove
  };
}));
