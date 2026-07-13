(function () {
  const bookUrl = "assets/opening-book.json";
  const state = {
    loaded: false,
    failed: false,
    book: null
  };

  function transformPoint(point, symmetry, size) {
    const last = size - 1;
    if (symmetry === 0) return { x: point.x, y: point.y };
    if (symmetry === 1) return { x: last - point.x, y: point.y };
    if (symmetry === 2) return { x: point.x, y: last - point.y };
    if (symmetry === 3) return { x: last - point.x, y: last - point.y };
    if (symmetry === 4) return { x: point.y, y: point.x };
    if (symmetry === 5) return { x: last - point.y, y: point.x };
    if (symmetry === 6) return { x: point.y, y: last - point.x };
    return { x: last - point.y, y: last - point.x };
  }

  function serializePrefix(moves, symmetry, prefixLen, size) {
    const parts = [];
    for (let index = 0; index < prefixLen; index += 1) {
      const move = moves[index];
      if (move.pass) continue;
      const point = transformPoint({ x: move.x, y: move.y }, symmetry, size);
      parts.push(`${move.color === 1 ? "B" : "W"}${point.x},${point.y}`);
    }
    return parts.join(";");
  }

  function canonicalPrefix(moves, prefixLen, size) {
    let bestSerialized = "";
    let bestSymmetry = 0;
    let first = true;
    for (let symmetry = 0; symmetry < 8; symmetry += 1) {
      const serialized = serializePrefix(moves, symmetry, prefixLen, size);
      if (first || serialized < bestSerialized) {
        bestSerialized = serialized;
        bestSymmetry = symmetry;
        first = false;
      }
    }
    return { serialized: bestSerialized, symmetry: bestSymmetry };
  }

  function openingMoveScore(input) {
    const book = state.book;
    if (!book || input.size !== book.boardSize) return 0;
    if (input.moveHistory.length >= book.maxTurn) return 0;

    const { serialized, symmetry } = canonicalPrefix(input.moveHistory, input.moveHistory.length, input.size);
    const canonicalPoint = transformPoint(input.point, symmetry, input.size);
    const moveKey = `${input.color === 1 ? "B" : "W"}${canonicalPoint.x},${canonicalPoint.y}`;
    const turn = String(input.moveHistory.length);

    let score = 0;
    const sequenceKey = `${input.moveHistory.length}|${serialized}`;
    const sequenceEntry = book.sequenceBook?.[sequenceKey];
    if (sequenceEntry) {
      const moveCount = Number(sequenceEntry.moves?.[moveKey] || 0);
      if (moveCount > 0 && sequenceEntry.total > 0) {
        score += moveCount / sequenceEntry.total * 120;
      } else {
        score -= 24;
      }
    }

    const turnEntry = book.turnPriors?.[turn];
    if (turnEntry) {
      const moveCount = Number(turnEntry.moves?.[moveKey] || 0);
      if (moveCount > 0 && turnEntry.total > 0) {
        score += moveCount / turnEntry.total * 48;
      }
    }
    return score;
  }

  window.GoKidCoachOpeningBook = {
    name: "opening-book",
    state,
    openingMoveScore
  };

  fetch(bookUrl, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Opening book ${response.status}`);
      return response.json();
    })
    .then(book => {
      state.book = book;
      state.loaded = true;
      window.dispatchEvent(new CustomEvent("gokidcoach-opening-book-ready", { detail: book }));
    })
    .catch(error => {
      state.failed = true;
      state.error = error.message;
    });
}());
