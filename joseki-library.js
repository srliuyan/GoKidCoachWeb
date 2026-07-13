(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachJosekiLibrary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const josekiUrl = "assets/joseki-db.json";
  const empty = 0;
  const black = 1;
  const white = 2;
  const cornerSize = 7;
  const targetPoints = new Set(["3,3", "3,4", "4,3", "2,2", "5,3", "3,5", "4,5", "5,4"]);
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

  function cornerName(point, size) {
    const left = point.x < size / 2;
    const top = point.y < size / 2;
    if (top && left) return "NW";
    if (top && !left) return "NE";
    if (!top && left) return "SW";
    return "SE";
  }

  function toNorthWest(point, corner, size) {
    const last = size - 1;
    if (corner === "NW") return { x: point.x, y: point.y };
    if (corner === "NE") return { x: last - point.x, y: point.y };
    if (corner === "SW") return { x: point.x, y: last - point.y };
    return { x: last - point.x, y: last - point.y };
  }

  function fromNorthWest(point, corner, size) {
    const last = size - 1;
    if (corner === "NW") return { x: point.x, y: point.y };
    if (corner === "NE") return { x: last - point.x, y: point.y };
    if (corner === "SW") return { x: point.x, y: last - point.y };
    return { x: last - point.x, y: last - point.y };
  }

  function inCornerZone(point) {
    return point.x >= 0 && point.y >= 0 && point.x < cornerSize && point.y < cornerSize;
  }

  function anchorType(localMoves) {
    for (const move of localMoves) {
      const key = `${move.point.x},${move.point.y}`;
      if (targetPoints.has(key)) {
        if (key === "3,3") return "star";
        if (key === "3,4" || key === "4,3") return "komoku";
        if (key === "2,2") return "san-san";
        if (key === "5,3" || key === "3,5") return "mokuhazushi";
        if (key === "4,5" || key === "5,4") return "takamoku";
      }
    }
    return "other";
  }

  function normalizeCornerPattern(board, move, player, context = {}) {
    if (!board || !board.length) return { active: false, key: "", corner: "NW", pattern: "", sequence: "", moveKey: "" };
    const size = board.length;
    const corner = cornerName(move, size);
    const nwMove = toNorthWest(move, corner, size);
    if (!inCornerZone(nwMove)) return { active: false, key: "", corner, pattern: "", sequence: "", moveKey: "" };

    const localHistory = (Array.isArray(context.moveHistory) ? context.moveHistory : [])
      .filter(item => !item.pass)
      .map(item => ({
        color: item.color === black ? "B" : "W",
        point: toNorthWest({ x: item.x, y: item.y }, cornerName({ x: item.x, y: item.y }, size), size),
        original: item
      }))
      .filter(item => inCornerZone(item.point))
      .slice(-8);

    const anchor = anchorType(localHistory.concat([{ color: player === black ? "B" : "W", point: nwMove }]));
    let pattern = "";
    for (let y = 0; y < cornerSize; y += 1) {
      for (let x = 0; x < cornerSize; x += 1) {
        const original = fromNorthWest({ x, y }, corner, size);
        const value = board[original.y][original.x];
        if (value === empty) pattern += "0";
        else if (value === player) pattern += "1";
        else pattern += "2";
      }
    }
    const sequence = localHistory
      .map(item => `${item.color}${item.point.x},${item.point.y}`)
      .join(";");
    const moveKey = `${player === black ? "B" : "W"}${nwMove.x},${nwMove.y}`;
    return {
      active: true,
      corner,
      anchor,
      pattern,
      sequence,
      moveKey,
      key: `${anchor}|${pattern}|${sequence}`
    };
  }

  function buildIndex(db) {
    const map = new Map();
    for (const entry of Array.isArray(db?.entries) ? db.entries : []) {
      map.set(entry.k, entry);
    }
    return map;
  }

  function loadJosekiDb() {
    return fetch(josekiUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Joseki db ${response.status}`);
        return response.json();
      })
      .then(db => {
        state.db = db;
        state.map = buildIndex(db);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-joseki-db-ready", { detail: db }));
        }
        return db;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function lookupJosekiContinuation(board, move, player, context = {}) {
    const normalized = normalizeCornerPattern(board, move, player, context);
    if (!normalized.active || !state.map) {
      return { josekiScore: 0, confidence: 0, normalized, entry: null };
    }
    const entry = state.map.get(normalized.key);
    if (!entry) return { josekiScore: 0, confidence: 0, normalized, entry: null };
    const next = Array.isArray(entry.n) ? entry.n.find(item => item.k === normalized.moveKey) : null;
    if (!next) return { josekiScore: 0, confidence: 0, normalized, entry };
    const base = (numeric(next.c) / Math.max(1, numeric(entry.f))) * 120;
    const score = base + numeric(entry.c) * 12 - numeric(entry.r) * 5 + (numeric(entry.w, 0.5) - 0.5) * 20;
    return {
      josekiScore: Number(score.toFixed(2)),
      confidence: Number(Math.min(0.99, Math.max(numeric(entry.c), numeric(next.c) / Math.max(1, numeric(entry.f)))).toFixed(3)),
      normalized,
      entry,
      next
    };
  }

  function scoreJosekiMove(move, board, player, context = {}) {
    const moveNumber = numeric(context.moveNumber, 0);
    if (moveNumber > 80) return { josekiScore: 0, confidence: 0, normalized: { active: false }, entry: null };
    return lookupJosekiContinuation(board, move, player, context);
  }

  function applyJosekiScores(candidates, board, player, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const scored = scoreJosekiMove(candidate.point, board, player, {
        ...context,
        moveNumber: numeric(candidate.moveNumber, context.moveNumber)
      });
      return {
        ...candidate,
        josekiScore: numeric(scored.josekiScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(scored.confidence, 0)),
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(scored.josekiScore, 0)
      };
    });
  }

  function explainJosekiDecision(result) {
    if (!result?.entry) return "No joseki continuation available.";
    return `Joseki ${result.normalized.anchor}, confidence ${Math.round(numeric(result.confidence) * 100)}%.`;
  }

  function resetForTests(db) {
    state.db = db || null;
    state.map = db ? buildIndex(db) : null;
    state.loaded = Boolean(db);
    state.failed = false;
  }

  const api = {
    state,
    loadJosekiDb,
    normalizeCornerPattern,
    lookupJosekiContinuation,
    scoreJosekiMove,
    applyJosekiScores,
    explainJosekiDecision,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadJosekiDb();
  }

  return api;
}));
