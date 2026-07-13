(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachMidgameStability = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function pointKey(point) {
    return `${point.x},${point.y}`;
  }

  function libertyPoints(group) {
    const liberties = group?.group?.liberties || group?.liberties || new Set();
    return Array.from(liberties).map(value => {
      const [x, y] = String(value).split(",").map(Number);
      return { x, y };
    });
  }

  function moveTouchesGroup(move, group) {
    const point = move?.point || move;
    return libertyPoints(group).some(liberty => liberty.x === point.x && liberty.y === point.y);
  }

  function evaluateSacrificeValue(group, board, positionEval) {
    void board;
    if (!group) return 0;
    const size = numeric(group.size || group.group?.stones?.length);
    const liberties = numeric(group.liberties);
    const territoryLead = numeric(positionEval?.scoreLead);
    const thicknessLead = numeric(positionEval?.thicknessLead);
    let score = 0;
    if (size <= 2) score += 40;
    if (size === 3) score += 14;
    if (liberties <= 1) score += 22;
    if (liberties === 2) score += 8;
    if (territoryLead > 0) score += territoryLead * 4;
    if (thicknessLead > 0) score += thicknessLead * 2;
    if (size >= 5) score -= 60;
    if (size >= 8) score -= 120;
    return Math.round(score);
  }

  function shouldSaveGroup(group, board, positionEval) {
    void board;
    if (!group) return false;
    const size = numeric(group.size || group.group?.stones?.length);
    const liberties = numeric(group.liberties);
    const territoryLead = numeric(positionEval?.scoreLead);
    const thicknessLead = numeric(positionEval?.thicknessLead);
    if (liberties <= 1 && size >= 3) return true;
    if (size >= 6) return true;
    if (territoryLead < -3 && liberties <= 2) return true;
    if (thicknessLead < -4 && liberties <= 2) return true;
    return evaluateSacrificeValue(group, board, positionEval) < 0;
  }

  function smoothPositionEvaluation(currentEval, previousEval) {
    if (!currentEval) return null;
    if (!previousEval) {
      return {
        ...currentEval,
        smoothedScoreLead: numeric(currentEval.scoreLead),
        smoothedThicknessLead: numeric(currentEval.thicknessLead)
      };
    }
    const smoothedScoreLead = numeric(previousEval.smoothedScoreLead ?? previousEval.scoreLead) * 0.65 + numeric(currentEval.scoreLead) * 0.35;
    const smoothedThicknessLead = numeric(previousEval.smoothedThicknessLead ?? previousEval.thicknessLead) * 0.65 + numeric(currentEval.thicknessLead) * 0.35;
    return {
      ...currentEval,
      smoothedScoreLead: Math.round(smoothedScoreLead * 10) / 10,
      smoothedThicknessLead: Math.round(smoothedThicknessLead * 10) / 10
    };
  }

  function evaluateUrgency(move, board, positionEval) {
    void board;
    if (!move || move.ruleLegal === false || move.legal === false || move.isSuicide || move.obviousGiveaway) return -99999;
    const ownWeakGroups = positionEval?.groups?.ownWeakGroups || [];
    const enemyWeakGroups = positionEval?.groups?.enemyWeakGroups || [];
    const ownCuts = positionEval?.groups?.ownCutPoints || [];
    let urgency = 0;

    for (const group of ownWeakGroups) {
      if (!moveTouchesGroup(move, group)) continue;
      urgency += shouldSaveGroup(group, board, positionEval) ? 150 + numeric(group.size) * 10 : 28;
    }
    for (const group of enemyWeakGroups) {
      if (!moveTouchesGroup(move, group)) continue;
      urgency += 70 + Math.max(0, 3 - numeric(group.liberties)) * 16;
    }
    for (const cut of ownCuts) {
      const point = move.point || move;
      if (cut.point.x === point.x && cut.point.y === point.y) urgency += 95 + numeric(cut.urgency) * 20;
    }
    return Math.round(urgency);
  }

  function balanceTerritoryAndInfluence(move, board, positionEval) {
    void board;
    if (!move) return 0;
    const scoreLead = numeric(positionEval?.smoothedScoreLead ?? positionEval?.scoreLead);
    const thicknessLead = numeric(positionEval?.smoothedThicknessLead ?? positionEval?.thicknessLead);
    let score = 0;

    if (scoreLead > 2) {
      score += numeric(move.territoryValue) * 18;
      score += numeric(move.connectionValue) * 12;
      score -= numeric(move.tacticalPressure) * 10;
      if (numeric(move.ownLiberties) <= 2) score -= 36;
    } else if (scoreLead < -2) {
      score += numeric(move.tacticalPressure) * 16;
      score += numeric(move.cutOpportunity) * 12;
      score += numeric(move.lifeDeathValue) * 10;
    }

    if (thicknessLead < -3) {
      score += numeric(move.connectionValue) * 22;
      score += numeric(move.rescueValue) * 18;
      score += numeric(move.positionScore) * 0.04;
    } else if (thicknessLead > 3) {
      score += numeric(move.territoryValue) * 10;
      score -= numeric(move.cutOpportunity) * 4;
    }
    return Math.round(score);
  }

  function scoreMidgameMove(move, board, context) {
    if (!move || move.ruleLegal === false || move.legal === false || move.isSuicide || move.obviousGiveaway) return -99999;
    const positionEval = context?.positionEval;
    const urgency = evaluateUrgency(move, board, positionEval);
    if (urgency <= -99999) return urgency;
    const ownWeakGroups = positionEval?.groups?.ownWeakGroups || [];
    const mustSaveGroups = ownWeakGroups.filter(group => shouldSaveGroup(group, board, positionEval));
    const touchesMustSave = mustSaveGroups.some(group => moveTouchesGroup(move, group));
    let score = urgency;
    score += balanceTerritoryAndInfluence(move, board, positionEval);
    score += numeric(move.positionScore) * 0.08;

    for (const group of ownWeakGroups) {
      if (moveTouchesGroup(move, group)) {
        score -= Math.max(0, evaluateSacrificeValue(group, board, positionEval)) * 0.45;
      }
    }

    if (mustSaveGroups.length && !touchesMustSave && numeric(move.tacticalPressure) === 0) {
      score -= 120;
    }
    if (numeric(move.ownLiberties) <= 1 && numeric(move.captures) === 0) score -= 80;
    if (move.isMeaninglessFirstLine) score -= 80;
    if (move.isRandomFlyaway) score -= 70;
    return Math.round(score);
  }

  function explainMidgameDecision(move, context) {
    if (!move) return "No midgame decision available.";
    const positionEval = context?.positionEval;
    const ownWeak = positionEval?.groups?.ownWeakGroups?.length || 0;
    const mustSave = (positionEval?.groups?.ownWeakGroups || []).filter(group => shouldSaveGroup(group, null, positionEval)).length;
    return `Midgame score ${numeric(move.midgameScore)}, weak groups ${ownWeak}, must-save ${mustSave}, territory ${numeric(positionEval?.smoothedScoreLead ?? positionEval?.scoreLead)}.`;
  }

  return {
    evaluateSacrificeValue,
    shouldSaveGroup,
    evaluateUrgency,
    smoothPositionEvaluation,
    balanceTerritoryAndInfluence,
    scoreMidgameMove,
    explainMidgameDecision
  };
}));
