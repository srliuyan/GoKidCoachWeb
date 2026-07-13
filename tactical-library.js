(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachTacticalLibrary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const tacticalUrl = "assets/tactical-db.json";
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
    const size = board.length;
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
      for (const next of neighbors(point, size)) {
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
    if (edge <= 3) {
      return (point.x <= 3 || point.x >= size - 4) && (point.y <= 3 || point.y >= size - 4) ? "corner" : "side";
    }
    return "center";
  }

  function eyeNeighbors(board, point, color) {
    let own = 0;
    let opp = 0;
    let empties = 0;
    for (const next of neighbors(point, board.length)) {
      const value = board[next.y][next.x];
      if (value === color) own += 1;
      else if (value === opponent(color)) opp += 1;
      else empties += 1;
    }
    return { own, opp, empties };
  }

  function detectTacticalPattern(move, board, player, context = {}) {
    const simulation = simulateMove(board, move, player);
    if (!simulation) return { legal: false, patterns: [], primaryPattern: null, confidence: 0 };

    const ownBefore = uniqueAdjacentGroups(board, move, player);
    const oppBefore = uniqueAdjacentGroups(board, move, opponent(player));
    const ownAfter = simulation.ownGroup;
    const boardAfter = simulation.board;
    const patterns = [];

    let atariCount = 0;
    let pressureCount = 0;
    for (const group of oppBefore) {
      if (!group.liberties.has(pointKey(move))) continue;
      const anchor = group.stones[0];
      if (boardAfter[anchor.y][anchor.x] === empty) {
        patterns.push({ category: "capture", localScore: 10, urgency: 0.95, recommendedContinuation: "capture_now" });
        atariCount += 1;
      } else {
        const nextGroup = groupAt(boardAfter, anchor);
        if (nextGroup.liberties.size === 1) {
          atariCount += 1;
        } else if (nextGroup.liberties.size === 2) {
          pressureCount += 1;
        }
      }
    }
    if (atariCount >= 1) patterns.push({ category: "atari", localScore: 7, urgency: 0.84, recommendedContinuation: "keep_pressure" });
    if (atariCount >= 2) patterns.push({ category: "doubleAtari", localScore: 11, urgency: 0.96, recommendedContinuation: "force_capture_race" });

    if (simulation.captures === 1 && ownAfter.liberties.size === 1) {
      const liberty = Array.from(ownAfter.liberties)[0];
      const [lx, ly] = liberty.split(",").map(Number);
      const recapture = simulateMove(boardAfter, { x: lx, y: ly }, opponent(player));
      if (recapture && recapture.captures >= 1) {
        patterns.push({ category: "snapback", localScore: 9.5, urgency: 0.95, recommendedContinuation: "prepare_recap" });
      }
    }

    const defended = ownBefore.filter(group => group.liberties.has(pointKey(move)) && group.liberties.size <= 2);
    if (defended.some(group => group.liberties.size === 1)) {
      patterns.push({ category: "atariExtension", localScore: 8, urgency: 0.88, recommendedContinuation: "extend_and_stabilize" });
    }
    if (ownBefore.length >= 2) {
      patterns.push({ category: "connection", localScore: 6.5, urgency: defended.length ? 0.78 : 0.62, recommendedContinuation: "connect_groups" });
    }
    if (oppBefore.length >= 2) {
      patterns.push({ category: "cut", localScore: 7.5, urgency: 0.82, recommendedContinuation: "split_opponent" });
      if (ownBefore.length >= 1) patterns.push({ category: "peep", localScore: 4.5, urgency: 0.68, recommendedContinuation: "probe_connection" });
    }
    if (pressureCount >= 1 && simulation.captures === 0) {
      patterns.push({ category: "net", localScore: 6.2, urgency: 0.74, recommendedContinuation: "tighten_net" });
    }
    if (atariCount >= 1) {
      patterns.push({ category: "ladder", localScore: 6.4, urgency: 0.8, recommendedContinuation: "chase_along_ladder" });
    }
    if (defended.some(group => group.liberties.size === 1 && group.stones.length <= 3)) {
      patterns.push({ category: "ladderBreaker", localScore: 5.8, urgency: 0.78, recommendedContinuation: "break_ladder_shape" });
    }

    const eye = eyeNeighbors(board, move, player);
    if (eye.opp >= 3 && eye.own === 0 && ownAfter.liberties.size <= 2) {
      patterns.push({ category: "throwIn", localScore: 5.4, urgency: 0.73, recommendedContinuation: "throw_in_to_reduce_eye" });
    }
    if (eye.own >= 3 && eye.empties <= 1) {
      patterns.push({ category: "eyeShape", localScore: 4.2, urgency: 0.58, recommendedContinuation: "secure_eye_shape" });
    }
    let diagonalOpp = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = move.x + dx;
      const y = move.y + dy;
      if (x >= 0 && y >= 0 && x < board.length && y < board.length && board[y][x] === opponent(player)) diagonalOpp += 1;
    }
    if (eye.own >= 3 && diagonalOpp >= 2) {
      patterns.push({ category: "falseEye", localScore: 5, urgency: 0.67, recommendedContinuation: "punish_false_eye" });
    }

    if (atariCount >= 1 || defended.some(group => group.liberties.size === 1)) {
      patterns.push({ category: "senteMove", localScore: 5.6, urgency: 0.85, recommendedContinuation: "keep_initiative" });
    } else if (numeric(context.moveNumber, 0) >= 60) {
      patterns.push({ category: "goteMove", localScore: 2.2, urgency: 0.34, recommendedContinuation: "take_solid_profit" });
    }

    const map = new Map();
    for (const item of patterns) {
      if (!map.has(item.category)) map.set(item.category, item);
    }
    const deduped = Array.from(map.values()).sort((a, b) => b.localScore - a.localScore);
    return {
      legal: true,
      region: pointRegion(move, board.length),
      patterns: deduped,
      primaryPattern: deduped[0] || null,
      confidence: 0
    };
  }

  function buildIndex(db) {
    const map = new Map();
    for (const entry of Array.isArray(db?.patterns) ? db.patterns : []) {
      map.set(entry.category, entry);
    }
    return map;
  }

  function loadTacticalDb() {
    return fetch(tacticalUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Tactical db ${response.status}`);
        return response.json();
      })
      .then(db => {
        state.db = db;
        state.map = buildIndex(db);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-tactical-db-ready", { detail: db }));
        }
        return db;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function scoreTacticalMove(move, board, player, context = {}) {
    const detected = detectTacticalPattern(move, board, player, context);
    if (!detected.legal || !state.map) {
      return { tacticalScore: 0, confidence: 0, detectedPatterns: detected.patterns || [], primaryPattern: detected.primaryPattern, legal: detected.legal };
    }
    let totalScore = 0;
    let confidence = 0;
    const results = [];
    for (const pattern of detected.patterns) {
      const entry = state.map.get(pattern.category);
      if (!entry) continue;
      const entryConfidence = numeric(entry.confidence, 0);
      const weighted = (
        numeric(pattern.localScore) +
        numeric(entry.urgency) * 5 +
        numeric(entry.successFrequency) * 6 +
        numeric(entry.frequency) / 1200
      ) * Math.max(0.3, entryConfidence);
      totalScore += weighted;
      confidence = Math.max(confidence, entryConfidence);
      results.push({ ...pattern, library: entry, weightedScore: weighted });
    }
    return {
      legal: true,
      tacticalScore: Number(totalScore.toFixed(2)),
      confidence: Number(confidence.toFixed(3)),
      detectedPatterns: results,
      primaryPattern: results[0] || detected.primaryPattern || null
    };
  }

  function applyTacticalScores(candidates, board, player, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const scored = scoreTacticalMove(candidate.point, board, player, {
        ...context,
        moveNumber: numeric(candidate.moveNumber, context.moveNumber)
      });
      return {
        ...candidate,
        tacticalScore: numeric(scored.tacticalScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(scored.confidence, 0)),
        tacticalCategory: scored.primaryPattern?.category || "",
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(scored.tacticalScore, 0)
      };
    });
  }

  function explainTacticalDecision(result) {
    if (!result?.primaryPattern) return "No tactical pattern recognized.";
    return `${result.primaryPattern.category} with ${Math.round(numeric(result.confidence) * 100)}% confidence.`;
  }

  function resetForTests(db) {
    state.db = db || null;
    state.map = db ? buildIndex(db) : null;
    state.loaded = Boolean(db);
    state.failed = false;
  }

  const api = {
    state,
    loadTacticalDb,
    detectTacticalPattern,
    scoreTacticalMove,
    applyTacticalScores,
    explainTacticalDecision,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadTacticalDb();
  }

  return api;
}));
