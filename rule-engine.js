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

  function groupContains(group, point) {
    return Boolean(group?.stones?.some(stone => samePoint(stone, point)));
  }

  function stableGroup(group) {
    return Boolean(group && (group.liberties.size >= 4 || (group.liberties.size >= 3 && group.stones.length >= 4)));
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

  function directOpponentReplies(boardAfter, point, color, simulation, limit = 5) {
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

    for (const liberty of libertyPoints(simulation.ownGroupAfter || simulation.ownGroup || { liberties: new Set() })) {
      add(liberty, "immediate_recapture", 100);
    }
    for (const next of neighbors(point, boardAfter.length)) {
      if (boardAfter[next.y][next.x] === empty) add(next, "local_atari", 70);
      if (boardAfter[next.y][next.x] === color) {
        const group = groupAt(boardAfter, next);
        for (const liberty of libertyPoints(group)) add(liberty, "capture_or_cut", group.liberties.size <= 2 ? 90 : 45);
      }
      if (boardAfter[next.y][next.x] === replyColor) {
        const group = groupAt(boardAfter, next);
        for (const liberty of libertyPoints(group)) add(liberty, "extension_from_atari", group.liberties.size <= 1 ? 80 : 35);
      }
    }

    return Array.from(candidates.values())
      .sort((a, b) => b.priority - a.priority || b.captures - a.captures || a.point.y - b.point.y || a.point.x - b.point.x)
      .slice(0, limit);
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
    if (verification?.verifiedCapture || Number(candidate?.captures) > 0) return 500;
    if (verification?.verifiedRescue || Number(candidate?.rescueValue) > 0) return 400;
    if (verification?.verifiedNecessaryConnection || Number(candidate?.connectionValue) >= 2) return 300;
    return Number(candidate?.fusedPolicyScore ?? candidate?.combinedScore ?? candidate?.policyScore ?? 0);
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
      const adjustment = protectedUrgent ? 18 : refuted ? -36 : 0;
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
    groupAt,
    allGroups,
    libertyPoints,
    adjacentGroups,
    simulateMove,
    simulateMoveDetailed,
    verifyShallowTacticalCandidate,
    applyShallowTacticalVerification
  };
}));
