(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachPositionEvaluator = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const empty = 0;
  const black = 1;
  const white = 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function numeric(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function opponent(color) {
    return color === black ? white : black;
  }

  function neighbors(point, size) {
    const list = [];
    if (point.x > 0) list.push({ x: point.x - 1, y: point.y });
    if (point.x + 1 < size) list.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) list.push({ x: point.x, y: point.y - 1 });
    if (point.y + 1 < size) list.push({ x: point.x, y: point.y + 1 });
    return list;
  }

  function pointKey(point) {
    return `${point.x},${point.y}`;
  }

  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  function groupAt(board, start) {
    const size = board.length;
    const color = board[start.y][start.x];
    if (color === empty) return { stones: [], liberties: new Set() };

    const seen = new Set();
    const stones = [];
    const liberties = new Set();
    const stack = [start];

    while (stack.length) {
      const point = stack.pop();
      const key = pointKey(point);
      if (seen.has(key)) continue;
      seen.add(key);
      stones.push(point);

      for (const next of neighbors(point, size)) {
        const value = board[next.y][next.x];
        if (value === empty) liberties.add(pointKey(next));
        if (value === color) stack.push(next);
      }
    }

    return { stones, liberties };
  }

  function collectGroups(board, color) {
    const seen = new Set();
    const groups = [];
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] !== color) continue;
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        const group = groupAt(board, { x, y });
        for (const stone of group.stones) seen.add(pointKey(stone));
        groups.push(group);
      }
    }
    return groups;
  }

  function libertyPoints(group) {
    return Array.from(group.liberties).map(value => {
      const [x, y] = value.split(",").map(Number);
      return { x, y };
    });
  }

  function simulateMove(board, point, color) {
    const size = board.length;
    if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) {
      return { legal: false, reason: "out_of_bounds" };
    }
    if (board[point.y][point.x] !== empty) {
      return { legal: false, reason: "occupied" };
    }
    const nextBoard = cloneBoard(board);
    nextBoard[point.y][point.x] = color;
    let captures = 0;

    for (const next of neighbors(point, size)) {
      if (nextBoard[next.y][next.x] !== opponent(color)) continue;
      const group = groupAt(nextBoard, next);
      if (group.liberties.size !== 0) continue;
      captures += group.stones.length;
      for (const stone of group.stones) nextBoard[stone.y][stone.x] = empty;
    }

    const ownGroup = groupAt(nextBoard, point);
    if (ownGroup.liberties.size === 0) {
      return { legal: false, reason: "suicide" };
    }

    return {
      legal: true,
      board: nextBoard,
      captures,
      ownGroup
    };
  }

  function detectWeakGroups(board, player) {
    return collectGroups(board, player)
      .filter(group => group.liberties.size <= 2)
      .map(group => ({
        group,
        liberties: group.liberties.size,
        size: group.stones.length,
        anchor: group.stones.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0]
      }))
      .sort((a, b) => a.liberties - b.liberties || a.size - b.size);
  }

  function detectCutPoints(board, player) {
    const size = board.length;
    const cuts = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (board[y][x] !== empty) continue;
        const point = { x, y };
        const groups = new Map();
        for (const next of neighbors(point, size)) {
          if (board[next.y][next.x] !== player) continue;
          const group = groupAt(board, next);
          groups.set(pointKey(group.stones[0]), group);
        }
        if (groups.size >= 2) {
          cuts.push({
            point,
            connectedGroups: groups.size,
            urgency: Array.from(groups.values()).some(group => group.liberties.size <= 2) ? 2 : 1
          });
        }
      }
    }
    return cuts.sort((a, b) => b.urgency - a.urgency || b.connectedGroups - a.connectedGroups);
  }

  function estimateTerritory(board) {
    const visited = new Set();
    const territory = { black: 0, white: 0, neutral: 0 };

    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] !== empty) continue;
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        const region = [];
        const borders = new Set();
        const stack = [{ x, y }];
        while (stack.length) {
          const point = stack.pop();
          const pointId = pointKey(point);
          if (visited.has(pointId)) continue;
          visited.add(pointId);
          region.push(point);

          for (const next of neighbors(point, board.length)) {
            const value = board[next.y][next.x];
            if (value === empty) stack.push(next);
            if (value === black) borders.add(black);
            if (value === white) borders.add(white);
          }
        }

        if (borders.size === 1 && borders.has(black)) territory.black += region.length;
        else if (borders.size === 1 && borders.has(white)) territory.white += region.length;
        else territory.neutral += region.length;
      }
    }
    return territory;
  }

  function estimateInfluence(board, player) {
    let total = 0;
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] !== empty) continue;
        let pointInfluence = 0;
        for (let py = Math.max(0, y - 4); py <= Math.min(board.length - 1, y + 4); py += 1) {
          for (let px = Math.max(0, x - 4); px <= Math.min(board.length - 1, x + 4); px += 1) {
            const value = board[py][px];
            if (value === empty) continue;
            const distance = Math.abs(px - x) + Math.abs(py - y);
            if (distance === 0 || distance > 4) continue;
            const weight = 4.5 / distance;
            pointInfluence += value === player ? weight : -weight * 0.9;
          }
        }
        total += pointInfluence;
      }
    }
    return Math.round(total * 10) / 10;
  }

  function boardEmptyRatio(board) {
    let emptyCount = 0;
    let total = 0;
    for (const row of board) {
      for (const value of row) {
        total += 1;
        if (value === empty) emptyCount += 1;
      }
    }
    return emptyCount / Math.max(1, total);
  }

  function pointRegion(point, size) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    if (edge <= 2) {
      return (point.x <= 2 || point.x >= size - 3) && (point.y <= 2 || point.y >= size - 3) ? "corner" : "edge";
    }
    if (edge <= 4) return "side";
    return "center";
  }

  function isSafeGroup(group) {
    return group && (group.liberties.size >= 4 || (group.liberties.size >= 3 && group.stones.length >= 4));
  }

  function adjacentGroups(board, point, color) {
    const groups = [];
    const seen = new Set();
    for (const next of neighbors(point, board.length)) {
      if (board[next.y][next.x] !== color) continue;
      const group = groupAt(board, next);
      const anchor = group.stones.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
      const key = pointKey(anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(group);
    }
    return groups;
  }

  function localEmptyCount(board, point, radius = 2) {
    let count = 0;
    for (let y = Math.max(0, point.y - radius); y <= Math.min(board.length - 1, point.y + radius); y += 1) {
      for (let x = Math.max(0, point.x - radius); x <= Math.min(board.length - 1, point.x + radius); x += 1) {
        if (board[y][x] === empty) count += 1;
      }
    }
    return count;
  }

  function countAdjacentColors(board, point, player) {
    let own = 0;
    let enemy = 0;
    let blanks = 0;
    for (const next of neighbors(point, board.length)) {
      const value = board[next.y][next.x];
      if (value === player) own += 1;
      else if (value === opponent(player)) enemy += 1;
      else blanks += 1;
    }
    return { own, enemy, blanks };
  }

  function classifyEndgameMove(move, board, currentPlayer) {
    const point = move.point || move;
    const moveNumber = numeric(move.moveNumber);
    const emptyRatio = boardEmptyRatio(board);
    const lateGame = moveNumber >= 120 || emptyRatio <= 0.34 || numeric(move.endgameValue) > 0;
    const simulated = simulateMove(board, point, currentPlayer);
    if (!lateGame || !simulated.legal) {
      return {
        lateGame,
        category: "not_endgame",
        value: 0,
        dame: false,
        redundantReinforcement: false,
        necessaryConnection: false,
        sentePotential: false,
        largeYose: false,
        boundaryCompletion: 0
      };
    }

    const ownGroups = adjacentGroups(board, point, currentPlayer);
    const enemyGroups = adjacentGroups(board, point, opponent(currentPlayer));
    const colors = countAdjacentColors(board, point, currentPlayer);
    const region = pointRegion(point, board.length);
    const edge = Math.min(point.x, point.y, board.length - 1 - point.x, board.length - 1 - point.y);
    const endangeredOwn = ownGroups.filter(group => group.liberties.size <= 2).length;
    const threatenedEnemy = enemyGroups.filter(group => group.liberties.size <= 2).length;
    const safeAdjacentOwn = ownGroups.filter(isSafeGroup).length;
    const connectsMultiple = ownGroups.length >= 2;
    const necessaryConnection = connectsMultiple && ownGroups.some(group => group.liberties.size <= 3);
    const redundantReinforcement = ownGroups.length === 1 && safeAdjacentOwn === 1 && enemyGroups.length === 0 && simulated.captures === 0;
    const neutral = colors.own === 0 && colors.enemy === 0 && simulated.captures === 0;
    const dame = neutral || (region === "center" && colors.enemy === 0 && colors.own <= 1 && localEmptyCount(board, point, 2) >= 8 && simulated.captures === 0);
    const sentePotential = simulated.captures > 0 || threatenedEnemy > 0 || endangeredOwn > 0;
    const boundaryCompletion = Math.max(0, colors.own + colors.enemy - colors.blanks) + (region === "corner" ? 2 : region === "edge" ? 1.5 : region === "side" ? 0.8 : 0);
    let edgeCornerYose = region === "corner" ? 12 - edge * 1.6 : region === "edge" ? 8 - edge : region === "side" ? 5 : 0;
    if (edge === 0 && colors.own + colors.enemy < 2 && simulated.captures === 0) edgeCornerYose = -10;
    const territoryDelta = Math.max(0, numeric(move.territoryValue) * 1.4 + boundaryCompletion * 4 + edgeCornerYose);
    const largeYose = territoryDelta >= 14 || (region === "corner" && colors.own + colors.enemy >= 2);

    let category = "small_territory_gain";
    if (sentePotential) category = "urgent_sente_yose";
    else if (necessaryConnection) category = "necessary_connection";
    else if (largeYose) category = "large_gote_yose";
    else if (dame) category = "dame";
    else if (redundantReinforcement) category = "redundant_reinforcement";

    let value = 0;
    if (category === "urgent_sente_yose") value += 88 + simulated.captures * 40 + threatenedEnemy * 24 + endangeredOwn * 30;
    if (category === "large_gote_yose") value += 52 + territoryDelta * 1.8;
    if (category === "necessary_connection") value += 48 + ownGroups.length * 12;
    if (category === "small_territory_gain") value += 18 + territoryDelta;
    if (category === "dame") value -= 64;
    if (category === "redundant_reinforcement") value -= 46;
    if (redundantReinforcement && !necessaryConnection) value -= 24;

    return {
      lateGame,
      category,
      value,
      dame,
      redundantReinforcement,
      necessaryConnection,
      sentePotential,
      largeYose,
      boundaryCompletion: Number(boundaryCompletion.toFixed(3)),
      territoryDelta: Number(territoryDelta.toFixed(3)),
      region,
      emptyRatio: Number(emptyRatio.toFixed(3))
    };
  }

  function lowValueEndgameEvidence(board, move, currentPlayer, context = {}) {
    const point = move.point || move;
    const moveNumber = numeric(move.moveNumber || context.moveNumber);
    const emptyRatio = boardEmptyRatio(board);
    const lateGame = moveNumber >= 120 || emptyRatio <= 0.34 || numeric(move.endgameValue) > 0 || context.gamePhase === "endgame";
    const simulated = simulateMove(board, point, currentPlayer);
    if (!lateGame || !simulated.legal) {
      return { eligible: false, lateGame, incompleteEvidence: true, reason: "not_late_game_or_illegal" };
    }

    const ownGroups = adjacentGroups(board, point, currentPlayer);
    const enemyGroups = adjacentGroups(board, point, opponent(currentPlayer));
    const colors = countAdjacentColors(board, point, currentPlayer);
    const region = pointRegion(point, board.length);
    const edge = Math.min(point.x, point.y, board.length - 1 - point.x, board.length - 1 - point.y);
    const ownLibertiesBefore = ownGroups.map(group => group.liberties.size);
    const minOwnBefore = ownLibertiesBefore.length ? Math.min(...ownLibertiesBefore) : simulated.ownGroup.liberties.size;
    const libertyDelta = simulated.ownGroup.liberties.size - minOwnBefore;
    const immediateCaptureCount = simulated.captures;
    const savesAtariGroup = ownGroups.some(group => group.liberties.size <= 1) && simulated.ownGroup.liberties.size > 1;
    const preventsImmediateLoss = savesAtariGroup || ownGroups.some(group => group.liberties.size <= 2 && group.stones.length >= 3);
    const necessaryConnectionEvidence = ownGroups.length >= 2 && ownGroups.some(group => group.liberties.size <= 3);
    const forcingThreatEvidence = enemyGroups.some(group => group.liberties.size <= 2) || immediateCaptureCount > 0 || numeric(move.tacticalPressure) > 0;
    const targetGroupAlreadyStable = ownGroups.length === 1 && isSafeGroup(ownGroups[0]) && enemyGroups.length === 0;
    const neutralAdjacencyEvidence = colors.own === 0 && colors.enemy === 0;
    const duplicatesNearbyDefense = targetGroupAlreadyStable && colors.enemy === 0 && simulated.captures === 0;
    const boundaryContact = colors.own + colors.enemy;
    const meaningfulBoundaryDelta = boundaryContact >= 2 && !(edge === 0 && boundaryContact < 3);
    const localTerritoryDelta = Math.max(0, numeric(move.territoryValue) * 1.4 + (meaningfulBoundaryDelta ? boundaryContact * 4 : 0));
    const edgeNoBoundaryEffect = edge <= 1 && boundaryContact < 2 && simulated.captures === 0;
    const territoryDeltaApproximatelyZero = localTerritoryDelta < 2 && !meaningfulBoundaryDelta;
    const materialLibertyGain = libertyDelta >= 2;
    const lowValueSignal = neutralAdjacencyEvidence || territoryDeltaApproximatelyZero || targetGroupAlreadyStable || duplicatesNearbyDefense || edgeNoBoundaryEffect;
    const protectionEvidence = {
      immediateCaptureCount,
      savesAtariGroup,
      preventsImmediateLoss,
      necessaryConnectionEvidence,
      forcingThreatEvidence,
      materialLibertyGain,
      meaningfulBoundaryDelta,
      meaningfulLocalTerritoryGain: localTerritoryDelta >= 4
    };
    const excluded = Object.values(protectionEvidence).some(Boolean);
    const conflictingEvidence = lowValueSignal && (meaningfulBoundaryDelta || localTerritoryDelta >= 4 || forcingThreatEvidence);

    return {
      eligible: Boolean(lowValueSignal && !excluded && !conflictingEvidence),
      lateGame,
      immediateCaptureCount,
      savesAtariGroup,
      preventsImmediateLoss,
      necessaryConnectionEvidence,
      libertyDelta,
      meaningfulBoundaryDelta,
      localTerritoryDelta: Number(localTerritoryDelta.toFixed(3)),
      forcingThreatEvidence,
      targetGroupAlreadyStable,
      neutralAdjacencyEvidence,
      duplicatesNearbyDefense,
      edgeNoBoundaryEffect,
      territoryDeltaApproximatelyZero,
      lowValueSignal,
      protectionEvidence,
      conflictingEvidence,
      incompleteEvidence: false
    };
  }

  function isLowValueEndgameCandidate(board, move, currentPlayer, context = {}) {
    return lowValueEndgameEvidence(board, move, currentPlayer, context).eligible === true;
  }

  function urgentMoveEvidence(board, move, currentPlayer, context = {}) {
    const point = move.point || move;
    const simulated = simulateMove(board, point, currentPlayer);
    if (!simulated.legal) {
      return { urgent: false, legal: false, reason: "illegal" };
    }
    const ownGroups = adjacentGroups(board, point, currentPlayer);
    const enemyGroups = adjacentGroups(board, point, opponent(currentPlayer));
    const unsafeOwnGroups = ownGroups.filter(group => group.liberties.size <= 2);
    const stableOwnGroups = ownGroups.filter(isSafeGroup);
    const connectsUnsafeGroups = ownGroups.length >= 2 && unsafeOwnGroups.length > 0 && stableOwnGroups.length < ownGroups.length;
    const ownGroupInAtariBefore = ownGroups.some(group => group.liberties.size <= 1);
    const ownGroupInAtariAfter = simulated.ownGroup.liberties.size <= 1;
    const savesAtariGroup = ownGroupInAtariBefore && !ownGroupInAtariAfter;
    const endangeredEnemyGroups = enemyGroups.filter(group => group.liberties.size <= 1);
    const immediateCaptureCount = simulated.captures;
    const preventsImmediateCapture = savesAtariGroup || unsafeOwnGroups.some(group => group.stones.length >= 3 && simulated.ownGroup.liberties.size > group.liberties.size);
    const stonesSavedEstimate = savesAtariGroup
      ? unsafeOwnGroups.reduce((sum, group) => sum + group.stones.length, 0)
      : 0;
    const falsePattern = immediateCaptureCount === 0 && !savesAtariGroup && !connectsUnsafeGroups && endangeredEnemyGroups.length === 0;
    const urgent = !falsePattern && (
      immediateCaptureCount > 0 ||
      savesAtariGroup ||
      preventsImmediateCapture ||
      stonesSavedEstimate >= numeric(context.stonesSavedThreshold, 2) ||
      connectsUnsafeGroups
    );
    return {
      urgent,
      legal: true,
      immediateCaptureCount,
      ownGroupInAtariBefore,
      ownGroupInAtariAfter,
      savesAtariGroup,
      preventsImmediateCapture,
      stonesSavedEstimate,
      connectsUnsafeGroups,
      connectedGroupCount: ownGroups.length,
      connectedUnsafeGroupCount: unsafeOwnGroups.length,
      connectedGroupsAlreadyStable: ownGroups.length > 0 && stableOwnGroups.length === ownGroups.length,
      enemyGroupsInAtari: endangeredEnemyGroups.length,
      falsePattern
    };
  }

  function evaluateGroups(board, currentPlayer) {
    const ownWeakGroups = detectWeakGroups(board, currentPlayer);
    const enemyWeakGroups = detectWeakGroups(board, opponent(currentPlayer));
    const ownCutPoints = detectCutPoints(board, currentPlayer);
    const enemyCutPoints = detectCutPoints(board, opponent(currentPlayer));
    return {
      ownWeakGroups,
      enemyWeakGroups,
      ownCutPoints,
      enemyCutPoints
    };
  }

  function areaValue(point, size, moveNumber) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    const center = (size - 1) / 2;
    const centerDistance = Math.abs(point.x - center) + Math.abs(point.y - center);
    const cornerDistance = Math.min(
      point.x + point.y,
      (size - 1 - point.x) + point.y,
      point.x + (size - 1 - point.y),
      (size - 1 - point.x) + (size - 1 - point.y)
    );
    if (moveNumber < 40) {
      if (cornerDistance <= 6) return 90;
      if (edge <= 3 && centerDistance >= 5) return 52;
      if (centerDistance <= 4) return 18;
      if (edge === 1) return 4;
      if (edge === 0) return -18;
      return 16;
    }
    if (moveNumber >= 120) {
      if (edge === 0) return -12;
      if (edge === 1) return -4;
      return 0;
    }
    if (centerDistance <= 4) return 8;
    if (edge >= 2) return 4;
    return -4;
  }

  function evaluatePosition(board, currentPlayer) {
    const territory = estimateTerritory(board);
    const influence = {
      own: estimateInfluence(board, currentPlayer),
      opponent: estimateInfluence(board, opponent(currentPlayer))
    };
    const groups = evaluateGroups(board, currentPlayer);
    return {
      currentPlayer,
      territory,
      influence,
      groups,
      scoreLead: territory[currentPlayer === black ? "black" : "white"] - territory[currentPlayer === black ? "white" : "black"],
      thicknessLead: influence.own - influence.opponent
    };
  }

  function scoreMoveByPosition(move, board, currentPlayer) {
    if (!move) return -99999;
    if (move.ruleLegal === false || move.legal === false || move.isSuicide || move.obviousGiveaway) return -99999;
    const point = move.point || move;
    const simulated = simulateMove(board, point, currentPlayer);
    if (!simulated.legal) return -99999;

    const before = evaluatePosition(board, currentPlayer);
    const after = evaluatePosition(simulated.board, currentPlayer);
    const ownWeakBefore = before.groups.ownWeakGroups.length;
    const ownWeakAfter = after.groups.ownWeakGroups.length;
    const enemyWeakBefore = before.groups.enemyWeakGroups.length;
    const enemyWeakAfter = after.groups.enemyWeakGroups.length;
    const cutsBefore = before.groups.ownCutPoints.length;
    const cutsAfter = after.groups.ownCutPoints.length;
    const lowValueEvidence = lowValueEndgameEvidence(board, move, currentPlayer, { moveNumber: numeric(move.moveNumber) });

    let score = 0;
    score += simulated.captures * 120;
    score += (ownWeakBefore - ownWeakAfter) * 95;
    score += (enemyWeakAfter - enemyWeakBefore) * 62;
    score += (cutsBefore - cutsAfter) * 65;
    const colors = countAdjacentColors(board, point, currentPlayer);
    const hasConcreteTerritoryBoundary = colors.own + colors.enemy >= 2 || simulated.captures > 0 || numeric(move.territoryValue) >= 4;
    const territorySwing = lowValueEvidence.eligible || !hasConcreteTerritoryBoundary ? 0 : after.scoreLead - before.scoreLead;
    score += territorySwing * 16;
    const thicknessSwing = lowValueEvidence.eligible || !hasConcreteTerritoryBoundary ? 0 : after.thicknessLead - before.thicknessLead;
    score += thicknessSwing * 1.2;
    const area = areaValue(point, board.length, numeric(move.moveNumber));
    score += lowValueEvidence.eligible ? Math.min(0, area) : area;
    for (const group of before.groups.enemyWeakGroups) {
      if (group.group.liberties.has(pointKey(point))) score += 56;
    }
    for (const cut of before.groups.ownCutPoints) {
      if (cut.point.x === point.x && cut.point.y === point.y) score += 70 + cut.urgency * 16;
    }
    if (move.ownLiberties <= 1 && simulated.captures === 0) score -= 120;
    if (move.isMeaninglessFirstLine) score -= 100;
    if (move.isRandomFlyaway) score -= 80;
    if (lowValueEvidence.eligible) score -= 90;
    return Math.round(score);
  }

  function explainPositionSummary(positionEval) {
    if (!positionEval) return "No position evaluation available.";
    const ownWeak = positionEval.groups?.ownWeakGroups?.length || 0;
    const enemyWeak = positionEval.groups?.enemyWeakGroups?.length || 0;
    const ownCuts = positionEval.groups?.ownCutPoints?.length || 0;
    const territoryLead = positionEval.scoreLead;
    const thicknessLead = positionEval.thicknessLead;
    return `Weak groups own ${ownWeak}, enemy ${enemyWeak}; cut points ${ownCuts}; territory ${territoryLead >= 0 ? "+" : ""}${territoryLead}; thickness ${thicknessLead >= 0 ? "+" : ""}${thicknessLead.toFixed(1)}.`;
  }

  return {
    evaluatePosition,
    evaluateGroups,
    detectWeakGroups,
    detectCutPoints,
    classifyEndgameMove,
    lowValueEndgameEvidence,
    isLowValueEndgameCandidate,
    urgentMoveEvidence,
    estimateTerritory,
    estimateInfluence,
    scoreMoveByPosition,
    explainPositionSummary
  };
}));
