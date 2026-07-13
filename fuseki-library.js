(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachFusekiLibrary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const fusekiUrl = "assets/fuseki-db.json";
  const empty = 0;
  const black = 1;
  const white = 2;
  const startMove = 20;
  const endMove = 80;
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

  function pointRegion(point, size) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    if (edge <= 3) {
      return (point.x <= 3 || point.x >= size - 4) && (point.y <= 3 || point.y >= size - 4) ? "corner" : "side";
    }
    return "center";
  }

  function pointZone(point, size) {
    const third = Math.floor(size / 3);
    const col = point.x < third ? 0 : point.x < size - third ? 1 : 2;
    const row = point.y < third ? 0 : point.y < size - third ? 1 : 2;
    return ["N", "C", "S"][row] + ["W", "C", "E"][col];
  }

  function zoneBucket(zone) {
    return ["NW", "NE", "SW", "SE", "NC", "SC", "CW", "CE"].includes(zone) ? zone : "CC";
  }

  function quadrantEmptyCounts(board) {
    const counts = {};
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] !== empty) continue;
        const key = zoneBucket(pointZone({ x, y }, board.length));
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }

  function biggestOpenArea(board) {
    const counts = quadrantEmptyCounts(board);
    const entries = Object.entries(counts);
    if (!entries.length) return "CC";
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return entries[0][0];
  }

  function cornerStatus(board, player) {
    const size = board.length;
    const corners = [
      { name: "NW", x0: 0, x1: 6, y0: 0, y1: 6 },
      { name: "NE", x0: size - 6, x1: size, y0: 0, y1: 6 },
      { name: "SW", x0: 0, x1: 6, y0: size - 6, y1: size },
      { name: "SE", x0: size - 6, x1: size, y0: size - 6, y1: size }
    ];
    const parts = [];
    for (const corner of corners) {
      let own = 0;
      let opp = 0;
      for (let y = corner.y0; y < corner.y1; y += 1) {
        for (let x = corner.x0; x < corner.x1; x += 1) {
          if (board[y][x] === player) own += 1;
          else if (board[y][x] === opponent(player)) opp += 1;
        }
      }
      if (!own && !opp) parts.push("E");
      else if (own >= opp + 2) parts.push("O");
      else if (opp >= own + 2) parts.push("X");
      else parts.push("M");
    }
    return parts.join("");
  }

  function occupiedCorners(board) {
    const size = board.length;
    const regions = [
      { x0: 0, x1: 6, y0: 0, y1: 6 },
      { x0: size - 6, x1: size, y0: 0, y1: 6 },
      { x0: 0, x1: 6, y0: size - 6, y1: size },
      { x0: size - 6, x1: size, y0: size - 6, y1: size }
    ];
    return regions.filter(region => {
      for (let y = region.y0; y < region.y1; y += 1) {
        for (let x = region.x0; x < region.x1; x += 1) {
          if (board[y][x] !== empty) return true;
        }
      }
      return false;
    }).length;
  }

  function sideSignature(board, player) {
    const size = board.length;
    const sides = [
      { key: "N", points: () => ({ y0: 0, y1: 4, x0: 4, x1: size - 4 }) },
      { key: "E", points: () => ({ y0: 4, y1: size - 4, x0: size - 4, x1: size }) },
      { key: "S", points: () => ({ y0: size - 4, y1: size, x0: 4, x1: size - 4 }) },
      { key: "W", points: () => ({ y0: 4, y1: size - 4, x0: 0, x1: 4 }) }
    ];
    const chars = [];
    let ownOccupied = 0;
    let oppOccupied = 0;
    for (const side of sides) {
      const box = side.points();
      let own = 0;
      let opp = 0;
      for (let y = box.y0; y < box.y1; y += 1) {
        for (let x = box.x0; x < box.x1; x += 1) {
          if (board[y][x] === player) own += 1;
          else if (board[y][x] === opponent(player)) opp += 1;
        }
      }
      if (!own && !opp) chars.push("E");
      else if (own > opp) {
        chars.push("O");
        ownOccupied += 1;
      } else if (opp > own) {
        chars.push("X");
        oppOccupied += 1;
      } else {
        chars.push("M");
      }
    }
    return { signature: chars.join(""), ownOccupied, oppOccupied };
  }

  function occupiedSideCount(board) {
    const size = board.length;
    const checks = [
      { y0: 0, y1: 4, x0: 4, x1: size - 4 },
      { y0: 4, y1: size - 4, x0: size - 4, x1: size },
      { y0: size - 4, y1: size, x0: 4, x1: size - 4 },
      { y0: 4, y1: size - 4, x0: 0, x1: 4 }
    ];
    let count = 0;
    for (const box of checks) {
      let occupied = false;
      for (let y = box.y0; y < box.y1 && !occupied; y += 1) {
        for (let x = box.x0; x < box.x1; x += 1) {
          if (board[y][x] !== empty) {
            occupied = true;
            break;
          }
        }
      }
      if (occupied) count += 1;
    }
    return count;
  }

  function frameworkBias(board, player) {
    const scores = {};
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        const value = board[y][x];
        if (value === empty) continue;
        const zone = zoneBucket(pointZone({ x, y }, board.length));
        scores[zone] = (scores[zone] || 0) + (value === player ? 1 : -0.9);
      }
    }
    const entries = Object.entries(scores);
    if (!entries.length) return "CC";
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return entries[0][0];
  }

  function nearestFriendlyDistance(board, point, player) {
    let best = Infinity;
    for (let y = 0; y < board.length; y += 1) {
      for (let x = 0; x < board.length; x += 1) {
        if (board[y][x] !== player) continue;
        best = Math.min(best, Math.abs(point.x - x) + Math.abs(point.y - y));
      }
    }
    return best;
  }

  function transitionType(previousRegion, currentRegion) {
    if (previousRegion === "corner" && currentRegion === "side") return "cornerToSide";
    if (previousRegion === "side" && currentRegion === "center") return "sideToCenter";
    if (previousRegion === "corner" && currentRegion === "center") return "cornerToCenter";
    if (previousRegion === "side" && currentRegion === "side") return "sideToSide";
    if (previousRegion === "center" && currentRegion === "side") return "centerToSide";
    if (previousRegion === currentRegion) return "sameRegion";
    return "other";
  }

  function descriptorKey(board, player, moveNumber) {
    const side = sideSignature(board, player);
    return [
      String(Math.min(6, Math.floor((moveNumber - startMove) / 10))),
      cornerStatus(board, player),
      side.signature,
      biggestOpenArea(board),
      frameworkBias(board, player),
      String(occupiedCorners(board)),
      String(occupiedSideCount(board)),
      String(Math.min(4, side.ownOccupied)),
      String(Math.min(4, side.oppOccupied))
    ].join("|");
  }

  function evaluateFuseki(board, player = black, context = {}) {
    const moveNumber = numeric(context.moveNumber, 0);
    return {
      active: moveNumber >= startMove && moveNumber <= endMove,
      moveNumber,
      biggestOpenArea: biggestOpenArea(board),
      frameworkBias: frameworkBias(board, player),
      descriptorKey: descriptorKey(board, player, moveNumber)
    };
  }

  function actionKey(move, board, player, context = {}) {
    const moveNumber = numeric(context.moveNumber, 0);
    const region = pointRegion(move, board.length);
    const zone = zoneBucket(pointZone(move, board.length));
    const bigOpenArea = biggestOpenArea(board);
    const previousRegion = context.previousOwnRegion || "none";
    const nearest = nearestFriendlyDistance(board, move, player);
    let sideExtension = 0;
    if (region === "side") {
      for (const next of neighbors(move, board.length)) {
        if (board[next.y][next.x] === player && pointRegion(next, board.length) === "side") {
          sideExtension = 1;
          break;
        }
      }
    }
    const cornerTransition = previousRegion === "corner" && region === "side" ? 1 : 0;
    const sideCenterTransition = previousRegion === "side" && region === "center" ? 1 : 0;
    const largeScale = nearest >= 5 && zone === bigOpenArea ? 1 : 0;
    const openAreaHit = zone === bigOpenArea ? 1 : 0;
    return [
      region,
      zone,
      transitionType(previousRegion, region),
      String(openAreaHit),
      String(sideExtension),
      String(cornerTransition),
      String(sideCenterTransition),
      String(largeScale)
    ].join("|");
  }

  function buildIndex(db) {
    const map = new Map();
    for (const entry of Array.isArray(db?.entries) ? db.entries : []) {
      map.set(entry.k, entry);
    }
    return map;
  }

  function loadFusekiDb() {
    return fetch(fusekiUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Fuseki db ${response.status}`);
        return response.json();
      })
      .then(db => {
        state.db = db;
        state.map = buildIndex(db);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-fuseki-db-ready", { detail: db }));
        }
        return db;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function previousOwnRegionFromHistory(moveHistory, player, size) {
    if (!Array.isArray(moveHistory)) return "none";
    for (let index = moveHistory.length - 1; index >= 0; index -= 1) {
      const move = moveHistory[index];
      if (move?.color !== player || move?.pass) continue;
      return pointRegion({ x: move.x, y: move.y }, size);
    }
    return "none";
  }

  function fallbackGlobalScore(db, key, action) {
    const options = Array.isArray(db?.global?.[key]) ? db.global[key] : [];
    const entry = options.find(item => item.k === action);
    if (!entry) return { score: 0, confidence: 0 };
    return {
      score: numeric(entry.c) * 0.28 * Math.max(0.35, numeric(entry.f, 0)),
      confidence: numeric(entry.f, 0)
    };
  }

  function scoreFusekiMove(move, board, player = black, context = {}) {
    const moveNumber = numeric(context.moveNumber, 0);
    const openingBookScore = numeric(context.openingBookScore, 0);
    if (moveNumber < startMove || moveNumber > endMove) {
      return { fusekiScore: 0, confidence: 0, descriptor: null, action: "", active: false };
    }
    const db = state.db;
    const map = state.map;
    if (!db || !map) {
      return { fusekiScore: 0, confidence: 0, descriptor: null, action: "", active: true };
    }

    const evalResult = evaluateFuseki(board, player, { moveNumber });
    const previousOwnRegion = context.previousOwnRegion || previousOwnRegionFromHistory(context.moveHistory, player, board.length);
    const actKey = actionKey(move, board, player, { moveNumber, previousOwnRegion });
    const entry = map.get(evalResult.descriptorKey) || null;
    let score = 0;
    let confidence = 0;
    let usedGlobal = false;

    if (entry && entry.a && entry.a[actKey]) {
      const action = entry.a[actKey];
      confidence = Math.min(0.99, Math.max(numeric(action.f, 0), numeric(entry.c, 0) * 0.75));
      score = (numeric(action.c) / Math.max(1, numeric(entry.t))) * 110;
      score += (numeric(action.w, 0.5) - 0.5) * 24;
      score += confidence * 10;
    } else {
      const bucketKey = `${Math.min(6, Math.floor((moveNumber - startMove) / 10))}|${evalResult.biggestOpenArea}|${evalResult.frameworkBias}`;
      const fallback = fallbackGlobalScore(db, bucketKey, actKey);
      score = fallback.score;
      confidence = fallback.confidence;
      usedGlobal = score > 0;
    }

    const activation = moveNumber <= 36 && openingBookScore > 18
      ? 0.22
      : moveNumber <= 45 && openingBookScore > 8
        ? 0.58
        : 1;

    return {
      active: true,
      descriptor: evalResult,
      action: actKey,
      fusekiScore: Number((score * activation).toFixed(2)),
      confidence: Number((confidence * activation).toFixed(3)),
      usedGlobal
    };
  }

  function applyFusekiScores(candidates, board, player = black, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const scored = scoreFusekiMove(candidate.point, board, player, {
        ...context,
        moveNumber: numeric(candidate.moveNumber, context.moveNumber),
        openingBookScore: numeric(candidate.openingBookScore, context.openingBookScore)
      });
      return {
        ...candidate,
        fusekiScore: numeric(scored.fusekiScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(scored.confidence, 0)),
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(scored.fusekiScore, 0)
      };
    });
  }

  function explainFusekiDecision(result) {
    if (!result?.descriptor) return "Fuseki continuation unavailable.";
    return `Fuseki ${result.usedGlobal ? "global" : "local"} continuation, open area ${result.descriptor.biggestOpenArea}, confidence ${Math.round(numeric(result.confidence) * 100)}%.`;
  }

  function resetForTests(db) {
    state.db = db || null;
    state.map = db ? buildIndex(db) : null;
    state.loaded = Boolean(db);
    state.failed = false;
  }

  const api = {
    state,
    loadFusekiDb,
    evaluateFuseki,
    scoreFusekiMove,
    applyFusekiScores,
    explainFusekiDecision,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadFusekiDb();
  }

  return api;
}));
