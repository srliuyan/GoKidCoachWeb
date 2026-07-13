(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachEndgameLibrary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const endgameUrl = "assets/endgame-db.json";
  const empty = 0;
  const black = 1;
  const white = 2;
  const state = {
    loaded: false,
    failed: false,
    db: null,
    map: null
  };

  function numeric(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
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
    const color = board[start.y][start.x];
    if (color === empty) return { stones: [], liberties: new Set() };
    const seen = new Set();
    const stack = [start];
    const stones = [];
    const liberties = new Set();
    while (stack.length) {
      const point = stack.pop();
      const key = pointKey(point);
      if (seen.has(key)) continue;
      seen.add(key);
      stones.push(point);
      for (const next of neighbors(point, board.length)) {
        const value = board[next.y][next.x];
        if (value === empty) liberties.add(pointKey(next));
        else if (value === color) stack.push(next);
      }
    }
    return { stones, liberties };
  }

  function uniqueAdjacentGroups(board, point, color) {
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

  function simulateMove(board, point, color) {
    if (!board || !board.length) return null;
    if (point.x < 0 || point.y < 0 || point.x >= board.length || point.y >= board.length) return null;
    if (board[point.y][point.x] !== empty) return null;
    const nextBoard = cloneBoard(board);
    nextBoard[point.y][point.x] = color;
    let captures = 0;
    for (const next of neighbors(point, board.length)) {
      if (nextBoard[next.y][next.x] !== opponent(color)) continue;
      const group = groupAt(nextBoard, next);
      if (group.liberties.size !== 0) continue;
      captures += group.stones.length;
      for (const stone of group.stones) nextBoard[stone.y][stone.x] = empty;
    }
    const ownGroup = groupAt(nextBoard, point);
    if (ownGroup.liberties.size === 0) return null;
    return { board: nextBoard, ownGroup, captures };
  }

  function pointRegion(point, size) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    if (edge <= 2) {
      return (point.x <= 2 || point.x >= size - 3) && (point.y <= 2 || point.y >= size - 3) ? "corner" : "edge";
    }
    return "center";
  }

  function localPattern(board, point, player, radius = 2) {
    let pattern = "";
    let own = 0;
    let opp = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = point.x + dx;
        const y = point.y + dy;
        if (x < 0 || y < 0 || x >= board.length || y >= board.length) {
          pattern += "x";
          continue;
        }
        const value = board[y][x];
        if (dx === 0 && dy === 0) {
          pattern += "0";
        } else if (value === empty) {
          pattern += "0";
        } else if (value === player) {
          own += 1;
          pattern += "1";
        } else {
          opp += 1;
          pattern += "2";
        }
      }
    }
    return { pattern, own, opp };
  }

  function boardSettledRatio(board) {
    const seen = new Set();
    let settled = 0;
    let total = 0;
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] === empty || seen.has(`${x},${y}`)) continue;
        const group = groupAt(board, { x, y });
        for (const stone of group.stones) seen.add(pointKey(stone));
        total += 1;
        if (group.liberties.size >= 3) settled += 1;
      }
    }
    return settled / Math.max(1, total);
  }

  function detectEndgamePattern(board, move, player, context = {}) {
    const simulation = simulateMove(board, move, player);
    if (!simulation) return { legal: false, key: "", confidence: 0, active: false };

    const ownBefore = uniqueAdjacentGroups(board, move, player);
    const oppBefore = uniqueAdjacentGroups(board, move, opponent(player));
    const region = pointRegion(move, board.length);
    const local = localPattern(board, move, player);
    let threatenedOpp = 0;
    for (const group of oppBefore) {
      if (!group.liberties.has(pointKey(move))) continue;
      const anchor = group.stones[0];
      if (simulation.board[anchor.y][anchor.x] === empty) threatenedOpp += 2;
      else if (groupAt(simulation.board, anchor).liberties.size === 1) threatenedOpp += 1;
    }
    const rescuedOwn = ownBefore.filter(group => group.liberties.has(pointKey(move)) && group.liberties.size <= 2).length;
    const connectionValue = ownBefore.length >= 2 ? 1 : 0;
    const cutPrevention = rescuedOwn > 0 || connectionValue ? 1 : 0;
    const edgeTerritoryValue = region === "edge" && local.own >= local.opp && simulation.captures === 0 ? 1 : 0;
    const cornerEndgameValue = region === "corner" && local.own >= local.opp ? 1 : 0;
    const smallTerritoryGain = (region === "corner" || region === "edge") && simulation.ownGroup.liberties.size >= 2 && simulation.captures === 0 ? 1 : 0;
    const neutralPointPenalty = region === "center" && simulation.captures === 0 && threatenedOpp === 0 && rescuedOwn === 0 && connectionValue === 0 ? 1 : 0;
    const dame = neutralPointPenalty && local.own === 0 && local.opp === 0 ? 1 : 0;
    const senteLike = threatenedOpp > 0 || rescuedOwn > 0 ? 1 : 0;
    const goteLike = !senteLike && (smallTerritoryGain || edgeTerritoryValue || cornerEndgameValue) ? 1 : 0;
    const moveNumber = numeric(context.moveNumber, 0);
    const settledRatio = numeric(context.settledRatio, boardSettledRatio(board));
    const active = moveNumber >= 120 || settledRatio >= 0.58;
    const key = [
      region,
      Math.min(6, local.own),
      Math.min(6, local.opp),
      Math.min(2, simulation.captures),
      Math.min(2, threatenedOpp),
      Math.min(2, rescuedOwn),
      connectionValue,
      cutPrevention,
      edgeTerritoryValue,
      cornerEndgameValue,
      smallTerritoryGain,
      neutralPointPenalty,
      dame,
      local.pattern
    ].join("|");

    return {
      legal: true,
      active,
      key,
      region,
      senteLike,
      goteLike,
      edgeTerritoryValue,
      cornerEndgameValue,
      connectionEndgameValue: connectionValue,
      cutPrevention,
      neutralPointPenalty,
      dame,
      smallTerritoryGain,
      moveNumber,
      settledRatio,
      confidence: active ? 0.45 : 0.2
    };
  }

  function buildIndex(db) {
    const map = new Map();
    for (const entry of Array.isArray(db?.entries) ? db.entries : []) map.set(entry.k, entry);
    return map;
  }

  function loadEndgameDb() {
    return fetch(endgameUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Endgame db ${response.status}`);
        return response.json();
      })
      .then(db => {
        state.db = db;
        state.map = buildIndex(db);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-endgame-db-ready", { detail: db }));
        }
        return db;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function scoreEndgameMove(move, board, player, context = {}) {
    const detected = detectEndgamePattern(board, move, player, context);
    if (!detected.legal || !detected.active || !state.map) {
      return { endgameScore: 0, confidence: detected.active ? detected.confidence : 0, detectedPattern: detected, entry: null };
    }
    const entry = state.map.get(detected.key);
    if (!entry) return { endgameScore: 0, confidence: detected.confidence, detectedPattern: detected, entry: null };
    const phaseBoost = detected.moveNumber >= 140 ? 1.15 : detected.moveNumber >= 120 ? 1 : 0.82;
    const senteBonus = numeric(entry.s) * 26;
    const territoryBonus = numeric(entry.e) * 18 + numeric(entry.r) * 20 + numeric(entry.t) * 12;
    const connectionBonus = numeric(entry.n) * 14 + numeric(entry.p) * 12;
    const penalty = numeric(entry.u) * 18 + numeric(entry.d) * 24 + numeric(entry.g) * 6;
    const winBias = (numeric(entry.w, 0.5) - 0.5) * 18;
    const score = ((senteBonus + territoryBonus + connectionBonus - penalty + winBias) * numeric(entry.c, 0)) * phaseBoost;
    return {
      endgameScore: Number(score.toFixed(2)),
      confidence: Number(Math.min(0.99, Math.max(numeric(entry.c, 0), detected.confidence)).toFixed(3)),
      detectedPattern: detected,
      entry
    };
  }

  function applyEndgameScores(candidates, board, player, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const scored = scoreEndgameMove(candidate.point, board, player, {
        ...context,
        moveNumber: numeric(candidate.moveNumber, context.moveNumber)
      });
      return {
        ...candidate,
        endgameScore: numeric(scored.endgameScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(scored.confidence, 0)),
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(scored.endgameScore, 0)
      };
    });
  }

  function explainEndgameDecision(result) {
    if (!result?.entry) return "No matching endgame pattern.";
    const pattern = result.detectedPattern || {};
    if (pattern.dame) return "Late-game neutral point detected; avoid wasting dame.";
    if (pattern.senteLike) return "Late-game sente-like move with practical follow-up.";
    return `Endgame ${pattern.region || "local"} pattern, confidence ${Math.round(numeric(result.confidence) * 100)}%.`;
  }

  function resetForTests(db) {
    state.db = db || null;
    state.map = db ? buildIndex(db) : null;
    state.loaded = Boolean(db);
    state.failed = false;
  }

  const api = {
    state,
    loadEndgameDb,
    detectEndgamePattern,
    scoreEndgameMove,
    applyEndgameScores,
    explainEndgameDecision,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadEndgameDb();
  }

  return api;
}));
