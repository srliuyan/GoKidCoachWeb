(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachPolicyPattern = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const patternUrl = "assets/pattern-db.json";
  const empty = 0;
  const black = 1;
  const white = 2;
  const boundary = 3;
  const symmetries = [0, 1, 2, 3, 4, 5, 6, 7];
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
      const anchor = group.stones
        .slice()
        .sort((a, b) => a.y - b.y || a.x - b.x)[0];
      const key = pointKey(anchor);
      if (seen.has(key)) continue;
      seen.add(key);
      groups.push(group);
    }
    return groups;
  }

  function simulateMove(board, point, color) {
    if (!board || !Array.isArray(board) || !board.length) return null;
    const size = board.length;
    if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) return null;
    if (board[point.y][point.x] !== empty) return null;
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
    if (ownGroup.liberties.size === 0) return null;
    return { board: nextBoard, captures, ownGroup };
  }

  function classifyRegion(point, size) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    if (edge <= 3) {
      const corner = (point.x <= 3 || point.x >= size - 4) && (point.y <= 3 || point.y >= size - 4);
      return corner ? "corner" : "edge";
    }
    return "center";
  }

  function normalizeCell(value, player) {
    if (value === empty) return empty;
    if (value === player) return black;
    if (value === opponent(player)) return white;
    return boundary;
  }

  function transform(dx, dy, symmetry) {
    if (symmetry === 0) return { x: dx, y: dy };
    if (symmetry === 1) return { x: -dx, y: dy };
    if (symmetry === 2) return { x: dx, y: -dy };
    if (symmetry === 3) return { x: -dx, y: -dy };
    if (symmetry === 4) return { x: dy, y: dx };
    if (symmetry === 5) return { x: -dy, y: dx };
    if (symmetry === 6) return { x: dy, y: -dx };
    return { x: -dy, y: -dx };
  }

  function cellChar(value) {
    if (value === empty) return "0";
    if (value === black) return "1";
    if (value === white) return "2";
    return "x";
  }

  function serializePattern(board, point, player, radius, symmetry) {
    const size = board.length;
    let cells = "";
    let ownCount = 0;
    let oppCount = 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const translated = transform(dx, dy, symmetry);
        const x = point.x + translated.x;
        const y = point.y + translated.y;
        let value = boundary;
        if (x >= 0 && y >= 0 && x < size && y < size) {
          value = normalizeCell(board[y][x], player);
          if (dx === 0 && dy === 0) value = empty;
        }
        if (value === black) ownCount += 1;
        if (value === white) oppCount += 1;
        cells += cellChar(value);
      }
    }
    return { cells, ownCount, oppCount };
  }

  function extractLocalPattern(board, move, player, context = {}) {
    const simulation = simulateMove(board, move, player);
    if (!simulation) {
      return {
        legal: false,
        key: "",
        pattern3: "",
        pattern5: "",
        confidence: 0,
        region: classifyRegion(move, board?.length || 19)
      };
    }

    let best = null;
    for (const symmetry of symmetries) {
      const p5 = serializePattern(board, move, player, 2, symmetry);
      const p3 = serializePattern(board, move, player, 1, symmetry);
      const key = `${p5.cells}|${p3.cells}`;
      if (!best || key < best.key) {
        best = {
          key,
          pattern3: p3.cells,
          pattern5: p5.cells,
          ownCount: p5.ownCount,
          oppCount: p5.oppCount
        };
      }
    }

    const ownBefore = uniqueAdjacentGroups(board, move, player);
    const oppBefore = uniqueAdjacentGroups(board, move, opponent(player));
    const minOwnLib = ownBefore.length
      ? Math.min(...ownBefore.map(group => group.liberties.size))
      : 4;
    const minOppLib = oppBefore.length
      ? Math.min(...oppBefore.map(group => group.liberties.size))
      : 4;
    const connection = ownBefore.length >= 2 ? 1 : 0;
    const cut = oppBefore.length >= 2 ? 1 : 0;
    let atari = 0;
    for (const next of neighbors(move, simulation.board.length)) {
      if (simulation.board[next.y][next.x] !== opponent(player)) continue;
      const group = groupAt(simulation.board, next);
      if (group.liberties.size === 1) {
        atari = 1;
        break;
      }
    }

    const moveNumber = numeric(context.moveNumber, 0);
    const turnBucket = Math.min(9, Math.floor(moveNumber / 20));
    const rescue = ownBefore.some(group => group.liberties.has(pointKey(move)) && group.liberties.size <= 2) ? 1 : 0;
    const postLibs = Math.min(4, simulation.ownGroup.liberties.size);
    const region = classifyRegion(move, board.length);
    const fullKey = [
      best.pattern5,
      best.pattern3,
      region,
      String(turnBucket),
      String(Math.min(12, best.ownCount)),
      String(Math.min(12, best.oppCount)),
      String(Math.min(4, minOwnLib)),
      String(Math.min(4, minOppLib)),
      String(postLibs),
      String(atari),
      String(simulation.captures > 0 ? 1 : 0),
      String(connection),
      String(cut),
      String(rescue)
    ].join("|");

    return {
      legal: true,
      key: fullKey,
      pattern3: best.pattern3,
      pattern5: best.pattern5,
      region,
      ownCount: best.ownCount,
      oppCount: best.oppCount,
      flags: {
        atari,
        capture: simulation.captures > 0 ? 1 : 0,
        connection,
        cut,
        rescue
      }
    };
  }

  function buildIndex(db) {
    const map = new Map();
    const patterns = Array.isArray(db?.patterns) ? db.patterns : [];
    for (const entry of patterns) {
      if (entry?.k) map.set(entry.k, entry);
    }
    return map;
  }

  function loadPatternDb() {
    return fetch(patternUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Pattern db ${response.status}`);
        return response.json();
      })
      .then(db => {
        state.db = db;
        state.map = buildIndex(db);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-pattern-db-ready", { detail: db }));
        }
        return db;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function lookupPatternScore(board, move, player, context = {}) {
    const map = state.map;
    const pattern = extractLocalPattern(board, move, player, context);
    if (!pattern.legal || !map || !map.size) {
      return {
        patternScore: 0,
        confidence: 0,
        entry: null,
        pattern
      };
    }
    const entry = map.get(pattern.key) || null;
    if (!entry) {
      return {
        patternScore: 0,
        confidence: 0,
        entry: null,
        pattern
      };
    }
    const confidence = numeric(entry.f, 0);
    const rawScore = numeric(entry.q, 0);
    return {
      patternScore: rawScore,
      confidence,
      entry,
      pattern
    };
  }

  function applyPatternScores(candidates, board, player, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const lookup = lookupPatternScore(board, candidate.point, player, {
        ...context,
        moveNumber: numeric(candidate.moveNumber, context.moveNumber)
      });
      return {
        ...candidate,
        patternScore: numeric(lookup.patternScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(lookup.confidence, 0)),
        patternKey: lookup.pattern?.key || "",
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(lookup.patternScore, 0)
      };
    });
  }

  function resetForTests(db) {
    state.db = db || null;
    state.map = db ? buildIndex(db) : null;
    state.loaded = Boolean(db);
    state.failed = false;
  }

  const api = {
    state,
    loadPatternDb,
    extractLocalPattern,
    lookupPatternScore,
    applyPatternScores,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadPatternDb();
  }

  return api;
}));
