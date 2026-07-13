(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachStudentModel = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const storagePrefix = "gokidcoach-student-model-v1:";
  const defaultScores = {
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
  const scoreKeys = Object.keys(defaultScores);
  let memoryStore = Object.create(null);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getStorage() {
    try {
      if (typeof localStorage !== "undefined") return localStorage;
    } catch {
      // Safari private mode or unavailable storage falls back to memory.
    }
    return {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
      },
      setItem(key, value) {
        memoryStore[key] = String(value);
      },
      removeItem(key) {
        delete memoryStore[key];
      }
    };
  }

  function storageKey(childId) {
    return `${storagePrefix}${childId || "default"}`;
  }

  function normalizedScore(value, fallback) {
    return clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100);
  }

  function normalizeRecentResults(results) {
    return Array.isArray(results) ? results.map(Boolean).slice(0, 20) : [];
  }

  function normalizeProfile(profile, childId) {
    const source = profile && typeof profile === "object" ? profile : {};
    const scores = {};
    for (const key of scoreKeys) {
      scores[key] = normalizedScore(source.scores?.[key] ?? source[key], defaultScores[key]);
    }
    return {
      childId: String(source.childId || childId || "default"),
      gamesPlayed: Math.max(0, Math.floor(Number(source.gamesPlayed) || 0)),
      recentResults: normalizeRecentResults(source.recentResults),
      scores,
      updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
      lastGame: source.lastGame && typeof source.lastGame === "object" ? source.lastGame : null
    };
  }

  function loadStudentProfile(childId) {
    const id = String(childId || "default");
    try {
      const raw = getStorage().getItem(storageKey(id));
      if (!raw) return normalizeProfile({}, id);
      return normalizeProfile(JSON.parse(raw), id);
    } catch {
      return normalizeProfile({}, id);
    }
  }

  function saveStudentProfile(profile, childId) {
    const normalized = normalizeProfile(profile, childId);
    normalized.updatedAt = new Date().toISOString();
    try {
      getStorage().setItem(storageKey(normalized.childId), JSON.stringify(normalized));
    } catch {
      // Keep the current session usable even if persistence fails.
    }
    return normalized;
  }

  function clearStudentProfile(childId) {
    try {
      getStorage().removeItem(storageKey(String(childId || "default")));
    } catch {
      // Ignore unavailable storage.
    }
  }

  function mix(current, next, weight) {
    return clamp(Math.round(current * (1 - weight) + next * weight), 0, 100);
  }

  function signal(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? clamp(number, 0, 100) : fallback;
  }

  function deriveSignals(gameRecord) {
    const analysis = gameRecord?.analysis || {};
    const metrics = gameRecord?.studentSignals || {};
    return {
      opening: signal(metrics.opening, signal(analysis.openingScore, 50)),
      capture: signal(metrics.capture, clamp(50 + (Number(gameRecord?.blackCaptures) || 0) * 6 - (Number(gameRecord?.whiteCaptures) || 0) * 3, 0, 100)),
      atari: signal(metrics.atari, signal(analysis.fightingScore, 50)),
      connection: signal(metrics.connection, signal(analysis.completionScore, 50)),
      lifeDeath: signal(metrics.lifeDeath, clamp(Math.round(signal(analysis.fightingScore, 50) * 0.7 + signal(metrics.connection, 50) * 0.3), 0, 100)),
      ladder: signal(metrics.ladder, clamp(Math.round(signal(metrics.readingDepth, 50) * 0.55 + signal(analysis.fightingScore, 50) * 0.45), 0, 100)),
      territory: signal(metrics.territory, clamp(50 + Math.round((Number(gameRecord?.territoryBlack) || 0) - (Number(gameRecord?.territoryWhite) || 0)) * 2, 0, 100)),
      endgame: signal(metrics.endgame, signal(analysis.completionScore, 50)),
      blunderRate: signal(metrics.blunderRate, clamp(50 + (Number(gameRecord?.whiteCaptures) || 0) * 5 - (Number(gameRecord?.blackCaptures) || 0) * 2, 0, 100)),
      readingDepth: signal(metrics.readingDepth, clamp(Math.round(signal(analysis.performance, 50) * 0.45 + signal(analysis.fightingScore, 50) * 0.55), 0, 100))
    };
  }

  function updateProfileFromGame(gameRecord, existingProfile) {
    const childId = String(gameRecord?.childId || existingProfile?.childId || "default");
    const profile = normalizeProfile(existingProfile || loadStudentProfile(childId), childId);
    const nextSignals = deriveSignals(gameRecord);
    const weights = {
      opening: 0.24,
      capture: 0.25,
      atari: 0.24,
      connection: 0.22,
      lifeDeath: 0.24,
      ladder: 0.18,
      territory: 0.2,
      endgame: 0.18,
      blunderRate: 0.28,
      readingDepth: 0.18
    };

    for (const key of scoreKeys) {
      profile.scores[key] = mix(profile.scores[key], nextSignals[key], weights[key]);
    }

    profile.gamesPlayed += 1;
    profile.recentResults.unshift(Boolean(gameRecord?.childWon));
    profile.recentResults = profile.recentResults.slice(0, 20);
    profile.lastGame = {
      moveCount: Math.max(0, Number(gameRecord?.moveCount) || 0),
      childWon: Boolean(gameRecord?.childWon),
      performance: signal(gameRecord?.analysis?.performance, 50),
      updatedAt: new Date().toISOString()
    };
    return saveStudentProfile(profile, childId);
  }

  function areaStrength(scores, key) {
    const value = normalizedScore(scores?.[key], defaultScores[key]);
    return key === "blunderRate" ? 100 - value : value;
  }

  function getWeakAreas(profile, limit) {
    const normalized = normalizeProfile(profile, profile?.childId || "default");
    const count = Math.max(1, Math.floor(Number(limit) || 3));
    return scoreKeys
      .map(key => ({
        area: key,
        score: normalized.scores[key],
        strength: areaStrength(normalized.scores, key)
      }))
      .sort((a, b) => a.strength - b.strength || a.score - b.score)
      .slice(0, count);
  }

  function getOverallLevel(profile) {
    const normalized = normalizeProfile(profile, profile?.childId || "default");
    const total = scoreKeys.reduce((sum, key) => sum + areaStrength(normalized.scores, key), 0);
    return Math.round(total / scoreKeys.length);
  }

  return {
    storagePrefix,
    defaultScores,
    loadStudentProfile,
    saveStudentProfile,
    updateProfileFromGame,
    getWeakAreas,
    getOverallLevel,
    clearStudentProfile
  };
}));
