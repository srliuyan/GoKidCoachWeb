(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachShapeLibrary = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const shapeUrl = "assets/shape-library.json";
  const empty = 0;
  const black = 1;
  const white = 2;
  const state = {
    loaded: false,
    failed: false,
    library: null,
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
    return { board: nextBoard, ownGroup, captures };
  }

  function classifyRegion(point, size) {
    const edge = Math.min(point.x, point.y, size - 1 - point.x, size - 1 - point.y);
    if (edge <= 3) {
      const corner = (point.x <= 3 || point.x >= size - 4) && (point.y <= 3 || point.y >= size - 4);
      return corner ? "corner" : "edge";
    }
    return "center";
  }

  function getCell(board, x, y) {
    if (!board || y < 0 || x < 0 || y >= board.length || x >= board.length) return null;
    return board[y][x];
  }

  function orthogonalPairs() {
    return [
      [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: -1 }],
      [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 1, y: -1 }],
      [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
      [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: -1, y: 1 }]
    ];
  }

  function detectShape(move, board, player, context = {}) {
    const simulation = simulateMove(board, move, player);
    if (!simulation) return { legal: false, shapes: [], primaryShape: null, region: classifyRegion(move, board?.length || 19) };

    const boardAfter = simulation.board;
    const ownBefore = uniqueAdjacentGroups(board, move, player);
    const oppBefore = uniqueAdjacentGroups(board, move, opponent(player));
    const ownAfter = simulation.ownGroup;
    const region = classifyRegion(move, board.length);
    const edge = Math.min(move.x, move.y, board.length - 1 - move.x, board.length - 1 - move.y);

    function ownAfterAt(dx, dy) {
      return getCell(boardAfter, move.x + dx, move.y + dy) === player;
    }

    function ownBeforeAt(dx, dy) {
      return getCell(board, move.x + dx, move.y + dy) === player;
    }

    function oppBeforeAt(dx, dy) {
      return getCell(board, move.x + dx, move.y + dy) === opponent(player);
    }

    const shapes = [];
    for (const [first, second, diagonal] of orthogonalPairs()) {
      if (ownAfterAt(first.x, first.y) && ownAfterAt(second.x, second.y)) {
        const diagonalValue = getCell(boardAfter, move.x + diagonal.x, move.y + diagonal.y);
        if (diagonalValue === player) {
          shapes.push({ shapeType: "emptyTriangle", localScore: -8, riskPenalty: 7, region });
        } else if (diagonalValue === empty || diagonalValue === opponent(player) || diagonalValue === null) {
          shapes.push({ shapeType: "tigerMouth", localScore: 7, riskPenalty: 0.5, region });
        }
      }
    }

    const bambooPatterns = [
      [[0, 1], [2, 0], [2, 1]],
      [[0, -1], [2, 0], [2, -1]],
      [[0, 1], [-2, 0], [-2, 1]],
      [[0, -1], [-2, 0], [-2, -1]],
      [[1, 0], [0, 2], [1, 2]],
      [[-1, 0], [0, 2], [-1, 2]],
      [[1, 0], [0, -2], [1, -2]],
      [[-1, 0], [0, -2], [-1, -2]]
    ];
    if (bambooPatterns.some(([a, b, c]) => ownAfterAt(a[0], a[1]) && ownAfterAt(b[0], b[1]) && ownAfterAt(c[0], c[1]))) {
      shapes.push({ shapeType: "bambooJoint", localScore: 8, riskPenalty: 0, region });
    }

    if ([[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => ownBeforeAt(dx, dy) && getCell(board, move.x + dx / 2, move.y + dy / 2) === empty)) {
      shapes.push({ shapeType: "onePointJump", localScore: 5, riskPenalty: 1, region });
    }

    if ([[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]].some(([dx, dy]) => ownBeforeAt(dx, dy))) {
      shapes.push({ shapeType: "knightMove", localScore: 4.5, riskPenalty: 1.5, region });
    }

    if ([[3, 1], [3, -1], [-3, 1], [-3, -1], [1, 3], [-1, 3], [1, -3], [-1, -3]].some(([dx, dy]) => ownBeforeAt(dx, dy))) {
      shapes.push({ shapeType: "largeKnightMove", localScore: 3.5, riskPenalty: 2.5, region });
    }

    if ([[1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => ownBeforeAt(dx, dy))) {
      shapes.push({ shapeType: "diagonal", localScore: 2.5, riskPenalty: 1, region });
    }

    if (ownBefore.length >= 2) {
      shapes.push({ shapeType: "solidConnection", localScore: 7.5, riskPenalty: 0, region });
    }

    if (oppBefore.length >= 2) {
      shapes.push({ shapeType: "cut", localScore: 8.5, riskPenalty: 0.5, region });
      if (ownBefore.length >= 1) shapes.push({ shapeType: "peep", localScore: 4.5, riskPenalty: 0.5, region });
    }

    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => oppBeforeAt(dx, dy))) {
      if (ownBefore.length >= 1) shapes.push({ shapeType: "hane", localScore: 4, riskPenalty: 1, region });
      else shapes.push({ shapeType: "attach", localScore: 2.5, riskPenalty: 2, region });
      if (edge >= 3) shapes.push({ shapeType: "shoulderHit", localScore: 3, riskPenalty: 1.5, region });
    }

    if (ownBefore.length === 1 && oppBefore.length === 0 && ownAfter.liberties.size > 0) {
      shapes.push({ shapeType: "extend", localScore: 3.5, riskPenalty: 0.5, region });
    }

    const enemyGroupsAfter = [];
    for (const next of neighbors(move, boardAfter.length)) {
      if (boardAfter[next.y][next.x] !== opponent(player)) continue;
      enemyGroupsAfter.push(groupAt(boardAfter, next));
    }
    if (enemyGroupsAfter.some(group => group.liberties.size <= 2) && simulation.captures === 0) {
      shapes.push({ shapeType: "net", localScore: 6.5, riskPenalty: 1, region });
    }
    if (enemyGroupsAfter.some(group => group.liberties.size === 1)) {
      shapes.push({ shapeType: "ladderRelated", localScore: 7, riskPenalty: 0.5, region });
    }

    const deduped = [];
    const seen = new Set();
    for (const item of shapes) {
      if (seen.has(item.shapeType)) continue;
      seen.add(item.shapeType);
      deduped.push(item);
    }
    deduped.sort((a, b) => numeric(b.localScore) - numeric(a.localScore));

    return {
      legal: true,
      region,
      shapes: deduped,
      primaryShape: deduped[0] || null,
      moveNumber: numeric(context.moveNumber, 0),
      captures: simulation.captures,
      ownLiberties: ownAfter.liberties.size
    };
  }

  function buildIndex(library) {
    const map = new Map();
    for (const entry of Array.isArray(library?.shapes) ? library.shapes : []) {
      map.set(entry.shapeType, entry);
    }
    return map;
  }

  function loadShapeLibrary() {
    return fetch(shapeUrl, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Shape library ${response.status}`);
        return response.json();
      })
      .then(library => {
        state.library = library;
        state.map = buildIndex(library);
        state.loaded = true;
        state.failed = false;
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("gokidcoach-shape-library-ready", { detail: library }));
        }
        return library;
      })
      .catch(error => {
        state.failed = true;
        state.error = error.message;
        return null;
      });
  }

  function scoreShape(move, board, player, context = {}) {
    const detected = detectShape(move, board, player, context);
    const map = state.map;
    if (!detected.legal || !map || !map.size) {
      return { shapeScore: 0, confidence: 0, detectedShapes: detected.shapes || [], primaryShape: detected.primaryShape, legal: detected.legal };
    }

    let totalScore = 0;
    let bestConfidence = 0;
    const details = [];
    for (const shape of detected.shapes) {
      const entry = map.get(shape.shapeType);
      if (!entry) continue;
      const confidence = numeric(entry.confidence, 0);
      const regionBias = numeric(entry.regionBias?.[detected.region], 0.2);
      const baseScore = (
        numeric(entry.tacticalValue) * 2.2 +
        numeric(entry.connectionValue) * 1.8 +
        numeric(entry.territoryValue) * 1.2 +
        numeric(entry.influenceValue) * 1.2 -
        numeric(entry.riskPenalty) * 2.3 +
        numeric(shape.localScore)
      ) * Math.max(0.2, 0.55 + regionBias);
      const weighted = baseScore * confidence;
      totalScore += weighted;
      if (confidence > bestConfidence) bestConfidence = confidence;
      details.push({ ...shape, weightedScore: weighted, confidence, library: entry });
    }

    return {
      legal: true,
      shapeScore: Number(totalScore.toFixed(2)),
      confidence: Number(bestConfidence.toFixed(3)),
      detectedShapes: details,
      primaryShape: details[0] || detected.primaryShape || null
    };
  }

  function applyShapeScores(candidates, board, player, context = {}) {
    return (Array.isArray(candidates) ? candidates : []).map(candidate => {
      if (!candidate?.point) return candidate;
      const scored = scoreShape(candidate.point, board, player, { ...context, moveNumber: numeric(candidate.moveNumber, context.moveNumber) });
      return {
        ...candidate,
        shapeScore: numeric(scored.shapeScore, 0),
        confidence: Math.max(numeric(candidate.confidence, 0), numeric(scored.confidence, 0)),
        shapeType: scored.primaryShape?.shapeType || "",
        combinedScore: numeric(candidate.combinedScore, 0) + numeric(scored.shapeScore, 0)
      };
    });
  }

  function explainShape(shapeResult) {
    if (!shapeResult?.primaryShape) return "No recognized shape.";
    const item = shapeResult.primaryShape;
    return `${item.shapeType} with ${Math.round(numeric(shapeResult.confidence) * 100)}% confidence.`;
  }

  function resetForTests(library) {
    state.library = library || null;
    state.map = library ? buildIndex(library) : null;
    state.loaded = Boolean(library);
    state.failed = false;
  }

  const api = {
    state,
    loadShapeLibrary,
    detectShape,
    scoreShape,
    applyShapeScores,
    explainShape,
    resetForTests
  };

  if (typeof window !== "undefined" && typeof fetch === "function") {
    loadShapeLibrary();
  }

  return api;
}));
