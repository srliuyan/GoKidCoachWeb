(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachRuleEngine = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const empty = 0;
  const black = 1;
  const white = 2;
  const openingStandardPoints = new Set([
    "3,3", "15,3", "3,15", "15,15",
    "2,2", "16,2", "2,16", "16,16",
    "2,3", "3,2", "2,15", "3,16", "15,2", "16,3", "15,16", "16,15",
    "2,4", "4,2", "2,14", "4,16", "14,2", "16,4", "14,16", "16,14",
    "3,4", "4,3", "3,14", "4,15", "14,3", "15,4", "14,15", "15,14"
  ]);

  function pointKey(point) {
    return `${point.x},${point.y}`;
  }

  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  function boardHash(board) {
    return board.map(row => row.join("")).join("|");
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

  function allGroups(board, color) {
    const size = board.length;
    const seen = new Set();
    const groups = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
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

  function createAnalysisContext(board, options = {}) {
    const hash = boardHash(board);
    const limits = {
      maxGroups: Number(options.maxGroups) || 160,
      maxSimulations: Number(options.maxSimulations) || 80,
      maxComponentScores: Number(options.maxComponentScores) || 80
    };
    const context = {
      boardHash: hash,
      groupMap: new Map(),
      groupInfo: new Map(),
      libertyMap: new Map(),
      legalMoveResults: new Map(),
      simulationResults: new Map(),
      ownershipEstimate: null,
      weakGroupClassifications: new Map(),
      localPatternResults: new Map(),
      componentScores: new Map(),
      candidateScores: new Map(),
      counters: {
        groupAtCallCount: 0,
        libertyPointsCallCount: 0,
        simulateMoveCount: 0,
        fullBoardScanCount: 0
      },
      valid: true,
      limits
    };
    context.invalidate = () => {
      context.valid = false;
      context.groupMap.clear();
      context.groupInfo.clear();
      context.libertyMap.clear();
      context.legalMoveResults.clear();
      context.simulationResults.clear();
      context.weakGroupClassifications.clear();
      context.localPatternResults.clear();
      context.componentScores.clear();
      context.candidateScores.clear();
    };
    return context;
  }

  function contextMatches(context, board) {
    return Boolean(context?.valid && context.boardHash === boardHash(board));
  }

  function cachedGroupAt(board, start, context) {
    if (!contextMatches(context, board)) return groupAt(board, start);
    const key = pointKey(start);
    const cachedKey = context.groupMap.get(key);
    if (cachedKey && context.groupInfo.has(cachedKey)) return context.groupInfo.get(cachedKey);
    context.counters.groupAtCallCount += 1;
    const group = groupAt(board, start);
    const groupKey = groupSignature(group) || key;
    if (context.groupInfo.size < context.limits.maxGroups) {
      context.groupInfo.set(groupKey, group);
      for (const stone of group.stones) context.groupMap.set(pointKey(stone), groupKey);
    }
    return group;
  }

  function cachedLibertyPoints(group, context) {
    if (!context?.valid) return libertyPoints(group);
    const key = groupSignature(group);
    if (key && context.libertyMap.has(key)) return context.libertyMap.get(key);
    context.counters.libertyPointsCallCount += 1;
    const liberties = libertyPoints(group);
    if (key && context.libertyMap.size < context.limits.maxGroups) context.libertyMap.set(key, liberties);
    return liberties;
  }

  function cachedSimulateMove(board, point, color, positionHashes, context) {
    if (!contextMatches(context, board)) return simulateMove(board, point, color, positionHashes);
    const key = `${pointKey(point)}:${color}:${Array.isArray(positionHashes) ? positionHashes.length : 0}`;
    if (context.simulationResults.has(key)) return context.simulationResults.get(key);
    context.counters.simulateMoveCount += 1;
    const result = simulateMove(board, point, color, positionHashes);
    if (context.simulationResults.size < context.limits.maxSimulations) context.simulationResults.set(key, result);
    return result;
  }

  function simulateMove(board, point, color, positionHashes) {
    const size = board.length;
    if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) {
      return { legal: false, reason: "out_of_bounds" };
    }
    if (board[point.y][point.x] !== empty) {
      return { legal: false, reason: "occupied" };
    }

    const nextBoard = cloneBoard(board);
    nextBoard[point.y][point.x] = color;
    const capturedGroups = [];
    let captures = 0;

    for (const next of neighbors(point, size)) {
      if (nextBoard[next.y][next.x] !== opponent(color)) continue;
      const group = groupAt(nextBoard, next);
      if (group.liberties.size !== 0) continue;
      capturedGroups.push(group);
      captures += group.stones.length;
      for (const stone of group.stones) nextBoard[stone.y][stone.x] = empty;
    }

    const ownGroup = groupAt(nextBoard, point);
    if (ownGroup.liberties.size === 0) {
      return { legal: false, reason: "suicide" };
    }

    const nextHash = boardHash(nextBoard);
    if (Array.isArray(positionHashes) && positionHashes.includes(nextHash)) {
      return { legal: false, reason: "ko_or_repeat" };
    }

    return {
      legal: true,
      board: nextBoard,
      captures,
      ownGroup,
      capturedGroups
    };
  }

  function samePoint(a, b) {
    return a && b && a.x === b.x && a.y === b.y;
  }

  function groupSignature(group) {
    return (group?.stones || []).map(pointKey).sort().join(";");
  }

  function groupsIntersect(a, b) {
    const stones = new Set((a?.stones || []).map(pointKey));
    return (b?.stones || []).some(stone => stones.has(pointKey(stone)));
  }

  function groupStillPresent(board, group, color) {
    return (group?.stones || []).some(stone => board[stone.y]?.[stone.x] === color);
  }

  function groupContainingAny(board, group, color) {
    for (const stone of group?.stones || []) {
      if (board[stone.y]?.[stone.x] === color) return groupAt(board, stone);
    }
    return null;
  }

  function groupContains(group, point) {
    return Boolean(group?.stones?.some(stone => samePoint(stone, point)));
  }

  function stableGroup(group) {
    return Boolean(group && (group.liberties.size >= 4 || (group.liberties.size >= 3 && group.stones.length >= 4)));
  }

  function groupSafetyEvidence(board, group, color) {
    const stones = group?.stones || [];
    const liberties = libertyPoints(group || { liberties: new Set() });
    const stoneCount = stones.length;
    const libertyQuality = liberties.reduce((sum, liberty) => {
      const adjacent = neighbors(liberty, board.length);
      const friendly = adjacent.filter(point => board[point.y][point.x] === color).length;
      const enemy = adjacent.filter(point => board[point.y][point.x] === opponent(color)).length;
      return sum + Math.max(0, 1 + friendly * 0.45 - enemy * 0.65);
    }, 0);
    const nearbyFriendlySupport = stones.reduce((sum, stone) => sum + neighbors(stone, board.length).filter(point => board[point.y][point.x] === color).length, 0);
    const nearbyOpponentPressure = stones.reduce((sum, stone) => sum + neighbors(stone, board.length).filter(point => board[point.y][point.x] === opponent(color)).length, 0);
    const eyePotential = liberties.filter(liberty => neighbors(liberty, board.length).filter(point => board[point.y][point.x] === color).length >= 2).length;
    const falseEyeRisk = liberties.filter(liberty => neighbors(liberty, board.length).filter(point => board[point.y][point.x] === opponent(color)).length >= 2).length;
    const connectionOptions = liberties.filter(liberty => adjacentGroups(board, liberty, color).length >= 1).length;
    const cutRisk = stones.reduce((sum, stone) => sum + neighbors(stone, board.length).filter(point => {
      if (board[point.y][point.x] !== empty) return false;
      return adjacentGroups(board, point, opponent(color)).length >= 2;
    }).length, 0);
    const escapeRoutes = liberties.filter(liberty => {
      const adjacent = neighbors(liberty, board.length);
      return adjacent.some(point => board[point.y][point.x] === empty) || adjacent.some(point => board[point.y][point.x] === color);
    }).length;
    const surroundingEnemyStrength = stones.reduce((sum, stone) => sum + neighbors(stone, board.length).reduce((inner, point) => {
      if (board[point.y][point.x] !== opponent(color)) return inner;
      return inner + groupAt(board, point).liberties.size;
    }, 0), 0);
    const distanceToEdge = stones.length
      ? Math.min(...stones.map(stone => Math.min(stone.x, stone.y, board.length - 1 - stone.x, board.length - 1 - stone.y)))
      : 0;
    const xs = stones.map(stone => stone.x);
    const ys = stones.map(stone => stone.y);
    const groupExtent = stones.length ? (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1) : 0;
    const externalLiberties = liberties.filter(liberty => neighbors(liberty, board.length).some(point => board[point.y][point.x] === empty)).length;
    const strategicSize = stoneCount * 1.4 + Math.min(8, liberties.length) * 0.8 + connectionOptions * 0.9 + escapeRoutes * 0.7;
    const tacticalCaptureRisk = Math.max(0, 3 - liberties.length) * Math.max(1, stoneCount) + nearbyOpponentPressure + cutRisk * 0.7 + falseEyeRisk * 1.4;
    let classification = "unsettled";
    if (stoneCount <= 2 && liberties.length <= 2 && strategicSize < 5 && nearbyFriendlySupport <= 1) classification = "disposable_small_group";
    else if ((liberties.length <= 1 && (stoneCount >= 2 || tacticalCaptureRisk >= 4)) || (stoneCount >= 4 && tacticalCaptureRisk >= strategicSize)) classification = "critical";
    else if (libertyQuality < 2.2 || (liberties.length <= 3 && nearbyOpponentPressure > nearbyFriendlySupport) || falseEyeRisk > eyePotential) classification = "weak";
    else if (liberties.length >= 5 || eyePotential >= 2 || (nearbyFriendlySupport >= nearbyOpponentPressure + 2 && escapeRoutes >= 2)) classification = "stable";
    return {
      stoneCount,
      liberties: liberties.length,
      libertyQuality: Number(libertyQuality.toFixed(3)),
      eyePotential,
      falseEyeRisk,
      connectionOptions,
      cutRisk,
      escapeRoutes,
      nearbyFriendlySupport,
      nearbyOpponentPressure,
      surroundingEnemyStrength,
      strategicSize: Number(strategicSize.toFixed(3)),
      tacticalCaptureRisk: Number(tacticalCaptureRisk.toFixed(3)),
      distanceToEdge,
      externalLiberties,
      groupExtent,
      classification
    };
  }

  function simulateMoveDetailed(board, move, color, context = {}) {
    const point = move?.point || move;
    const result = simulateMove(board, point, color, context.positionHashes || []);
    if (!result.legal) {
      return {
        legal: false,
        reason: result.reason,
        boardAfter: null,
        capturedStones: [],
        capturedStoneCount: 0,
        ownGroupAfter: null,
        ownLibertiesAfter: 0,
        affectedOpponentGroups: [],
        koStateAfter: null,
        selfAtari: false,
        immediateRecaptureAvailable: false
      };
    }

    const capturedStones = result.capturedGroups.flatMap(group => group.stones.map(stone => ({ ...stone })));
    const replyColor = opponent(color);
    let immediateRecaptureAvailable = false;
    for (const liberty of libertyPoints(result.ownGroup).slice(0, 4)) {
      const reply = simulateMove(result.board, liberty, replyColor, []);
      if (reply.legal && reply.captures > 0) {
        immediateRecaptureAvailable = true;
        break;
      }
    }
    if (!immediateRecaptureAvailable && result.captures > 0 && result.ownGroup.liberties.size <= 2) {
      immediateRecaptureAvailable = true;
    }

    return {
      legal: true,
      boardAfter: result.board,
      capturedStones,
      capturedStoneCount: result.captures,
      ownGroupAfter: result.ownGroup,
      ownLibertiesAfter: result.ownGroup.liberties.size,
      affectedOpponentGroups: adjacentGroups(board, point, replyColor),
      koStateAfter: result.captures === 1 && result.ownGroup.liberties.size === 1 ? boardHash(result.board) : null,
      selfAtari: result.ownGroup.liberties.size <= 1,
      immediateRecaptureAvailable
    };
  }

  function directOpponentReplies(boardAfter, point, color, simulation, limit = 5, context = {}) {
    if (!simulation?.legal) return [];
    const replyColor = opponent(color);
    const candidates = new Map();
    function add(reply, reason, priority) {
      const result = simulateMove(boardAfter, reply, replyColor, []);
      if (!result.legal) return;
      const key = pointKey(reply);
      const previous = candidates.get(key);
      if (!previous || priority > previous.priority) {
        candidates.set(key, { point: reply, reason, priority, captures: result.captures, ownLibertiesAfter: result.ownGroup.liberties.size, boardAfter: result.board });
      }
    }

    const affectedOwn = simulation.ownGroupAfter || simulation.ownGroup || { liberties: new Set(), stones: [] };
    for (const liberty of libertyPoints(affectedOwn)) {
      add(liberty, "direct_capture", 150);
    }
    for (const captured of simulation.capturedStones || []) {
      for (const next of neighbors(captured, boardAfter.length)) {
        if (boardAfter[next.y][next.x] === empty) add(next, "recapture", 142);
      }
    }
    const anchors = [
      point,
      ...(simulation.capturedStones || []),
      ...(affectedOwn.stones || []),
      ...((context.affectedOwnBefore || []).flatMap(group => group.stones || []))
    ];
    const region = localRegionPoints(boardAfter, anchors, Number(context.localRadius) || 4, Number(context.regionCap) || 48);
    const regionKeys = new Set(region.map(pointKey));
    for (const group of allGroups(boardAfter, color)) {
      if (!group.stones.some(stone => regionKeys.has(pointKey(stone)))) continue;
      if (group.liberties.size <= 2) {
        for (const liberty of libertyPoints(group)) add(liberty, group.liberties.size === 1 ? "capture_atari_group" : "atari", group.liberties.size === 1 ? 148 : 124);
      }
    }
    for (const next of neighbors(point, boardAfter.length)) {
      if (boardAfter[next.y][next.x] === empty) add(next, "local_forcing_reply", 42);
      if (boardAfter[next.y][next.x] === color) {
        const group = groupAt(boardAfter, next);
        for (const liberty of libertyPoints(group)) add(liberty, group.liberties.size <= 2 ? "critical_liberty" : "local_forcing_reply", group.liberties.size <= 2 ? 118 : 40);
      }
      if (boardAfter[next.y][next.x] === replyColor) {
        const group = groupAt(boardAfter, next);
        for (const liberty of libertyPoints(group)) add(liberty, group.liberties.size <= 1 ? "rescue_refutation" : "local_forcing_reply", group.liberties.size <= 1 ? 108 : 35);
      }
    }
    for (const group of context.affectedOwnBefore || []) {
      const after = groupContainingAny(boardAfter, group, color);
      if (!after || after.liberties.size > 3) continue;
      for (const liberty of libertyPoints(after)) add(liberty, "rescue_refutation", after.liberties.size <= 2 ? 118 : 80);
    }
    if ((context.affectedOwnBefore || []).length >= 2) {
      for (const liberty of libertyPoints(affectedOwn)) add(liberty, "connection_cut", 118);
      for (const next of neighbors(point, boardAfter.length)) {
        if (boardAfter[next.y][next.x] === empty) add(next, "connection_cut", 122);
      }
    }

    return Array.from(candidates.values())
      .sort((a, b) => b.priority - a.priority || b.captures - a.captures || a.point.y - b.point.y || a.point.x - b.point.x)
      .slice(0, limit);
  }

  function conditionalReply5Reason(candidate, first, ownBefore, oppBefore, firstOutcome, context = {}) {
    if (!context.allowConditionalReply5 || context.difficultyMode !== "MAX_STRENGTH_FIXED") return null;
    if (first.koStateAfter) return null;
    const sourceText = [
      candidate?.candidateSource,
      candidate?.source,
      candidate?.generationReason,
      ...(candidate?.sourceTags || []),
      ...(candidate?.purposeLabels || [])
    ].filter(Boolean).join(" ");
    const endangeredOwn = ownBefore.some(group => group.liberties.size <= 2);
    const ownAtari = ownBefore.some(group => group.liberties.size === 1);
    const opponentAtari = oppBefore.some(group => group.liberties.size === 1);
    if (first.capturedStoneCount > 0 && (first.immediateRecaptureAvailable || first.ownLibertiesAfter <= 2)) return "immediate_recapture";
    if (first.selfAtari || first.ownLibertiesAfter <= 2 || opponentAtari) return "stronger_atari";
    if (ownBefore.length >= 2) return "connection";
    if (oppBefore.length >= 2) return "cut";
    if (endangeredOwn || firstOutcome.ownUnsafeAfter) return "escape";
    if (/weak_group|rescue|tesuji|critical/.test(sourceText)) return "weak_group_tesuji";
    if (/invasion/.test(sourceText)) return "invasion_response";
    if (/reduction/.test(sourceText)) return "reduction_response";
    if (/sente|endgame|yose/.test(sourceText)) return "sente_endgame_reply";
    if (/attack|counter|seal|block|whole_board_strategy/.test(sourceText)) return "counterattack";
    return null;
  }

  function localRegionPoints(board, anchors, radius = 4, cap = 48) {
    const points = new Map();
    function add(point, priority = 0) {
      if (!point) return;
      if (point.x < 0 || point.y < 0 || point.x >= board.length || point.y >= board.length) return;
      const key = pointKey(point);
      const previous = points.get(key);
      if (!previous || priority > previous.priority) points.set(key, { point: { x: point.x, y: point.y }, priority });
    }
    for (const anchor of anchors.filter(Boolean)) {
      add(anchor, 100);
      for (let y = Math.max(0, anchor.y - radius); y <= Math.min(board.length - 1, anchor.y + radius); y += 1) {
        for (let x = Math.max(0, anchor.x - radius); x <= Math.min(board.length - 1, anchor.x + radius); x += 1) {
          const distance = Math.abs(anchor.x - x) + Math.abs(anchor.y - y);
          if (distance <= radius) add({ x, y }, radius - distance);
        }
      }
    }
    return Array.from(points.values())
      .sort((a, b) => b.priority - a.priority || a.point.y - b.point.y || a.point.x - b.point.x)
      .slice(0, cap)
      .map(item => item.point);
  }

  function localTacticalMoves(board, color, anchors, context = {}, limit = 6) {
    const region = localRegionPoints(board, anchors, Number(context.localRadius) || 4, Number(context.regionCap) || 48);
    const moves = new Map();
    function add(point, reason, priority) {
      const result = simulateMove(board, point, color, context.positionHashes || []);
      if (!result.legal) return;
      const key = pointKey(point);
      const previous = moves.get(key);
      const ownBefore = adjacentGroups(board, point, color);
      const oppBefore = adjacentGroups(board, point, opponent(color));
      const atariRescue = ownBefore.some(group => group.liberties.size <= 1 && group.liberties.has(key));
      const connection = ownBefore.length >= 2;
      const cut = oppBefore.length >= 2;
      const tacticalPriority = priority
        + result.captures * 80
        + (atariRescue ? 70 : 0)
        + (connection ? 42 : 0)
        + (cut ? 36 : 0)
        + Math.max(0, 4 - result.ownGroup.liberties.size) * -8;
      if (!previous || tacticalPriority > previous.priority) {
        moves.set(key, {
          point: { x: point.x, y: point.y },
          reason: context.continuationMode ? continuationReason(reason, result, ownBefore, oppBefore) : reason,
          priority: tacticalPriority,
          captures: result.captures,
          ownLibertiesAfter: result.ownGroup.liberties.size,
          atariRescue,
          connection,
          cut
        });
      }
    }

    for (const point of region) {
      if (board[point.y][point.x] !== empty) continue;
      const own = adjacentGroups(board, point, color);
      const opp = adjacentGroups(board, point, opponent(color));
      const nearTactical = own.some(group => group.liberties.size <= 2)
        || opp.some(group => group.liberties.size <= 2)
        || own.length >= 2
        || opp.length >= 2;
      if (!nearTactical) continue;
      add(point, "local_tactical", 10);
    }

    for (const group of allGroups(board, opponent(color))) {
      if (group.liberties.size > 2) continue;
      if (!group.stones.some(stone => region.some(point => point.x === stone.x && point.y === stone.y))) continue;
      for (const liberty of libertyPoints(group)) add(liberty, group.liberties.size === 1 ? "counter_capture" : "liberty_gain", group.liberties.size === 1 ? 120 : 80);
    }
    for (const group of allGroups(board, color)) {
      if (group.liberties.size > 2) continue;
      if (!group.stones.some(stone => region.some(point => point.x === stone.x && point.y === stone.y))) continue;
      for (const liberty of libertyPoints(group)) add(liberty, group.liberties.size === 1 ? "escape" : "stabilization", group.liberties.size === 1 ? 110 : 70);
    }

    return Array.from(moves.values())
      .sort((a, b) => b.priority - a.priority || b.captures - a.captures || a.point.y - b.point.y || a.point.x - b.point.x)
      .slice(0, limit);
  }

  function continuationReason(reason, result, ownBefore, oppBefore) {
    if (result.captures > 0) return oppBefore.some(group => group.liberties.size <= 1) ? "recapture" : "counter_capture";
    if (ownBefore.some(group => group.liberties.size <= 1)) return "rescue_completion";
    if (result.ownGroup.liberties.size > 2 && ownBefore.some(group => group.liberties.size <= 2)) return "escape";
    if (ownBefore.length >= 2) return "reconnect";
    if (result.ownGroup.liberties.size >= 3) return "liberty_gain";
    return reason === "local_tactical" ? "stabilization" : reason;
  }

  function localOutcome(boardBefore, boardAfter, point, color) {
    const beforeOwn = adjacentGroups(boardBefore, point, color);
    const beforeOpp = adjacentGroups(boardBefore, point, opponent(color));
    const afterOwn = adjacentGroups(boardAfter, point, color);
    const ownAfterGroup = boardAfter[point.y]?.[point.x] === color ? groupAt(boardAfter, point) : null;
    const minOwnBefore = beforeOwn.length ? Math.min(...beforeOwn.map(group => group.liberties.size)) : 0;
    const minOwnAfter = ownAfterGroup ? ownAfterGroup.liberties.size : afterOwn.length ? Math.min(...afterOwn.map(group => group.liberties.size)) : 0;
    return {
      libertyDelta: minOwnAfter - minOwnBefore,
      ownStonesBefore: beforeOwn.reduce((sum, group) => sum + group.stones.length, 0),
      opponentStonesBefore: beforeOpp.reduce((sum, group) => sum + group.stones.length, 0),
      ownGroupAfter: ownAfterGroup,
      ownUnsafeAfter: ownAfterGroup ? ownAfterGroup.liberties.size <= 1 : false,
      connectedBefore: beforeOwn.length,
      connectedAfter: ownAfterGroup ? ownAfterGroup.stones.length : 0
    };
  }

  function evaluateLocalSequence(board, move, player, context = {}) {
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const point = move?.point || move;
    const depthLimit = Math.min(3, Math.max(1, Number(context.maxDepth) || 3));
    const base = {
      legal: false,
      candidateMove: point ? { x: point.x, y: point.y } : null,
      opponentBestReply: null,
      aiBestContinuation: null,
      sequence: [],
      sequenceDepth: 0,
      captureDelta: 0,
      libertyDelta: 0,
      groupSafetyDelta: 0,
      connectionResult: "unresolved",
      cutResult: "unresolved",
      selfAtariRisk: false,
      koResult: null,
      netLocalValue: 0,
      confidence: 0,
      refuted: false,
      unresolved: true,
      hardOutcome: "unresolved",
      confidenceLevel: "low",
      generatedOpponentReplies: [],
      generatedAiContinuations: [],
      terminalState: {},
      repliesConsidered: 0,
      continuationsConsidered: 0,
      latencyMs: 0,
      fallback: false
    };
    const first = simulateMoveDetailed(board, point, player, context);
    if (!first.legal) return { ...base, legal: false, unresolved: false, refuted: true, hardOutcome: "illegal", confidence: 1, confidenceLevel: "high", reason: first.reason };

    const ownBefore = adjacentGroups(board, point, player);
    const oppBefore = adjacentGroups(board, point, opponent(player));
    const endangeredOwnBefore = ownBefore.filter(group => group.liberties.size <= 2);
    const atariOwnBefore = ownBefore.filter(group => group.liberties.size === 1 && group.liberties.has(pointKey(point)));
    const connectsGroups = ownBefore.length >= 2;
    const cutsGroups = oppBefore.length >= 2;
    const firstOutcome = localOutcome(board, first.boardAfter, point, player);
    const anchors = [
      point,
      ...first.capturedStones,
      ...first.ownGroupAfter.stones,
      ...ownBefore.flatMap(group => group.stones),
      ...oppBefore.flatMap(group => group.stones)
    ];
    const reply5Reason = conditionalReply5Reason(move, first, ownBefore, oppBefore, firstOutcome, context);
    const runtimeReplyCap = reply5Reason ? 5 : Math.min(4, Number(context.maxOpponentReplies) || 4);
    let replies = depthLimit >= 2
      ? directOpponentReplies(first.boardAfter, point, player, first, runtimeReplyCap, { ...context, affectedOwnBefore: ownBefore })
      : [];
    if (depthLimit >= 2 && replies.length < runtimeReplyCap) {
      for (const reply of localTacticalMoves(first.boardAfter, opponent(player), anchors, context, runtimeReplyCap)) {
        if (!replies.some(item => samePoint(item.point, reply.point))) replies.push(reply);
      }
      replies = replies
        .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.captures || 0) - (a.captures || 0) || a.point.y - b.point.y || a.point.x - b.point.x)
        .slice(0, runtimeReplyCap);
    }

    let worstLine = null;
    let bestFinalValue = -Infinity;
    let continuationsConsidered = 0;
    const firstValue = first.capturedStoneCount * 28
      + Math.max(0, firstOutcome.libertyDelta) * 6
      + (connectsGroups ? 22 : 0)
      + (cutsGroups ? 16 : 0)
      - (first.selfAtari && first.capturedStoneCount === 0 ? 45 : 0);

    if (!replies.length || depthLimit < 2) {
      bestFinalValue = firstValue;
      worstLine = { reply: null, continuation: null, value: firstValue, replyLoss: 0, finalBoard: first.boardAfter };
    }

    for (const reply of replies) {
      const replySim = simulateMoveDetailed(first.boardAfter, reply.point, opponent(player), {});
      if (!replySim.legal) continue;
      let replyLoss = replySim.capturedStoneCount * 30;
      if (reply.reason === "recapture") replyLoss += 18;
      if (endangeredOwnBefore.length && replySim.capturedStoneCount >= Math.min(...endangeredOwnBefore.map(group => group.stones.length))) replyLoss += 34;
      let bestContinuation = null;
      let bestReplyLineValue = firstValue - replyLoss;
      if (depthLimit >= 3) {
        const continuationAnchors = [
          point,
          reply.point,
          ...replySim.capturedStones,
          ...(replySim.ownGroupAfter?.stones || [])
        ];
        const continuations = localTacticalMoves(replySim.boardAfter, player, continuationAnchors, { ...context, continuationMode: true }, Math.min(3, Number(context.maxAiContinuations) || 3));
        for (const continuation of continuations) {
          continuationsConsidered += 1;
          const contSim = simulateMoveDetailed(replySim.boardAfter, continuation.point, player, {});
          if (!contSim.legal) continue;
          const contOutcome = localOutcome(replySim.boardAfter, contSim.boardAfter, continuation.point, player);
          const continuationValue = firstValue
            - replyLoss
            + contSim.capturedStoneCount * 26
            + Math.max(0, contOutcome.libertyDelta) * 5
            + (continuation.connection ? 14 : 0)
            + (contSim.selfAtari && contSim.capturedStoneCount === 0 ? -28 : 0);
          if (!bestContinuation || continuationValue > bestReplyLineValue) {
            bestContinuation = { ...continuation, boardAfter: contSim.boardAfter };
            bestReplyLineValue = continuationValue;
          }
        }
      }
      const line = { reply, continuation: bestContinuation, value: bestReplyLineValue, replyLoss, finalBoard: bestContinuation?.boardAfter || replySim.boardAfter };
      if (!worstLine || line.value < worstLine.value) worstLine = line;
      if (bestReplyLineValue > bestFinalValue) bestFinalValue = bestReplyLineValue;
    }

    const elapsed = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;
    const finalValue = Number((worstLine?.value ?? firstValue).toFixed(3));
    const finalBoard = worstLine?.finalBoard || first.boardAfter;
    const affectedOwnAfter = ownBefore.map(group => groupContainingAny(finalBoard, group, player)).filter(Boolean);
    const affectedOppAfter = oppBefore.map(group => groupContainingAny(finalBoard, group, opponent(player))).filter(Boolean);
    const rescuedGroupStillExists = atariOwnBefore.every(group => groupStillPresent(finalBoard, group, player));
    const rescuedGroupLibertyCount = affectedOwnAfter.length ? Math.min(...affectedOwnAfter.map(group => group.liberties.size)) : 0;
    const connectedGroupsStillConnected = connectsGroups && ownBefore.every(group => groupStillPresent(finalBoard, group, player))
      && affectedOwnAfter.some(group => ownBefore.every(before => groupsIntersect(group, before)));
    const ownStonesCaptured = ownBefore.reduce((sum, group) => sum + (groupStillPresent(finalBoard, group, player) ? 0 : group.stones.length), 0);
    const opponentStonesCaptured = oppBefore.reduce((sum, group) => sum + (groupStillPresent(finalBoard, group, opponent(player)) ? 0 : group.stones.length), 0) + first.capturedStoneCount;
    const directRecaptureLoss = Math.max(0, ...(replies || []).map(reply => reply.captures || 0));
    const immediateRecaptureRefutes = first.capturedStoneCount > 0 && directRecaptureLoss >= first.capturedStoneCount;
    const uncompensatedSelfAtari = first.selfAtari && first.capturedStoneCount === 0 && directRecaptureLoss > 0;
    const compensatedSacrifice = first.selfAtari && first.capturedStoneCount > 0 && first.capturedStoneCount >= Math.max(1, first.ownGroupAfter.stones.length);
    const failedRescue = atariOwnBefore.length > 0 && (!rescuedGroupStillExists || rescuedGroupLibertyCount <= 1 || ownStonesCaptured > 0);
    const verifiedRescue = atariOwnBefore.length > 0 && rescuedGroupStillExists && rescuedGroupLibertyCount >= 2 && ownStonesCaptured === 0;
    const verifiedCapture = first.capturedStoneCount > 0 && !immediateRecaptureRefutes && !uncompensatedSelfAtari;
    const failedCapture = first.capturedStoneCount > 0 && immediateRecaptureRefutes && !compensatedSacrifice;
    const failedConnection = connectsGroups && (!connectedGroupsStillConnected || finalValue < 4);
    const unsafeConnectionBefore = ownBefore.some(group => group.liberties.size <= 2) && !ownBefore.every(stableGroup);
    const verifiedConnection = connectsGroups && unsafeConnectionBefore && connectedGroupsStillConnected && firstOutcome.libertyDelta > 0 && !failedConnection;
    const immediatelyRefuted = failedCapture || uncompensatedSelfAtari || failedRescue || failedConnection || finalValue <= -18;
    let hardOutcome = "unresolved";
    if (verifiedCapture) hardOutcome = "verified_capture";
    if (failedCapture) hardOutcome = "failed_capture";
    if (verifiedRescue) hardOutcome = "verified_rescue";
    if (verifiedConnection) hardOutcome = "verified_connection";
    if (failedRescue) hardOutcome = "failed_rescue";
    if (failedConnection) hardOutcome = "failed_connection";
    if (uncompensatedSelfAtari) hardOutcome = "uncompensated_self_atari";
    if (failedRescue) hardOutcome = "failed_rescue";
    if (compensatedSacrifice && hardOutcome === "unresolved") hardOutcome = "compensated_sacrifice";
    if (immediatelyRefuted && hardOutcome === "unresolved") hardOutcome = "immediately_refuted";
    const concreteOutcome = hardOutcome !== "unresolved" && !first.koStateAfter && elapsed <= Number(context.timeBudgetMs || 120);
    const confidenceLevel = concreteOutcome && replies.length ? "high" : concreteOutcome ? "medium" : "low";
    const connectionResult = connectsGroups ? failedConnection ? "failed" : "connected" : "not_applicable";
    const cutResult = cutsGroups ? finalValue > 10 ? "cut_works" : "unresolved" : "not_applicable";
    return {
      ...base,
      legal: true,
      opponentBestReply: worstLine?.reply?.point || null,
      aiBestContinuation: worstLine?.continuation?.point || null,
      sequence: [
        { color: player, point: { x: point.x, y: point.y } },
        ...(worstLine?.reply ? [{ color: opponent(player), point: worstLine.reply.point }] : []),
        ...(worstLine?.continuation ? [{ color: player, point: worstLine.continuation.point }] : [])
      ],
      sequenceDepth: 1 + (worstLine?.reply ? 1 : 0) + (worstLine?.continuation ? 1 : 0),
      captureDelta: first.capturedStoneCount - (worstLine?.replyLoss ? Math.round(worstLine.replyLoss / 30) : 0),
      libertyDelta: firstOutcome.libertyDelta,
      groupSafetyDelta: (firstOutcome.ownUnsafeAfter ? -1 : 1) + Math.max(0, firstOutcome.libertyDelta),
      connectionResult,
      cutResult,
      selfAtariRisk: Boolean(first.selfAtari && first.capturedStoneCount === 0),
      koResult: first.koStateAfter ? "ko_capture" : null,
      netLocalValue: Math.max(-120, Math.min(160, finalValue)),
      confidence: Number((confidenceLevel === "high" ? 0.88 : confidenceLevel === "medium" ? 0.62 : 0.34).toFixed(3)),
      confidenceLevel,
      refuted: immediatelyRefuted,
      hardOutcome,
      generatedOpponentReplies: replies.map(reply => ({ point: reply.point, reason: reply.reason, captures: reply.captures, priority: reply.priority })),
      generatedAiContinuations: worstLine?.continuation ? [{ point: worstLine.continuation.point, reason: worstLine.continuation.reason, captures: worstLine.continuation.captures }] : [],
      terminalState: {
        ownStonesCaptured,
        opponentStonesCaptured,
        ownAffectedGroupsAlive: affectedOwnAfter.length,
        ownAffectedGroupsInAtari: affectedOwnAfter.filter(group => group.liberties.size === 1).length,
        ownAffectedGroupsLiberties: affectedOwnAfter.map(group => group.liberties.size),
        opponentAffectedGroupsAlive: affectedOppAfter.length,
        opponentAffectedGroupsInAtari: affectedOppAfter.filter(group => group.liberties.size === 1).length,
        opponentAffectedGroupsLiberties: affectedOppAfter.map(group => group.liberties.size),
        rescuedGroupStillExists,
        rescuedGroupLibertyCount,
        connectedGroupsStillConnected,
        connectionCutAgain: connectsGroups && !connectedGroupsStillConnected,
        candidateStoneSurvives: finalBoard[point.y]?.[point.x] === player,
        immediateRecaptureAvailable: first.immediateRecaptureAvailable,
        localKoCreated: Boolean(first.koStateAfter),
        unresolvedLongSequence: confidenceLevel === "low"
      },
      unresolved: false,
      repliesConsidered: replies.length,
      conditionalReply5Used: Boolean(reply5Reason),
      conditionalReply5Reason: reply5Reason,
      continuationsConsidered,
      latencyMs: Number(elapsed.toFixed(4)),
      fallback: elapsed > Number(context.timeBudgetMs || 120)
    };
  }

  function verifyShallowTacticalCandidate(board, candidate, color, context = {}) {
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const point = candidate?.point || candidate;
    const simulation = simulateMoveDetailed(board, point, color, context);
    const base = {
      status: "unresolved",
      verifiedUrgent: false,
      verifiedCapture: false,
      verifiedRescue: false,
      verifiedNecessaryConnection: false,
      immediatelyRefuted: false,
      captureVerified: false,
      capturedStoneCount: 0,
      rescueVerified: false,
      connectionVerified: false,
      connectionNecessary: false,
      refutationMove: null,
      refutationType: null,
      estimatedImmediateLoss: 0,
      repliesSimulated: 0,
      latencyMs: 0
    };
    if (!simulation.legal) return { ...base, status: "illegal", legal: false, reason: simulation.reason };

    const ownBefore = adjacentGroups(board, point, color);
    const unsafeOwnBefore = ownBefore.filter(group => group.liberties.size <= 2);
    const atariOwnBefore = ownBefore.filter(group => group.liberties.size === 1 && group.liberties.has(pointKey(point)));
    const enemyBefore = adjacentGroups(board, point, opponent(color));
    const connectedGroups = ownBefore.length;
    const connectedStoneCount = ownBefore.reduce((sum, group) => sum + group.stones.length, 0);
    const libertiesBefore = ownBefore.length ? Math.min(...ownBefore.map(group => group.liberties.size)) : 0;
    const libertiesAfter = simulation.ownLibertiesAfter;
    const replies = directOpponentReplies(simulation.boardAfter, point, color, simulation, context.maxReplies || 5);

    let refutation = null;
    for (const reply of replies) {
      if (reply.captures >= Math.max(1, simulation.capturedStoneCount + 1)) {
        refutation = { move: reply.point, type: simulation.capturedStoneCount > 0 ? "immediate_recapture" : "larger_countercapture", loss: reply.captures };
        break;
      }
      if (atariOwnBefore.length && reply.captures >= Math.min(...atariOwnBefore.map(group => group.stones.length))) {
        refutation = { move: reply.point, type: "failed_rescue", loss: reply.captures };
        break;
      }
      if (connectedGroups >= 2 && reply.reason === "capture_or_cut" && reply.captures > 0) {
        refutation = { move: reply.point, type: "failed_connection", loss: reply.captures };
        break;
      }
    }
    if (!refutation && simulation.selfAtari && simulation.capturedStoneCount === 0) {
      refutation = { move: null, type: "self_atari_collapse", loss: Math.max(1, simulation.ownGroupAfter.stones.length) };
    }

    const captureVerified = simulation.capturedStoneCount > 0
      && !simulation.selfAtari
      && !(refutation && (refutation.type === "immediate_recapture" || refutation.type === "larger_countercapture"));
    const rescueVerified = atariOwnBefore.length > 0
      && libertiesAfter > libertiesBefore
      && !(refutation && refutation.type === "failed_rescue");
    const unsafeGroupsBefore = unsafeOwnBefore.length;
    const connectionNecessary = connectedGroups >= 2
      && unsafeGroupsBefore > 0
      && !ownBefore.every(stableGroup)
      && libertiesAfter > libertiesBefore
      && !(refutation && refutation.type === "failed_connection");
    const immediatelyRefuted = Boolean(refutation);
    const verifiedUrgent = captureVerified || rescueVerified || connectionNecessary;
    const elapsed = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;

    return {
      ...base,
      legal: true,
      status: immediatelyRefuted ? "immediatelyRefuted" : verifiedUrgent ? "verifiedUrgent" : "unresolved",
      verifiedUrgent,
      verifiedCapture: captureVerified,
      verifiedRescue: rescueVerified,
      verifiedNecessaryConnection: connectionNecessary,
      immediatelyRefuted,
      captureVerified,
      capturedStoneCount: simulation.capturedStoneCount,
      ownLibertiesAfter: libertiesAfter,
      immediateRecaptureRisk: simulation.immediateRecaptureAvailable,
      koCapture: Boolean(simulation.koStateAfter),
      netCaptureEstimate: simulation.capturedStoneCount - (refutation?.loss || 0),
      rescueVerified,
      endangeredStoneCount: atariOwnBefore.reduce((sum, group) => sum + group.stones.length, 0),
      libertiesBefore,
      libertiesAfter,
      stonesSavedEstimate: atariOwnBefore.reduce((sum, group) => sum + group.stones.length, 0),
      refutedByDirectReply: Boolean(refutation),
      refutationMove: refutation?.move || null,
      refutationType: refutation?.type || null,
      connectionVerified: connectionNecessary,
      connectionNecessary,
      connectedGroupCount: connectedGroups,
      connectedStoneCount,
      unsafeGroupsBefore,
      immediateCutPrevented: connectionNecessary,
      directRefutationExists: Boolean(refutation),
      estimatedImmediateLoss: refutation?.loss || 0,
      repliesSimulated: replies.length,
      latencyMs: Number(elapsed.toFixed(4))
    };
  }

  function verificationPriority(candidate, verification) {
    const tags = Array.isArray(candidate?.sourceTags) ? candidate.sourceTags.join(" ") : "";
    if (candidate?.urgentCandidate || /urgent|capture|rescue|critical|necessary/.test(tags)) return 650;
    if (verification?.verifiedCapture || Number(candidate?.captures) > 0) return 500;
    if (verification?.verifiedRescue || Number(candidate?.rescueValue) > 0) return 400;
    if (verification?.verifiedNecessaryConnection || Number(candidate?.connectionValue) >= 2) return 300;
    if (candidate?.weakGroupCandidate || /weak_group|escape|connection_toward_support/.test(tags)) return 260;
    if (candidate?.globalCandidate || /whole_board|invasion|reduction/.test(tags)) return 180;
    return Number(candidate?.fusedPolicyScore ?? candidate?.combinedScore ?? candidate?.policyScore ?? 0);
  }

  function localReadingRankAction(reading) {
    if (!reading || reading.unresolved || reading.confidenceLevel !== "high") return { type: "none", ranks: 0, score: 0 };
    if (["failed_capture", "failed_rescue", "uncompensated_self_atari", "immediately_refuted", "failed_connection", "illegal"].includes(reading.hardOutcome)) {
      return { type: "hard_demote", ranks: 99, score: -260 };
    }
    if (["verified_capture", "verified_rescue"].includes(reading.hardOutcome)) {
      return { type: "promote", ranks: 2, score: 240 };
    }
    return { type: "none", ranks: 0, score: 0 };
  }

  function adjustedTierForLocalReading(candidate, action) {
    const tier = candidate.tier || candidate.qualityTier || "good";
    if (action.type === "hard_demote") return "weak";
    if (action.type === "promote" && action.ranks >= 2) return tier === "acceptable" ? "good" : tier;
    return tier;
  }

  function applyShallowTacticalVerification(candidates, board, color, context = {}) {
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const normalMax = Math.max(1, Math.min(Number(context.normalMaxCandidates) || 12, 12));
    const absoluteMax = Math.max(normalMax, Math.min(Number(context.absoluteMaxCandidates) || 16, 16));
    const budgetMs = Math.max(1, Number(context.timeBudgetMs) || 80);
    const sorted = (Array.isArray(candidates) ? candidates : [])
      .filter(candidate => candidate && candidate.legal !== false && candidate.ruleLegal !== false)
      .slice()
      .sort((a, b) => verificationPriority(b) - verificationPriority(a));
    const selected = new Set(sorted.slice(0, normalMax).map(candidate => pointKey(candidate.point || candidate)));
    for (const candidate of sorted) {
      if (selected.size >= absoluteMax) break;
      if (Number(candidate.captures) > 0 || Number(candidate.rescueValue) > 0 || Number(candidate.connectionValue) >= 2) {
        selected.add(pointKey(candidate.point || candidate));
      }
    }

    let repliesSimulated = 0;
    let budgetFallback = false;
    const verified = candidates.map(candidate => {
      const key = pointKey(candidate.point || candidate);
      if (!selected.has(key) || budgetFallback) return { ...candidate, shallowVerificationStatus: "unresolved" };
      const elapsed = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;
      if (elapsed > budgetMs) {
        budgetFallback = true;
        return { ...candidate, shallowVerificationStatus: "unresolved" };
      }
      const verification = verifyShallowTacticalCandidate(board, candidate, color, context);
      repliesSimulated += verification.repliesSimulated || 0;
      const protectedUrgent = verification.verifiedUrgent && !verification.immediatelyRefuted;
      const refuted = verification.immediatelyRefuted && !protectedUrgent;
      let adjustment = 0;
      if (protectedUrgent) {
        if (verification.verifiedCapture) adjustment = 220;
        else if (verification.verifiedRescue) adjustment = 180;
        else if (verification.verifiedNecessaryConnection) adjustment = 150;
      } else if (refuted) {
        adjustment = -260;
      }
      return {
        ...candidate,
        shallowVerification: verification,
        shallowVerificationStatus: verification.status,
        verifiedUrgent: protectedUrgent,
        verifiedCapture: verification.verifiedCapture,
        verifiedRescue: verification.verifiedRescue,
        verifiedNecessaryConnection: verification.verifiedNecessaryConnection,
        immediatelyRefuted: refuted,
        shallowVerificationAdjustment: adjustment,
        confidence: protectedUrgent ? Math.min(0.98, Number(candidate.confidence || 0) + 0.06) : candidate.confidence,
        combinedScore: Number(candidate.combinedScore || 0) + adjustment,
        fusedPolicyScore: Number.isFinite(Number(candidate.fusedPolicyScore)) ? Number(candidate.fusedPolicyScore) + adjustment : candidate.fusedPolicyScore,
        adjustedScore: Number.isFinite(Number(candidate.adjustedScore)) ? Number(candidate.adjustedScore) + adjustment : candidate.adjustedScore
      };
    });
    const latency = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;
    return {
      candidates: verified,
      diagnostics: {
        candidatesVerified: verified.filter(candidate => candidate.shallowVerification).length,
        repliesSimulated,
        verificationLatencyMs: Number(latency.toFixed(4)),
        budgetFallbackCount: budgetFallback ? 1 : 0,
        verifiedUrgentCount: verified.filter(candidate => candidate.verifiedUrgent).length,
        immediatelyRefutedCount: verified.filter(candidate => candidate.immediatelyRefuted).length
      }
    };
  }

  function applyLocalReading(candidates, board, color, context = {}) {
    const started = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    const maxCandidates = Math.min(10, Math.max(1, Number(context.maxCandidates) || 6));
    const budgetMs = Math.max(1, Number(context.timeBudgetMs) || 120);
    const sorted = (Array.isArray(candidates) ? candidates : [])
      .filter(candidate => candidate && candidate.legal !== false && candidate.ruleLegal !== false)
      .slice()
      .sort((a, b) => verificationPriority(b) - verificationPriority(a))
      .slice(0, maxCandidates);
    const selected = new Set(sorted.map(candidate => pointKey(candidate.point || candidate)));
    let fallbackCount = 0;
    const results = [];
    const mapped = (Array.isArray(candidates) ? candidates : []).map(candidate => {
      const key = pointKey(candidate.point || candidate);
      if (!selected.has(key)) return { ...candidate, localReadingStatus: "not_read" };
      const elapsed = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;
      if (elapsed > budgetMs) {
        fallbackCount += 1;
        return { ...candidate, localReadingStatus: "timeout" };
      }
      const reading = evaluateLocalSequence(board, candidate, color, context);
      results.push(reading);
      const rankAction = localReadingRankAction(reading);
      const adjustment = rankAction.type === "none"
        ? (reading.unresolved ? 0 : Math.max(-20, Math.min(25, reading.netLocalValue * 0.12)))
        : rankAction.score;
      return {
        ...candidate,
        localReading: reading,
        localReadingStatus: reading.refuted ? "refuted" : reading.unresolved ? "unresolved" : "read",
        localReadingAdjustment: Number(adjustment.toFixed(3)),
        localReadingRankAction: rankAction,
        tier: adjustedTierForLocalReading(candidate, rankAction),
        qualityTier: adjustedTierForLocalReading(candidate, rankAction),
        combinedScore: Number(candidate.combinedScore || 0) + adjustment,
        fusedPolicyScore: Number.isFinite(Number(candidate.fusedPolicyScore)) ? Number(candidate.fusedPolicyScore) + adjustment : candidate.fusedPolicyScore,
        adjustedScore: Number.isFinite(Number(candidate.adjustedScore)) ? Number(candidate.adjustedScore) + adjustment : candidate.adjustedScore
      };
    });
    const latency = (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()) - started;
    return {
      candidates: mapped,
      diagnostics: {
        candidatesRead: results.length,
        averageReadingLatencyMs: results.length ? Number((results.reduce((sum, item) => sum + item.latencyMs, 0) / results.length).toFixed(4)) : 0,
        maximumReadingLatencyMs: results.reduce((max, item) => Math.max(max, item.latencyMs), 0),
        totalReadingLatencyMs: Number(latency.toFixed(4)),
        fallbackCount,
        refutedCount: results.filter(item => item.refuted).length,
        unresolvedCount: results.filter(item => item.unresolved).length,
        hardOutcomeCounts: results.reduce((counts, item) => {
          counts[item.hardOutcome || "unresolved"] = (counts[item.hardOutcome || "unresolved"] || 0) + 1;
          return counts;
        }, {})
      }
    };
  }

  function adjacentGroups(board, point, color) {
    const groups = new Map();
    for (const next of neighbors(point, board.length)) {
      if (board[next.y][next.x] !== color) continue;
      const group = groupAt(board, next);
      const anchor = group.stones[0] ? pointKey(group.stones[0]) : pointKey(next);
      groups.set(anchor, group);
    }
    return Array.from(groups.values());
  }

  function collectImmediateCaptureMoves(board, color, positionHashes) {
    const moves = new Set();
    for (const group of allGroups(board, opponent(color))) {
      if (group.liberties.size !== 1) continue;
      for (const liberty of libertyPoints(group)) {
        const result = simulateMove(board, liberty, color, positionHashes);
        if (result.legal && result.captures > 0) moves.add(pointKey(liberty));
      }
    }
    return moves;
  }

  function collectCriticalDefenseMoves(board, color, positionHashes) {
    const moves = new Set();
    let criticalGroups = 0;
    for (const group of allGroups(board, color)) {
      if (group.liberties.size !== 1) continue;
      criticalGroups += 1;
      for (const liberty of libertyPoints(group)) {
        const result = simulateMove(board, liberty, color, positionHashes);
        if (result.legal) moves.add(pointKey(liberty));
      }
      for (const stone of group.stones) {
        for (const next of neighbors(stone, board.length)) {
          if (board[next.y][next.x] !== opponent(color)) continue;
          const enemyGroup = groupAt(board, next);
          if (enemyGroup.liberties.size !== 1) continue;
          for (const liberty of libertyPoints(enemyGroup)) {
            const result = simulateMove(board, liberty, color, positionHashes);
            if (result.legal && result.captures > 0) moves.add(pointKey(liberty));
          }
        }
      }
    }
    return { moves, criticalGroups };
  }

  function minDistanceToStones(board, point) {
    let best = Infinity;
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] === empty) continue;
        const distance = Math.abs(point.x - x) + Math.abs(point.y - y);
        if (distance < best) best = distance;
      }
    }
    return best;
  }

  function openingPenalty(board, point, moveHistory) {
    const edge = Math.min(point.x, point.y, board.length - 1 - point.x, board.length - 1 - point.y);
    let score = 0;
    if (moveHistory.length >= 30) return score;

    if (edge === 0) score -= 300;
    else if (edge === 1) score -= 90;

    if (moveHistory.length < 8 && moveHistory.length === 0 && !openingStandardPoints.has(pointKey(point))) {
      score -= 500;
    }
    const distance = minDistanceToStones(board, point);
    if (Number.isFinite(distance) && distance > 7 && moveHistory.length < 30) score -= 500;
    if (Number.isFinite(distance) && distance > 5 && moveHistory.length < 12) score -= 180;
    return score;
  }

  function eyeShapeBonus(board, point, color) {
    const adjacent = neighbors(point, board.length);
    const friendly = adjacent.filter(next => board[next.y][next.x] === color).length;
    const enemy = adjacent.filter(next => board[next.y][next.x] === opponent(color)).length;
    if (friendly >= 3 && enemy === 0) return 300;
    if (friendly >= 2 && enemy === 0) return 120;
    return 0;
  }

  function thicknessBonus(board, point, color) {
    const adjacent = neighbors(point, board.length);
    const friendly = adjacent.filter(next => board[next.y][next.x] === color).length;
    const enemy = adjacent.filter(next => board[next.y][next.x] === opponent(color)).length;
    if (friendly >= 2 && enemy >= 1) return 200;
    if (friendly >= 2) return 120;
    return 0;
  }

  function evaluateMove(input) {
    const board = input.board;
    const point = input.point;
    const color = input.color;
    const moveHistory = input.moveHistory || [];
    const positionHashes = input.positionHashes || [];

    const captureMoves = collectImmediateCaptureMoves(board, color, positionHashes);
    const defenseInfo = collectCriticalDefenseMoves(board, color, positionHashes);
    const defenseMoves = defenseInfo.moves;
    const result = simulateMove(board, point, color, positionHashes);
    if (!result.legal) {
      return { legal: false, ruleScore: -99999, reasons: [result.reason] };
    }

    const key = pointKey(point);
    const reasons = [];
    let score = 0;

    if (captureMoves.size > 0) {
      if (captureMoves.has(key)) {
        score += 1000;
        reasons.push("capture");
      } else {
        score -= 5000;
        reasons.push("miss_forced_capture");
      }
    }

    if (defenseInfo.criticalGroups > 0) {
      if (defenseMoves.has(key)) {
        score += 800;
        reasons.push("save_group");
      } else {
        score -= 5000;
        reasons.push("miss_critical_defense");
      }
    }

    const friendlyBefore = adjacentGroups(board, point, color);
    if (friendlyBefore.length >= 2) {
      score += 500;
      reasons.push("connect");
    }

    const enemyBefore = adjacentGroups(board, point, opponent(color));
    if (enemyBefore.some(group => group.liberties.size === 1) && result.captures > 0) {
      score += 1000;
      if (!reasons.includes("capture")) reasons.push("capture");
    }

    score += eyeShapeBonus(board, point, color);
    if (eyeShapeBonus(board, point, color) > 0) reasons.push("eye_shape");
    score += thicknessBonus(board, point, color);
    if (thicknessBonus(board, point, color) > 0) reasons.push("thickness");

    if (result.ownGroup.liberties.size <= 1 && result.captures === 0) {
      score -= 1000;
      reasons.push("obvious_giveaway");
    }

    score += openingPenalty(board, point, moveHistory);
    if (moveHistory.length < 30 && score < 0) reasons.push("opening_shape");

    return {
      legal: true,
      ruleScore: score,
      reasons
    };
  }

  return {
    empty,
    black,
    white,
    evaluateMove,
    boardHash,
    createAnalysisContext,
    cachedGroupAt,
    cachedLibertyPoints,
    cachedSimulateMove,
    groupSafetyEvidence,
    groupAt,
    allGroups,
    libertyPoints,
    adjacentGroups,
    simulateMove,
    simulateMoveDetailed,
    verifyShallowTacticalCandidate,
    applyShallowTacticalVerification,
    evaluateLocalSequence,
    applyLocalReading
  };
}));
