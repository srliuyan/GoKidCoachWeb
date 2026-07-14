#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const assets = path.join(root, "assets");

const ruleEngine = require("../rule-engine.js");
const fuseki = require("../fuseki-library.js");
const joseki = require("../joseki-library.js");
const policy = require("../policy-pattern.js");
const shape = require("../shape-library.js");
const positionEvaluator = require("../position-evaluator.js");
const contextFusion = require("../context-fusion.js");
const moveQuality = require("../move-quality-controller.js");
const difficulty = require("../difficulty-controller.js");

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const SIZE = 19;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(assets, file), "utf8"));
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

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
    parts.push(`${move.color === BLACK ? "B" : "W"}${point.x},${point.y}`);
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

function openingMoveScore(book, point, color, moveHistory) {
  if (!book || SIZE !== book.boardSize || moveHistory.length >= book.maxTurn) return 0;
  const { serialized, symmetry } = canonicalPrefix(moveHistory, moveHistory.length, SIZE);
  const canonicalPoint = transformPoint(point, symmetry, SIZE);
  const moveKey = `${color === BLACK ? "B" : "W"}${canonicalPoint.x},${canonicalPoint.y}`;
  const turn = String(moveHistory.length);
  let score = 0;
  const sequenceKey = `${moveHistory.length}|${serialized}`;
  const sequenceEntry = book.sequenceBook?.[sequenceKey];
  if (sequenceEntry) {
    const moveCount = Number(sequenceEntry.moves?.[moveKey] || 0);
    score += moveCount > 0 && sequenceEntry.total > 0 ? moveCount / sequenceEntry.total * 120 : -24;
  }
  const turnEntry = book.turnPriors?.[turn];
  if (turnEntry) {
    const moveCount = Number(turnEntry.moves?.[moveKey] || 0);
    if (moveCount > 0 && turnEntry.total > 0) score += moveCount / turnEntry.total * 48;
  }
  return Number(score.toFixed(3));
}

function applyMove(board, history, point, color) {
  const sim = ruleEngine.simulateMove(board, point, color, []);
  if (!sim.legal) throw new Error(`Illegal fixture move ${pointKey(point)}`);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) board[y][x] = sim.board[y][x];
  }
  history.push({ x: point.x, y: point.y, color, captures: sim.captures });
}

function fixture(id, description, moves, nextColor = BLACK, expectedClasses = []) {
  const board = emptyBoard();
  const history = [];
  for (const item of moves) applyMove(board, history, { x: item[0], y: item[1] }, item[2]);
  return { id, description, board, moveHistory: history, nextColor, moveNumber: history.length, expectedClasses };
}

function buildFixtures() {
  return [
    fixture("empty_board", "empty board", [], BLACK, ["coherent_book", "coherent_whole_board"]),
    fixture("one_corner_opening", "one corner opening", [[3, 3, BLACK]], WHITE, ["coherent_book", "coherent_fuseki"]),
    fixture("opposite_corner_opening", "opposite corner opening", [[3, 3, BLACK], [15, 15, WHITE]], BLACK, ["coherent_fuseki"]),
    fixture("adjacent_corner_opening", "adjacent corner opening", [[3, 3, BLACK], [15, 3, WHITE]], BLACK, ["coherent_fuseki"]),
    fixture("open_corner_available", "open corner available", [[3, 3, BLACK], [15, 15, WHITE], [15, 3, BLACK]], WHITE, ["coherent_book", "coherent_fuseki"]),
    fixture("corner_approach_available", "corner approach available", [[3, 3, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE]], BLACK, ["coherent_joseki", "coherent_whole_board"]),
    fixture("enclosure_available", "enclosure available", [[3, 3, BLACK], [15, 15, WHITE], [5, 3, BLACK], [3, 15, WHITE]], BLACK, ["coherent_joseki"]),
    fixture("side_extension_available", "side extension available", [[3, 3, BLACK], [15, 15, WHITE], [3, 15, BLACK], [15, 3, WHITE], [9, 3, BLACK], [9, 15, WHITE], [3, 9, BLACK], [15, 9, WHITE]], BLACK, ["coherent_fuseki", "coherent_whole_board"]),
    fixture("joseki_unsettled", "local joseki still unsettled", [[3, 3, BLACK], [5, 3, WHITE], [3, 5, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE], [10, 3, BLACK], [10, 15, WHITE], [4, 4, BLACK]], WHITE, ["coherent_joseki"]),
    fixture("joseki_settled", "local joseki already settled", [[3, 3, BLACK], [5, 3, WHITE], [3, 5, BLACK], [5, 5, WHITE], [4, 4, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE], [10, 3, BLACK], [10, 15, WHITE], [3, 10, BLACK]], WHITE, ["coherent_whole_board"]),
    fixture("joseki_deviated", "local pattern deviated", [[3, 3, BLACK], [5, 3, WHITE], [6, 3, BLACK], [5, 4, WHITE], [15, 15, BLACK], [15, 3, WHITE], [3, 15, BLACK], [10, 10, WHITE], [10, 3, BLACK], [3, 10, WHITE], [16, 16, BLACK]], BLACK, ["coherent_whole_board", "acceptable_deviation"]),
    fixture("large_area_vs_reinforcement", "large open area versus reinforcement", [[3, 3, BLACK], [15, 15, WHITE], [4, 3, BLACK], [3, 4, BLACK], [15, 3, WHITE], [3, 15, WHITE], [10, 3, BLACK], [10, 15, WHITE], [4, 4, BLACK], [5, 4, WHITE], [4, 5, BLACK], [14, 14, WHITE]], BLACK, ["coherent_fuseki", "coherent_whole_board"]),
    fixture("urgent_tactic_vs_global", "urgent local tactic versus global", [[3, 3, BLACK], [15, 15, WHITE], [10, 10, BLACK], [10, 9, WHITE], [9, 10, WHITE], [11, 10, WHITE], [15, 3, BLACK], [3, 15, WHITE], [4, 4, BLACK], [14, 14, WHITE], [8, 8, BLACK], [8, 7, WHITE]], BLACK, ["coherent_tactical"]),
    fixture("first_line_tactical_exception", "first line tactical exception", [[1, 1, WHITE], [0, 1, BLACK], [1, 0, BLACK], [15, 15, WHITE], [3, 3, BLACK], [15, 3, WHITE], [3, 15, BLACK], [10, 10, WHITE], [4, 4, BLACK], [14, 14, WHITE], [10, 3, BLACK], [3, 10, WHITE], [9, 9, BLACK], [12, 12, WHITE]], BLACK, ["coherent_tactical"]),
    fixture("meaningless_first_line", "meaningless first-line candidate", [[3, 3, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE]], BLACK, ["coherent_fuseki"]),
    fixture("premature_center", "premature center candidate", [[3, 3, BLACK], [15, 15, WHITE]], BLACK, ["coherent_fuseki"]),
    fixture("repetitive_same_corner", "repetitive same-corner play", [[3, 3, BLACK], [15, 15, WHITE], [4, 3, BLACK], [15, 3, WHITE], [3, 4, BLACK], [3, 15, WHITE], [4, 4, BLACK], [10, 15, WHITE]], BLACK, ["coherent_whole_board"]),
    fixture("balanced_whole_board", "balanced whole-board development", [[3, 3, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE], [10, 3, BLACK], [10, 15, WHITE], [3, 10, BLACK], [15, 10, WHITE], [9, 9, BLACK], [9, 3, WHITE], [3, 9, BLACK], [15, 9, WHITE]], BLACK, ["coherent_whole_board"]),
    fixture("child_unusual_opening", "child unusual opening", [[10, 10, WHITE], [3, 3, BLACK], [16, 16, WHITE], [15, 3, BLACK], [2, 10, WHITE], [3, 15, BLACK], [10, 2, WHITE], [15, 15, BLACK], [9, 9, WHITE]], BLACK, ["acceptable_deviation", "coherent_whole_board"]),
    fixture("outside_book_coverage", "outside opening book coverage", [[3, 3, BLACK], [15, 15, WHITE], [15, 3, BLACK], [3, 15, WHITE], [10, 3, BLACK], [10, 15, WHITE], [3, 10, BLACK], [15, 10, WHITE], [9, 9, BLACK], [9, 3, WHITE], [3, 9, BLACK], [15, 9, WHITE], [6, 6, BLACK], [12, 12, WHITE], [6, 12, BLACK], [12, 6, WHITE], [8, 4, BLACK], [4, 8, WHITE], [14, 8, BLACK], [8, 14, WHITE], [9, 5, BLACK], [5, 9, WHITE], [13, 9, BLACK], [9, 13, WHITE], [7, 7, BLACK], [11, 11, WHITE], [7, 11, BLACK], [11, 7, WHITE], [8, 8, BLACK], [10, 10, WHITE], [8, 10, BLACK], [10, 8, WHITE], [9, 8, BLACK], [8, 9, WHITE], [10, 9, BLACK], [9, 10, WHITE], [6, 8, BLACK], [12, 10, WHITE]], BLACK, ["coherent_tactical", "coherent_whole_board"])
  ];
}

function distanceFromEdge(point) {
  return Math.min(point.x, point.y, SIZE - 1 - point.x, SIZE - 1 - point.y);
}

function boardRegion(point) {
  const edge = distanceFromEdge(point);
  if (edge <= 3) return (point.x <= 3 || point.x >= SIZE - 4) && (point.y <= 3 || point.y >= SIZE - 4) ? "corner" : "side";
  return "center";
}

function nearbyCounts(board, point, color, radius = 3) {
  let friendly = 0;
  let opponent = 0;
  let local = 0;
  for (let y = Math.max(0, point.y - radius); y <= Math.min(SIZE - 1, point.y + radius); y += 1) {
    for (let x = Math.max(0, point.x - radius); x <= Math.min(SIZE - 1, point.x + radius); x += 1) {
      if (Math.abs(point.x - x) + Math.abs(point.y - y) > radius) continue;
      if (board[y][x] === color) friendly += 1;
      if (board[y][x] !== EMPTY && board[y][x] !== color) opponent += 1;
      if (board[y][x] !== EMPTY) local += 1;
    }
  }
  return { friendly, opponent, local };
}

function zone(point) {
  const col = point.x < 6 ? "W" : point.x > 12 ? "E" : "C";
  const row = point.y < 6 ? "N" : point.y > 12 ? "S" : "C";
  return `${row}${col}`;
}

function largerOpenAreaExists(board, point) {
  const selectedZone = zone(point);
  const counts = {};
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] !== EMPTY) continue;
      const z = zone({ x, y });
      counts[z] = (counts[z] || 0) + 1;
    }
  }
  const best = Math.max(...Object.values(counts));
  return best > (counts[selectedZone] || 0) + 8;
}

function localSequenceSettled(board, point) {
  const counts = nearbyCounts(board, point, BLACK, 4);
  return counts.local >= 7 && counts.friendly >= 3 && counts.opponent >= 2;
}

function repeatsSameLocalArea(moveHistory, point) {
  const recent = moveHistory.slice(-4).filter(move => !move.pass);
  return recent.filter(move => Math.abs(move.x - point.x) + Math.abs(move.y - point.y) <= 4).length >= 2;
}

function phaseBucket(moveNumber) {
  if (moveNumber < 8) return "move1To8";
  if (moveNumber < 20) return "move9To20";
  return "move21To40";
}

function legalPoints(board, moveHistory, color) {
  const points = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const point = { x, y };
      const rule = ruleEngine.evaluateMove({ board, point, color, moveHistory, positionHashes: [] });
      if (rule.legal) points.push(point);
    }
  }
  return points;
}

function localPolicyPrior(point, board, color, moveNumber) {
  const edge = distanceFromEdge(point);
  const region = boardRegion(point);
  const near = nearbyCounts(board, point, color, 3);
  let score = 0;
  if (moveNumber < 8 && region === "corner") score += 95;
  else if (moveNumber < 20 && (region === "corner" || region === "side")) score += 70;
  else if (region === "side") score += 55;
  if (edge === 0) score -= 120;
  if (edge === 1) score -= 35;
  if (region === "center" && moveNumber < 8) score -= 45;
  score += near.friendly * 6 + near.opponent * 3;
  return score;
}

function evaluateCandidate(point, fixtureData, openingBook) {
  const board = fixtureData.board;
  const color = fixtureData.nextColor;
  const moveNumber = fixtureData.moveNumber;
  const rule = ruleEngine.evaluateMove({ board, point, color, moveHistory: fixtureData.moveHistory, positionHashes: [] });
  if (!rule.legal) return null;
  const sim = ruleEngine.simulateMove(board, point, color, []);
  const ownLiberties = sim.ownGroup.liberties.size;
  const openingBookScore = openingMoveScore(openingBook, point, color, fixtureData.moveHistory);
  const base = {
    point,
    color,
    legal: true,
    ruleLegal: true,
    moveNumber,
    openingBookScore,
    ruleScore: rule.ruleScore || 0,
    policyScore: localPolicyPrior(point, board, color, moveNumber) + sim.captures * 58 + ownLiberties * 5.2,
    captures: sim.captures,
    ownLiberties,
    tacticalPressure: sim.captures > 0 ? 1 : 0,
    rescueValue: rule.reasons?.includes("save_group") ? 1 : 0,
    connectionValue: rule.reasons?.includes("connect") ? 2 : 0,
    cutOpportunity: 0,
    territoryValue: Math.max(0, openingBookScore * 0.18),
    endgameValue: 0,
    isMeaninglessFirstLine: moveNumber < 30 && distanceFromEdge(point) === 0 && sim.captures === 0 && openingBookScore <= 0,
    isRandomFlyaway: false,
    reasons: rule.reasons || []
  };
  const positionScore = Number(positionEvaluator.scoreMoveByPosition(base, board, color));
  const patternLookup = policy.lookupPatternScore(board, point, color, { moveNumber });
  const shapeLookup = shape.scoreShape(point, board, color, { moveNumber });
  const fusekiLookup = fuseki.scoreFusekiMove(point, board, color, { moveNumber, openingBookScore, moveHistory: fixtureData.moveHistory });
  const josekiLookup = joseki.scoreJosekiMove(point, board, color, { moveNumber, moveHistory: fixtureData.moveHistory });
  const raw = {
    ...base,
    positionScore: Number.isFinite(positionScore) ? positionScore : 0,
    patternScore: Number(patternLookup.patternScore || 0),
    shapeScore: Number(shapeLookup.shapeScore || 0),
    fusekiScore: Number(fusekiLookup.fusekiScore || 0),
    josekiScore: Number(josekiLookup.josekiScore || 0),
    endgameScore: 0,
    confidence: Math.max(Number(patternLookup.confidence || 0), Number(shapeLookup.confidence || 0), Number(fusekiLookup.confidence || 0), Number(josekiLookup.confidence || 0)),
  };
  raw.combinedScore = raw.openingBookScore + raw.ruleScore + raw.policyScore + raw.positionScore + raw.patternScore + raw.shapeScore + raw.fusekiScore + raw.josekiScore;
  return contextFusion.fuseCandidate(raw, { moveNumber, gamePhase: "opening" });
}

function classifyCandidate(candidate, fixtureData, allCandidates) {
  const point = candidate.point;
  const edge = distanceFromEdge(point);
  const region = boardRegion(point);
  const bookSupported = candidate.openingBookScore > 0;
  const fusekiSupported = candidate.fusekiScore > 0;
  const josekiSupported = candidate.josekiScore > 0;
  const tacticalPurpose = candidate.captures > 0 || candidate.tacticalPressure > 0 || candidate.rescueValue > 0 || candidate.connectionValue > 0;
  const strategicPurpose = bookSupported || fusekiSupported || josekiSupported || region === "corner" || (region === "side" && fixtureData.moveNumber >= 4);
  const settled = localSequenceSettled(fixtureData.board, point);
  const repeat = repeatsSameLocalArea(fixtureData.moveHistory, point);
  const larger = largerOpenAreaExists(fixtureData.board, point);
  const coherentAlternative = allCandidates.some(item => {
    const r = boardRegion(item.point);
    return item.openingBookScore > 0 || item.fusekiScore > 0 || r === "corner" || (r === "side" && item.combinedScore >= candidate.combinedScore - 120);
  });
  let label = "incoherent";
  if (bookSupported) label = "coherent_book";
  else if (fusekiSupported) label = "coherent_fuseki";
  else if (josekiSupported && !settled) label = "coherent_joseki";
  else if (tacticalPurpose) label = "coherent_tactical";
  else if (strategicPurpose && !repeat && !settled) label = "coherent_whole_board";
  else if (strategicPurpose) label = "acceptable_deviation";
  if (edge === 0 && !tacticalPurpose) label = "meaningless_first_line";
  else if (edge === 1 && !bookSupported && !fusekiSupported && !tacticalPurpose) label = "low_value_second_line";
  else if (region === "center" && fixtureData.moveNumber < 8 && !tacticalPurpose && !bookSupported) label = "premature_center";
  else if (repeat && !tacticalPurpose && larger) label = "repetitive_local_play";
  else if (settled && !tacticalPurpose) label = "settled_area_overplay";
  else if (josekiSupported && settled) label = "joseki_without_context";
  else if (fusekiSupported && settled) label = "fuseki_without_context";
  else if (larger && !bookSupported && !fusekiSupported && !tacticalPurpose && coherentAlternative) label = "local_move_while_large_area_exists";
  return {
    label,
    coherent: label.startsWith("coherent_") || label === "acceptable_deviation",
    bookSupported,
    fusekiSupported,
    josekiSupported,
    tacticalPurpose,
    strategicPurpose,
    settled,
    repeat,
    larger,
    coherentAlternative
  };
}

function auditFixture(fixtureData, openingBook) {
  const candidates = legalPoints(fixtureData.board, fixtureData.moveHistory, fixtureData.nextColor)
    .map(point => evaluateCandidate(point, fixtureData, openingBook))
    .filter(Boolean)
    .sort((a, b) => b.combinedScore - a.combinedScore);
  const settings = {
    ...difficulty.getDifficultySettings({ scores: {} }, []),
    releaseDifficultyMode: "advanced",
    candidateTopK: 1,
    mistakeTolerance: 0,
    randomness: 0,
    policyTemperature: 0.01
  };
  const adjusted = difficulty.adjustMoveCandidates(candidates, settings);
  const ranked = moveQuality.rankCandidates(adjusted, { moveNumber: fixtureData.moveNumber, difficultySettings: settings, focus: "opening" });
  const selected = moveQuality.chooseMoveByQuality(ranked, { moveNumber: fixtureData.moveNumber, difficultySettings: settings }) || ranked.ranked[0] || candidates[0];
  const tier = Object.entries(ranked.groups || {}).find(([, items]) => Array.isArray(items) && items.some(item => samePoint(item.point, selected.point)))?.[0] || "ranked";
  const selectedClassification = classifyCandidate(selected, fixtureData, candidates);
  const coherentCandidates = candidates.filter(candidate => classifyCandidate(candidate, fixtureData, candidates).coherent);
  const bookCandidates = candidates.filter(candidate => candidate.openingBookScore > 0);
  const fusekiCandidates = candidates.filter(candidate => candidate.fusekiScore > 0);
  const near = nearbyCounts(fixtureData.board, selected.point, fixtureData.nextColor, 3);
  const phase = phaseBucket(fixtureData.moveNumber);
  const conflicts = {
    bookOverriddenByLowConfidenceSource: bookCandidates.length > 0 && selected.openingBookScore <= 0 && selected.positionScore > Math.max(...bookCandidates.map(item => item.positionScore)),
    duplicateFusekiJosekiReward: selected.fusekiScore > 0 && selected.josekiScore > 0,
    staleJosekiActivation: selectedClassification.label === "joseki_without_context",
    settledAreaOverplay: selectedClassification.label === "settled_area_overplay" || selectedClassification.label === "fuseki_without_context",
    repetitiveLocalMove: selectedClassification.label === "repetitive_local_play",
    prematureCenterMove: selectedClassification.label === "premature_center",
    meaninglessFirstLineMove: selectedClassification.label === "meaningless_first_line",
    unsupportedFallback: !selectedClassification.coherent && coherentCandidates.length > 0
  };
  return {
    fixtureId: fixtureData.id,
    description: fixtureData.description,
    moveNumber: fixtureData.moveNumber + 1,
    openingSubPhase: phase,
    boardStateId: `${fixtureData.id}-${fixtureData.moveNumber}`,
    selectedMove: selected.point,
    selectedTier: tier,
    selectedScore: selected.combinedScore,
    openingBookScore: selected.openingBookScore,
    fusekiScore: selected.fusekiScore,
    josekiScore: selected.josekiScore,
    shapeScore: selected.shapeScore,
    policyScore: selected.policyScore,
    positionScore: selected.positionScore,
    fusedPolicyScore: selected.fusedPolicyScore,
    distanceFromEdge: distanceFromEdge(selected.point),
    boardRegion: boardRegion(selected.point),
    localMoveCount: near.local,
    nearbyFriendlyStones: near.friendly,
    nearbyOpponentStones: near.opponent,
    whetherCornerMove: boardRegion(selected.point) === "corner",
    whetherSideMove: boardRegion(selected.point) === "side",
    whetherCenterMove: boardRegion(selected.point) === "center",
    whetherFirstLineMove: distanceFromEdge(selected.point) === 0,
    whetherSecondLineMove: distanceFromEdge(selected.point) === 1,
    whetherBookSupported: selectedClassification.bookSupported,
    whetherFusekiSupported: selectedClassification.fusekiSupported,
    whetherJosekiSupported: selectedClassification.josekiSupported,
    whetherLocalSequenceAlreadySettled: selectedClassification.settled,
    whetherLargerOpenAreaExists: selectedClassification.larger,
    whetherMoveRepeatsSameLocalArea: selectedClassification.repeat,
    whetherMoveHasTacticalPurpose: selectedClassification.tacticalPurpose,
    whetherMoveHasStrategicPurpose: selectedClassification.strategicPurpose,
    whetherMoveWasSelectedByFallback: conflicts.unsupportedFallback,
    coherenceClass: selectedClassification.label,
    coherentCandidateExists: coherentCandidates.length > 0,
    bookCandidateExists: bookCandidates.length > 0,
    fusekiCandidateExists: fusekiCandidates.length > 0,
    selectedMovePresent: candidates.some(item => samePoint(item.point, selected.point)),
    candidateGenerationFailure: coherentCandidates.length === 0,
    finalSelectionFailure: coherentCandidates.length > 0 && !selectedClassification.coherent,
    sourceConflicts: conflicts,
    candidateCounts: {
      legal: candidates.length,
      coherent: coherentCandidates.length,
      book: bookCandidates.length,
      fuseki: fusekiCandidates.length
    },
    topCandidates: candidates.slice(0, 8).map(candidate => {
      const c = classifyCandidate(candidate, fixtureData, candidates);
      return {
        move: candidate.point,
        score: candidate.combinedScore,
        class: c.label,
        openingBookScore: candidate.openingBookScore,
        fusekiScore: candidate.fusekiScore,
        josekiScore: candidate.josekiScore,
        shapeScore: candidate.shapeScore,
        policyScore: candidate.policyScore,
        positionScore: candidate.positionScore,
        fusedPolicyScore: candidate.fusedPolicyScore
      };
    })
  };
}

function rate(count, total) {
  return total ? Number((count / total).toFixed(6)) : 0;
}

function runAudit(options = {}) {
  const writeReports = options.writeReports === true;
  const outputDir = options.outputDir || __dirname;
  const openingBook = readJson("opening-book.json");
  fuseki.resetForTests(readJson("fuseki-db.json"));
  joseki.resetForTests(readJson("joseki-db.json"));
  policy.resetForTests(readJson("pattern-db.json"));
  shape.resetForTests(readJson("shape-library.json"));

  const cases = buildFixtures().map(item => auditFixture(item, openingBook));
  const total = cases.length;
  const coherent = cases.filter(item => ["coherent_book", "coherent_fuseki", "coherent_joseki", "coherent_whole_board", "coherent_tactical", "acceptable_deviation"].includes(item.coherenceClass)).length;
  const byPhase = Object.fromEntries(["move1To8", "move9To20", "move21To40"].map(phase => {
    const phaseCases = cases.filter(item => item.openingSubPhase === phase);
    return [phase, {
      positions: phaseCases.length,
      coherentRate: rate(phaseCases.filter(item => ["coherent_book", "coherent_fuseki", "coherent_joseki", "coherent_whole_board", "coherent_tactical", "acceptable_deviation"].includes(item.coherenceClass)).length, phaseCases.length)
    }];
  }));
  const conflictTotals = {
    openingSourceConflictCount: cases.filter(item => Object.values(item.sourceConflicts).some(Boolean)).length,
    bookOverriddenByLowConfidenceSourceCount: cases.filter(item => item.sourceConflicts.bookOverriddenByLowConfidenceSource).length,
    duplicateFusekiJosekiRewardCount: cases.filter(item => item.sourceConflicts.duplicateFusekiJosekiReward).length,
    staleJosekiActivationCount: cases.filter(item => item.sourceConflicts.staleJosekiActivation).length,
    settledAreaOverplayCount: cases.filter(item => item.sourceConflicts.settledAreaOverplay).length,
    repetitiveLocalMoveCount: cases.filter(item => item.sourceConflicts.repetitiveLocalMove).length,
    prematureCenterMoveCount: cases.filter(item => item.sourceConflicts.prematureCenterMove).length,
    meaninglessFirstLineMoveCount: cases.filter(item => item.sourceConflicts.meaninglessFirstLineMove).length,
    unsupportedFallbackCount: cases.filter(item => item.sourceConflicts.unsupportedFallback).length
  };
  const coverage = {
    coherentCandidateCoverageRate: rate(cases.filter(item => item.coherentCandidateExists).length, total),
    bookCandidateCoverageRate: rate(cases.filter(item => !item.bookCandidateExists || item.candidateCounts.book > 0).length, total),
    fusekiCandidateCoverageRate: rate(cases.filter(item => !item.fusekiCandidateExists || item.candidateCounts.fuseki > 0).length, total),
    selectedCoherentMoveRate: rate(coherent, total),
    selectedBookOrFusekiMoveRate: rate(cases.filter(item => item.whetherBookSupported || item.whetherFusekiSupported).length, total),
    candidateGenerationFailureCount: cases.filter(item => item.candidateGenerationFailure).length,
    finalSelectionFailureCount: cases.filter(item => item.finalSelectionFailure).length
  };
  const metrics = {
    openingCoherentMoveRate: rate(coherent, total),
    move1To8CoherentRate: byPhase.move1To8.coherentRate,
    move9To20CoherentRate: byPhase.move9To20.coherentRate,
    move21To40CoherentRate: byPhase.move21To40.coherentRate,
    bookOrFusekiSupportedSelectionRate: coverage.selectedBookOrFusekiMoveRate,
    acceptableDeviationRate: rate(cases.filter(item => item.coherenceClass === "acceptable_deviation").length, total),
    meaninglessFirstLineSelectionCount: conflictTotals.meaninglessFirstLineMoveCount,
    prematureCenterSelectionCount: conflictTotals.prematureCenterMoveCount,
    repetitiveLocalSelectionCount: conflictTotals.repetitiveLocalMoveCount,
    settledAreaOverplayCount: conflictTotals.settledAreaOverplayCount,
    staleJosekiSelectionCount: conflictTotals.staleJosekiActivationCount,
    unsupportedFallbackCount: conflictTotals.unsupportedFallbackCount,
    openingAverageScoreLossFromBest: Number((cases.reduce((sum, item) => sum + Math.max(0, item.topCandidates[0].score - item.selectedScore), 0) / total).toFixed(6)),
    openingSourceConflictFrequency: rate(conflictTotals.openingSourceConflictCount, total)
  };
  const gates = [];
  if (coverage.coherentCandidateCoverageRate < 0.98) gates.push("coherentCandidateCoverageRate below 0.98");
  if (coverage.selectedCoherentMoveRate < 0.95) gates.push("selectedCoherentMoveRate below 0.95");
  if (conflictTotals.meaninglessFirstLineMoveCount !== 0) gates.push("meaningless first-line selected");
  if (conflictTotals.unsupportedFallbackCount !== 0) gates.push("unsupported fallback selected");
  if (conflictTotals.staleJosekiActivationCount !== 0) gates.push("stale joseki selected");
  const dominantWeakness = conflictTotals.staleJosekiActivationCount ? "stale joseki matching"
    : conflictTotals.duplicateFusekiJosekiRewardCount ? "duplicate source reward"
      : conflictTotals.settledAreaOverplayCount || conflictTotals.repetitiveLocalMoveCount ? "settled-area repetition"
        : coverage.finalSelectionFailureCount ? "difficulty softening"
          : coverage.candidateGenerationFailureCount ? "candidate generation"
            : "none";
  const payload = {
    version: "1.3.1",
    stage: "Opening Coherence Audit",
    generatedAt: "2026-07-13T00:00:00Z",
    randomSeed: 20260710,
    offlineOnly: true,
    browserRuntimeAffected: false,
    openingScope: { moveRange: "1-40", subPhases: ["move1To8", "move9To20", "move21To40"] },
    auditedSources: ["OpeningBook", "Fuseki Library", "Joseki Library", "Shape Library", "Policy", "ContextFusion", "PositionEvaluator", "MoveQualityController", "final difficulty selection"],
    positionsAudited: total,
    cases,
    sourceConflictSummary: conflictTotals,
    candidateCoverage: coverage,
    metrics,
    subPhaseMetrics: byPhase,
    gates: {
      passed: gates.length === 0,
      failedGates: gates,
      rejectedMoveRate: 0
    },
    dominantOpeningWeakness: dominantWeakness,
    recommendation: gates.length === 0
      ? "Retain current opening system; focus next development on tactical reading integration."
      : `Recommend one narrow correction targeting ${dominantWeakness}; do not add a new opening database or globally increase book/fuseki weights.`
  };
  if (writeReports) {
    fs.mkdirSync(outputDir, { recursive: true });
    const outPath = path.join(outputDir, "opening-coherence-audit.json");
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  return payload;
}

function main() {
  const outputDir = process.argv.includes("--output-dir") ? process.argv[process.argv.indexOf("--output-dir") + 1] : undefined;
  const payload = runAudit({ writeReports: process.argv.includes("--write-reports"), outputDir });
  process.stdout.write(JSON.stringify({
    positionsAudited: payload.positionsAudited,
    openingCoherentMoveRate: payload.metrics.openingCoherentMoveRate,
    selectedCoherentMoveRate: payload.candidateCoverage.selectedCoherentMoveRate,
    openingSourceConflictFrequency: payload.metrics.openingSourceConflictFrequency,
    passed: payload.gates.passed,
    dominantOpeningWeakness: payload.dominantOpeningWeakness
  }));
}

if (require.main === module) main();

module.exports = {
  buildFixtures,
  auditFixture,
  runAudit,
  main
};
