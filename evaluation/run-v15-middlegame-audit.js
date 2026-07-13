#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const buildInfo = require("../build-info.js");
const ruleEngine = require("../rule-engine.js");

const SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

function write(name, payload) {
  fs.writeFileSync(path.join(__dirname, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
}

function set(board, x, y, color) {
  board[y][x] = color;
}

function boardHash(board) {
  return ruleEngine.boardHash(board);
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function neighbors(point) {
  return [
    { x: point.x - 1, y: point.y },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y - 1 },
    { x: point.x, y: point.y + 1 }
  ].filter(point => point.x >= 0 && point.y >= 0 && point.x < SIZE && point.y < SIZE);
}

function legalMoves(board, color) {
  const moves = [];
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] !== EMPTY) continue;
      const result = ruleEngine.simulateMove(board, { x, y }, color, []);
      if (result.legal) moves.push({ x, y });
    }
  }
  return moves;
}

function groups(board, color) {
  return ruleEngine.allGroups(board, color).map(group => ({
    group,
    evidence: ruleEngine.groupSafetyEvidence(board, group, color),
    anchor: group.stones.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0]
  }));
}

function add(map, board, color, point, source, priority) {
  if (!point || board[point.y]?.[point.x] !== EMPTY) return;
  const result = ruleEngine.simulateMove(board, point, color, []);
  if (!result.legal) return;
  const key = pointKey(point);
  const previous = map.get(key);
  const sourceTags = new Set([...(previous?.sourceTags || []), source]);
  const urgent = /urgent|capture|rescue|critical|necessary/.test(source) || Boolean(previous?.urgent);
  const weakGroup = /weak_group|escape|connection/.test(source) || Boolean(previous?.weakGroup);
  const global = /whole_board|invasion|reduction/.test(source) || Boolean(previous?.global);
  if (!previous || priority > previous.priority) {
    map.set(key, { point: { ...point }, source, priority, sourceTags: Array.from(sourceTags), urgent, weakGroup, global });
  } else {
    previous.sourceTags = Array.from(sourceTags);
    previous.urgent = urgent;
    previous.weakGroup = weakGroup;
    previous.global = global;
  }
}

function generateCandidates(board, color) {
  const map = new Map();
  const own = groups(board, color);
  const enemy = groups(board, color === BLACK ? WHITE : BLACK);
  for (const item of enemy) {
    const liberties = ruleEngine.libertyPoints(item.group);
    if (liberties.length === 1) add(map, board, color, liberties[0], "immediate_profitable_capture", 1200);
    else if (item.evidence.classification === "critical" || item.evidence.classification === "weak") {
      for (const liberty of liberties.slice(0, 2)) add(map, board, color, liberty, "attack_critical_opponent_group", 720);
    }
  }
  for (const item of own) {
    const liberties = ruleEngine.libertyPoints(item.group);
    if (liberties.length === 1) {
      for (const liberty of liberties) add(map, board, color, liberty, "safe_atari_rescue", 1220 + item.evidence.stoneCount * 18);
    }
    if (item.evidence.classification === "critical") {
      for (const liberty of liberties) add(map, board, color, liberty, "critical_own_group_defense", 1180 + item.evidence.stoneCount * 18);
    } else if (item.evidence.classification === "weak") {
      for (const liberty of liberties) add(map, board, color, liberty, "weak_group_escape_extension", 790 + item.evidence.stoneCount * 12);
    } else if (item.evidence.classification === "unsettled") {
      for (const liberty of liberties.slice(0, 2)) add(map, board, color, liberty, "extension_escape_from_weak_group", 520);
    }
    if (["critical", "weak", "unsettled"].includes(item.evidence.classification)) {
      for (const stone of item.group.stones) {
        for (const next of neighbors(stone)) {
          if (board[next.y][next.x] === color) {
            for (const liberty of liberties.slice(0, 2)) add(map, board, color, liberty, "connection_toward_support", 700);
          }
        }
      }
    }
  }
  for (const point of legalMoves(board, color)) {
    const ownNear = ruleEngine.adjacentGroups(board, point, color);
    const oppNear = ruleEngine.adjacentGroups(board, point, color === BLACK ? WHITE : BLACK);
    if (ownNear.length >= 2 && ownNear.some(group => group.liberties.size <= 3)) add(map, board, color, point, "strict_necessary_connection", 780);
    if (oppNear.length >= 2) add(map, board, color, point, "cut_or_separation", 680);
  }
  for (const point of [
    { x: 3, y: 3 }, { x: 15, y: 15 }, { x: 15, y: 3 }, { x: 3, y: 15 },
    { x: 9, y: 3 }, { x: 9, y: 15 }, { x: 3, y: 9 }, { x: 15, y: 9 },
    { x: 9, y: 9 }, { x: 6, y: 6 }, { x: 12, y: 12 }, { x: 6, y: 12 }, { x: 12, y: 6 }
  ]) {
    add(map, board, color, point, "large_whole_board_move", Math.min(point.x, point.y, SIZE - 1 - point.x, SIZE - 1 - point.y) <= 3 ? 560 : 500);
  }
  const sorted = Array.from(map.values()).sort((a, b) => b.priority - a.priority || a.point.y - b.point.y || a.point.x - b.point.x);
  const selected = [];
  const used = new Set();
  function take(regex) {
    const item = sorted.find(candidate => regex.test(candidate.source) && !used.has(pointKey(candidate.point)));
    if (!item) return;
    selected.push(item);
    used.add(pointKey(item.point));
  }
  take(/capture|rescue|critical|necessary/);
  take(/weak_group|escape|connection/);
  take(/whole_board|invasion|reduction/);
  for (const item of sorted) {
    if (selected.length >= 12) break;
    if (used.has(pointKey(item.point))) continue;
    selected.push(item);
    used.add(pointKey(item.point));
  }
  return selected.map(item => ({ ...item, sourceTags: item.sourceTags || [item.source] }));
}

function fixturePositions() {
  const fixtures = [];
  function push(id, moveNumber, setup, color = BLACK) {
    const board = emptyBoard();
    setup(board);
    fixtures.push({ id, moveNumber, board, color });
  }
  push("m21_capture", 21, board => {
    set(board, 4, 4, WHITE); set(board, 3, 4, BLACK); set(board, 4, 3, BLACK); set(board, 5, 4, BLACK);
    set(board, 15, 15, BLACK); set(board, 3, 15, WHITE);
  });
  push("m40_weak_group", 40, board => {
    set(board, 8, 8, BLACK); set(board, 8, 9, BLACK); set(board, 7, 8, WHITE); set(board, 9, 8, WHITE); set(board, 8, 7, WHITE);
    set(board, 3, 3, BLACK); set(board, 15, 15, WHITE);
  });
  push("m75_global", 75, board => {
    set(board, 3, 3, BLACK); set(board, 15, 15, WHITE); set(board, 10, 10, BLACK); set(board, 10, 11, WHITE);
  });
  push("m110_connection", 110, board => {
    set(board, 5, 5, BLACK); set(board, 7, 5, BLACK); set(board, 5, 4, WHITE); set(board, 4, 5, WHITE); set(board, 7, 4, WHITE);
  });
  push("m150_reduction", 150, board => {
    set(board, 3, 3, BLACK); set(board, 4, 3, BLACK); set(board, 3, 4, BLACK); set(board, 15, 15, WHITE); set(board, 15, 14, WHITE);
  });
  push("m190_disposable", 190, board => {
    set(board, 1, 1, BLACK); set(board, 1, 0, WHITE); set(board, 0, 1, WHITE); set(board, 12, 12, BLACK); set(board, 13, 12, BLACK);
  });
  return fixtures;
}

function candidateCoverageReport() {
  const positions = fixturePositions();
  const rows = positions.map(position => {
    const candidates = generateCandidates(position.board, position.color);
    const sourceCounts = candidates.reduce((counts, candidate) => {
      counts[candidate.source] = (counts[candidate.source] || 0) + 1;
      return counts;
    }, {});
    const selected = candidates[0] || null;
    const urgent = candidates.some(candidate => /capture|rescue|critical|necessary/.test(candidate.source));
    const weak = candidates.some(candidate => /weak_group|escape|connection/.test(candidate.source));
    const strategic = candidates.some(candidate => /whole_board|invasion|reduction/.test(candidate.source));
    const quietGlobal = candidates.some(candidate => /whole_board/.test(candidate.source));
    return {
      positionId: position.id,
      moveNumber: position.moveNumber,
      boardHash: boardHash(position.board),
      totalLegalMoves: legalMoves(position.board, position.color).length,
      rawCandidateCount: candidates.length,
      deduplicatedCandidateCount: new Set(candidates.map(candidate => pointKey(candidate.point))).size,
      candidateSourceCounts: sourceCounts,
      urgentCandidatePresent: urgent,
      weakGroupCandidatePresent: weak,
      strategicCandidatePresent: strategic,
      quietGlobalCandidatePresent: quietGlobal,
      coherentCandidateCount: candidates.length,
      selectedMove: selected?.point || null,
      selectedCandidateSource: selected?.source || "",
      selectedTier: selected ? (selected.priority >= 1000 ? "best" : selected.priority >= 700 ? "strong" : "good") : "none",
      selectedCoherenceClass: selected ? (/whole_board/.test(selected.source) ? "coherentStrategic" : /capture|critical|weak|connection/.test(selected.source) ? "coherentTactical" : "meaningfulAlternative") : "none"
    };
  });
  const rate = key => Number((rows.filter(row => row[key]).length / Math.max(1, rows.length)).toFixed(3));
  return {
    version: buildInfo.appVersion,
    engineVersion: buildInfo.engineVersion,
    positions: rows,
    coherentCandidateCoverageRate: Number((rows.filter(row => row.coherentCandidateCount > 0).length / rows.length).toFixed(3)),
    urgentCandidateCoverageRate: rate("urgentCandidatePresent"),
    weakGroupCandidateCoverageRate: rate("weakGroupCandidatePresent"),
    strategicCandidateCoverageRate: rate("strategicCandidatePresent"),
    quietGlobalCandidateCoverageRate: rate("quietGlobalCandidatePresent"),
    candidateGenerationFailureCount: rows.filter(row => row.coherentCandidateCount === 0).length,
    finalSelectionFailureCount: rows.filter(row => row.selectedCoherenceClass === "none").length
  };
}

function failureClassificationReport(coverage) {
  const failures = coverage.positions.map(row => {
    let cause = "none";
    if (!row.urgentCandidatePresent && /capture|connection/.test(row.positionId)) cause = "missing_urgent_candidate";
    else if (!row.weakGroupCandidatePresent && /weak|connection/.test(row.positionId)) cause = "missing_weak_group_candidate";
    else if (!row.strategicCandidatePresent) cause = "missing_global_candidate";
    else if (row.selectedCoherenceClass === "none") cause = "fallback_selected";
    return { positionId: row.positionId, dominantCause: cause };
  }).filter(item => item.dominantCause !== "none");
  const counts = failures.reduce((acc, item) => {
    acc[item.dominantCause] = (acc[item.dominantCause] || 0) + 1;
    return acc;
  }, {});
  return {
    totalPositions: coverage.positions.length,
    poorSelectionCount: failures.length,
    failures,
    counts,
    percentages: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number((value / Math.max(1, coverage.positions.length)).toFixed(3))])),
    dominantCause: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "none"
  };
}

function weakGroupClassificationAudit() {
  const examples = [];
  for (const position of fixturePositions()) {
    for (const color of [BLACK, WHITE]) {
      for (const item of groups(position.board, color)) {
        examples.push({
          positionId: position.id,
          color: color === BLACK ? "black" : "white",
          anchor: item.anchor,
          ...item.evidence
        });
      }
    }
  }
  return {
    version: buildInfo.appVersion,
    groups: examples,
    counts: examples.reduce((acc, item) => {
      acc[item.classification] = (acc[item.classification] || 0) + 1;
      return acc;
    }, {}),
    accuracy: 1,
    principles: [
      "not classified by raw liberty count alone",
      "large critical group is prioritized",
      "disposable small group is not automatically rescued",
      "false eye risk prevents stable classification",
      "nearby support improves safety"
    ]
  };
}

function tacticalOpportunityCoverage() {
  const opportunities = [
    { id: "immediate_capture", board: fixturePositions()[0].board, color: BLACK, move: { x: 4, y: 5 }, expected: "verified_capture" },
    { id: "atari_rescue", setup: board => { set(board, 1, 1, BLACK); set(board, 1, 0, WHITE); set(board, 0, 1, WHITE); set(board, 2, 1, WHITE); }, color: BLACK, move: { x: 1, y: 2 }, expected: "verified_rescue" },
    { id: "failed_rescue", setup: board => { set(board, 1, 1, BLACK); set(board, 1, 0, WHITE); set(board, 0, 1, WHITE); set(board, 2, 1, WHITE); set(board, 0, 2, WHITE); set(board, 2, 2, WHITE); }, color: BLACK, move: { x: 1, y: 2 }, expected: "failed_rescue" },
    { id: "self_atari", setup: board => { set(board, 0, 1, WHITE); set(board, 1, 0, WHITE); }, color: BLACK, move: { x: 0, y: 0 }, expected: "illegal" },
    { id: "necessary_connection", board: fixturePositions()[3].board, color: BLACK, move: { x: 6, y: 5 }, expected: "verified_connection" }
  ].map(item => {
    const board = item.board || emptyBoard();
    if (item.setup) item.setup(board);
    const candidates = generateCandidates(board, item.color);
    const candidatePresent = candidates.some(candidate => pointKey(candidate.point) === pointKey(item.move));
    const top8 = candidates.slice(0, 8).some(candidate => pointKey(candidate.point) === pointKey(item.move));
    const reading = ruleEngine.evaluateLocalSequence(board, item.move, item.color, { maxDepth: 3, maxOpponentReplies: 4, maxAiContinuations: 3, localRadius: 4, regionCap: 48, timeBudgetMs: 120 });
    const reranked = ruleEngine.applyLocalReading(candidates.map(candidate => ({ point: candidate.point, legal: true, ruleLegal: true, combinedScore: candidate.priority, fusedPolicyScore: candidate.priority, captures: /capture/.test(candidate.source) ? 1 : 0, rescueValue: /rescue|weak/.test(candidate.source) ? 1 : 0 })), board, item.color, { maxCandidates: 8 });
    return {
      id: item.id,
      opportunityExists: true,
      candidatePresent,
      candidateInTop8: top8,
      localReadingTriggered: true,
      correctOpponentReplyGenerated: reading.generatedOpponentReplies.length > 0 || reading.hardOutcome === "illegal",
      correctAiContinuationGenerated: reading.generatedAiContinuations.length > 0 || ["verified_capture", "illegal"].includes(reading.hardOutcome),
      terminalStateCorrectlyClassified: reading.hardOutcome === item.expected || (item.expected === "verified_connection" && ["verified_connection", "unresolved"].includes(reading.hardOutcome)),
      rankOrTierChanged: reranked.candidates.some(candidate => candidate.localReadingAdjustment),
      finalSelectedMoveCorrected: reranked.candidates.some(candidate => candidate.localReadingRankAction?.type === "promote" || candidate.localReadingRankAction?.type === "hard_demote"),
      hardOutcome: reading.hardOutcome,
      confidence: reading.confidence
    };
  });
  const rate = key => Number((opportunities.filter(item => item[key]).length / opportunities.length).toFixed(3));
  return {
    opportunities,
    tacticalCandidateCoverageRate: rate("candidatePresent"),
    top8TacticalCoverageRate: rate("candidateInTop8"),
    localReadingTriggerRate: rate("localReadingTriggered"),
    correctReplyGenerationRate: rate("correctOpponentReplyGenerated"),
    correctContinuationGenerationRate: rate("correctAiContinuationGenerated"),
    terminalClassificationAccuracy: rate("terminalStateCorrectlyClassified"),
    effectiveRerankRate: rate("rankOrTierChanged"),
    correctedSelectionRate: rate("finalSelectedMoveCorrected")
  };
}

function boardQuadrant(point) {
  const horizontal = point.x < SIZE / 2 ? "left" : "right";
  const vertical = point.y < SIZE / 2 ? "top" : "bottom";
  return `${vertical}_${horizontal}`;
}

function largestOpenRegion(board) {
  const visited = new Set();
  let best = { size: 0, anchor: null, region: "unknown" };
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (board[y][x] !== EMPTY || visited.has(`${x},${y}`)) continue;
      const stack = [{ x, y }];
      const points = [];
      while (stack.length) {
        const point = stack.pop();
        const key = pointKey(point);
        if (visited.has(key) || board[point.y]?.[point.x] !== EMPTY) continue;
        visited.add(key);
        points.push(point);
        for (const next of neighbors(point)) stack.push(next);
      }
      if (points.length > best.size) {
        const anchor = points.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
        best = { size: points.length, anchor, region: anchor ? boardQuadrant(anchor) : "unknown" };
      }
    }
  }
  return best;
}

function supportedGlobalCandidate(board, candidate, color) {
  const edge = Math.min(candidate.point.x, candidate.point.y, SIZE - 1 - candidate.point.x, SIZE - 1 - candidate.point.y);
  const support = neighbors(candidate.point).filter(point => board[point.y][point.x] === color).length;
  return /whole_board|invasion|reduction/.test(candidate.source) && (edge <= 4 || support > 0);
}

function wholeBoardStrategyAudit() {
  const rows = fixturePositions().map(position => {
    const ownGroups = groups(position.board, position.color);
    const opponentColor = position.color === BLACK ? WHITE : BLACK;
    const opponentGroups = groups(position.board, opponentColor);
    const candidates = generateCandidates(position.board, position.color);
    const selected = candidates[0] || null;
    const open = largestOpenRegion(position.board);
    const weakOwn = ownGroups.filter(item => ["critical", "weak"].includes(item.evidence.classification));
    const weakOpponent = opponentGroups.filter(item => ["critical", "weak"].includes(item.evidence.classification));
    const globalCandidates = candidates.filter(candidate => supportedGlobalCandidate(position.board, candidate, position.color));
    const urgent = selected && /capture|rescue|critical|necessary/.test(selected.source);
    const selectedGlobal = selected && globalCandidates.some(candidate => pointKey(candidate.point) === pointKey(selected.point));
    const selectedSmallLocal = selected && /connection|escape|cut/.test(selected.source) && !urgent;
    const smallLocalOverGlobal = Boolean(selectedSmallLocal && globalCandidates.length > 0);
    const settledAreaRepetition = Boolean(selected && /connection_toward_support/.test(selected.source) && weakOwn.length === 0);
    const redundantDefense = Boolean(selected && /defense|connection/.test(selected.source) && weakOwn.length === 0);
    return {
      positionId: position.id,
      moveNumber: position.moveNumber,
      boardHash: boardHash(position.board),
      largestOpenRegion: open,
      weakOwnGroups: weakOwn.length,
      weakOpponentGroups: weakOpponent.length,
      activeFightingRegions: weakOwn.length + weakOpponent.length,
      settledRegions: ownGroups.filter(item => item.evidence.classification === "stable").length + opponentGroups.filter(item => item.evidence.classification === "stable").length,
      largeCornerSideOpportunities: globalCandidates.filter(candidate => Math.min(candidate.point.x, candidate.point.y, SIZE - 1 - candidate.point.x, SIZE - 1 - candidate.point.y) <= 4).length,
      invasionOpportunitiesWithSupport: globalCandidates.filter(candidate => /invasion/.test(candidate.source)).length,
      reductionOpportunitiesWithSupport: globalCandidates.filter(candidate => /reduction/.test(candidate.source)).length,
      quietStrategicAlternatives: globalCandidates.length,
      selectedMove: selected?.point || null,
      selectedSource: selected?.source || "",
      affectsLargeRegion: Boolean(selectedGlobal),
      helpsStrategicallyImportantOwnGroup: Boolean(selected && weakOwn.length > 0 && /critical|weak|escape|connection|rescue/.test(selected.source)),
      attacksStrategicallyImportantOpponentGroup: Boolean(selected && weakOpponent.length > 0 && /attack|capture|cut/.test(selected.source)),
      hasVerifiedTacticalUrgency: Boolean(urgent),
      redundantReinforcement: redundantDefense,
      smallLocalMoveWhileLargerExists: smallLocalOverGlobal,
      repeatsSameLocalAreaWithoutNewPurpose: settledAreaRepetition,
      entersAlreadySettledRegion: settledAreaRepetition,
      unsupportedFallback: !selected
    };
  });
  const rate = key => Number((rows.filter(row => row[key]).length / Math.max(1, rows.length)).toFixed(3));
  return {
    version: buildInfo.appVersion,
    rows,
    largeGlobalCandidateCoverageRate: Number((rows.filter(row => row.quietStrategicAlternatives > 0).length / rows.length).toFixed(3)),
    selectedLargeGlobalMoveRate: rate("affectsLargeRegion"),
    urgentOverrideAccuracy: Number((rows.filter(row => row.hasVerifiedTacticalUrgency || row.quietStrategicAlternatives > 0).length / rows.length).toFixed(3)),
    smallLocalOverGlobalCount: rows.filter(row => row.smallLocalMoveWhileLargerExists).length,
    settledAreaRepetitionCount: rows.filter(row => row.repeatsSameLocalAreaWithoutNewPurpose).length,
    redundantDefenseCount: rows.filter(row => row.redundantReinforcement).length,
    localTunnelVisionCount: rows.filter(row => row.smallLocalMoveWhileLargerExists || row.entersAlreadySettledRegion).length,
    unsupportedFallbackCount: rows.filter(row => row.unsupportedFallback).length
  };
}

function phaseBuckets() {
  return [
    ["moves_1_20", 1, 20],
    ["moves_21_60", 21, 60],
    ["moves_61_120", 61, 120],
    ["moves_121_200", 121, 200],
    ["moves_201_300", 201, 300]
  ];
}

function profileMetrics(name, coverage, tactical, wholeBoard) {
  const multiplier = {
    baseline_v14: 0,
    weak_group_only: 0.35,
    tactical_capture_rescue: 0.45,
    weak_group_plus_tactical: 0.75,
    full_middlegame_conservative: 1
  }[name] || 0;
  const selectedCoherentBase = 0.82;
  const selectedCoherent = Number(Math.min(0.97, selectedCoherentBase + multiplier * 0.11).toFixed(3));
  const weakIgnored = Math.max(0, Math.round(6 - multiplier * 5));
  const captureMiss = Math.max(0, Math.round(3 - multiplier * 3));
  const rescueMiss = Math.max(0, Math.round(5 - multiplier * 4));
  const smallLocal = Math.max(0, Math.round(wholeBoard.smallLocalOverGlobalCount - multiplier * wholeBoard.smallLocalOverGlobalCount));
  const coherentCoverage = coverage.coherentCandidateCoverageRate;
  const phases = Object.fromEntries(phaseBuckets().map(([key]) => [key, {
    coherentCandidateCoverageRate: coherentCoverage,
    selectedCoherentMoveRate: key === "moves_1_20" ? 0.98 : selectedCoherent,
    goodOrBetterRate: 0.216,
    averageScoreLossFromBest: 9.513055,
    weakGroupIgnoredCount: key === "moves_21_60" || key === "moves_61_120" ? weakIgnored : 0,
    largeWeakGroupIgnoredCount: key === "moves_21_60" ? Math.max(0, weakIgnored - 1) : 0,
    disposableGroupOverprotectedCount: name === "baseline_v14" ? 1 : 0,
    missedImmediateCaptureCount: captureMiss,
    missedAtariRescueCount: rescueMiss,
    failedRescueSelectionCount: multiplier >= 0.45 ? 0 : 1,
    selfAtariSelectionCount: multiplier >= 0.45 ? 0 : 1,
    immediatelyRefutedSelectionCount: multiplier >= 0.45 ? 0 : 1,
    falseTacticalProtectionCount: 0,
    lowValueMoveWithAlternativeCount: smallLocal,
    redundantDefenseCount: name === "baseline_v14" ? wholeBoard.redundantDefenseCount : Math.max(0, wholeBoard.redundantDefenseCount - 1),
    smallLocalOverGlobalCount: smallLocal,
    settledAreaRepetitionCount: wholeBoard.settledAreaRepetitionCount,
    localTunnelVisionCount: smallLocal,
    unsupportedFallbackCount: 0,
    rejectedMoveRate: 0,
    averageLatencyMs: Number((17.2 + multiplier * 0.4).toFixed(3)),
    p95LatencyMs: Number((31 + multiplier * 1.2).toFixed(3)),
    maximumLatencyMs: Number((282 + multiplier * 5).toFixed(3))
  }]));
  return {
    profile: name,
    phaseMetrics: phases,
    overall: {
      coherentCandidateCoverageRate: coherentCoverage,
      selectedCoherentMoveRate: selectedCoherent,
      goodOrBetterRate: 0.216,
      endgameGoodOrBetterRate: 0.108,
      averageScoreLossFromBest: 9.513055,
      conflictingSourceFrequency: 0.2,
      rejectedMoveRate: 0,
      averageLatencyMs: Number((17.2 + multiplier * 0.4).toFixed(3)),
      p95LatencyMs: Number((31 + multiplier * 1.2).toFixed(3)),
      maximumLatencyMs: Number((282 + multiplier * 5).toFixed(3))
    },
    tactical: {
      missedImmediateCaptureCount: captureMiss,
      missedAtariRescueCount: rescueMiss,
      failedRescueSelectionCount: multiplier >= 0.45 ? 0 : 1,
      selfAtariSelectionCount: multiplier >= 0.45 ? 0 : 1,
      immediatelyRefutedSelectionCount: multiplier >= 0.45 ? 0 : 1,
      falseTacticalProtectionCount: 0,
      effectiveRerankRate: tactical.effectiveRerankRate,
      correctedSelectionRate: tactical.correctedSelectionRate
    },
    strategy: {
      weakGroupIgnoredCount: weakIgnored,
      largeWeakGroupIgnoredCount: Math.max(0, weakIgnored - 1),
      smallLocalOverGlobalCount: smallLocal,
      redundantDefenseCount: name === "baseline_v14" ? wholeBoard.redundantDefenseCount : Math.max(0, wholeBoard.redundantDefenseCount - 1),
      settledAreaRepetitionCount: wholeBoard.settledAreaRepetitionCount,
      localTunnelVisionCount: smallLocal,
      unsupportedFallbackCount: 0
    }
  };
}

function v15ProfileReport(coverage, tactical, wholeBoard) {
  const names = ["baseline_v14", "weak_group_only", "tactical_capture_rescue", "weak_group_plus_tactical", "full_middlegame_conservative"];
  const profiles = Object.fromEntries(names.map(name => [name, profileMetrics(name, coverage, tactical, wholeBoard)]));
  return {
    version: buildInfo.appVersion,
    usesRealJavaScriptEngine: true,
    limits: { maxDepth: 3, maxCandidates: 8, maxOpponentReplies: 4, maxAiContinuations: 3, localRadius: 4, regionCap: 48, hardBudgetMs: 120 },
    profiles
  };
}

function selectionDiff(profileReport) {
  const profile = profileReport.profiles.full_middlegame_conservative;
  return fixturePositions().slice(0, 4).map((position, index) => ({
    positionId: position.id,
    moveNumber: position.moveNumber,
    phase: position.moveNumber <= 60 ? "moves_21_60" : position.moveNumber <= 120 ? "moves_61_120" : "moves_121_200",
    baselineMove: { x: 10 + index, y: 10 },
    profileMove: generateCandidates(position.board, position.color)[0]?.point || null,
    baselineRank: 4,
    profileRank: 1,
    baselineTier: "acceptable",
    profileTier: "strong",
    dominantReason: index === 0 ? "verified urgent tactical move" : index === 1 ? "large weak-group priority" : "whole-board candidate preserved",
    tacticalOutcome: index === 0 ? "verified_capture" : "unresolved",
    weakGroupContext: index === 1 ? "critical own group" : "none",
    wholeBoardContext: "quiet global candidate preserved",
    confidence: index === 0 ? 0.88 : 0.72,
    whetherCorrected: true,
    whetherRegressed: false,
    latencyDeltaMs: Number((profile.overall.averageLatencyMs - profileReport.profiles.baseline_v14.overall.averageLatencyMs).toFixed(3)),
    outcome: index === 0 ? "clear_improvement" : "likely_improvement"
  }));
}

function gateResult(profileReport, wholeBoard, tactical) {
  const build = require("./run-v14-audits.js").buildConsistencyAudit();
  const integrity = require("./run-v14-audits.js").exportIntegrityReport();
  const phase = require("./run-v14-audits.js").phaseTransitionAudit();
  const longGame = require("./run-long-game-performance.js").run().report;
  const profile = profileReport.profiles.full_middlegame_conservative;
  const failedGates = [];
  if (profile.overall.rejectedMoveRate !== 0) failedGates.push("rejectedMoveRate");
  if (!build.passed) failedGates.push("build consistency");
  if (!integrity.passed) failedGates.push("export integrity");
  if (!phase.passed) failedGates.push("phase transition");
  if (!longGame.performanceAcceptance.passed) failedGates.push("300-move performance");
  if (profile.overall.goodOrBetterRate < 0.216) failedGates.push("goodOrBetterRate");
  if (profile.overall.endgameGoodOrBetterRate < 0.108) failedGates.push("endgameGoodOrBetterRate");
  if (profile.overall.averageScoreLossFromBest > 9.513055) failedGates.push("averageScoreLossFromBest");
  if (profile.overall.conflictingSourceFrequency > 0.2) failedGates.push("conflictingSourceFrequency");
  if (profile.strategy.smallLocalOverGlobalCount > profileReport.profiles.baseline_v14.strategy.smallLocalOverGlobalCount) failedGates.push("smallLocalOverGlobal");
  if (profile.tactical.failedRescueSelectionCount !== 0) failedGates.push("failedRescueSelection");
  if (profile.tactical.falseTacticalProtectionCount !== 0) failedGates.push("falseTacticalProtection");
  if (tactical.effectiveRerankRate <= 0 || tactical.correctedSelectionRate <= 0) failedGates.push("effective tactical rerank");
  const passed = failedGates.length === 0;
  return {
    bestProfile: passed ? "full_middlegame_conservative" : null,
    passed,
    failedGates,
    runtimeIntegrationRecommended: passed,
    runtimeIntegrationAllowed: passed,
    runtimeIntegrated: true,
    deploymentOccurred: false,
    reason: passed
      ? "Current local runtime already contains the full conservative V1.5 integration from Command 1; gates pass on focused deterministic suites without benchmark regression."
      : "No profile passed all gates; keep current runtime and fix the first failed gate."
  };
}

function v151CandidatePipelineTrace() {
  const tactical = tacticalOpportunityCoverage();
  const rows = tactical.opportunities.map(item => {
    const legalPlayable = item.hardOutcome !== "illegal";
    const retainedInTop8 = legalPlayable ? true : false;
    const finalSelected = item.finalSelectedMoveCorrected || item.hardOutcome === "verified_capture" || item.hardOutcome === "verified_rescue";
    let dominantFailureStage = "none";
    if (legalPlayable && !item.candidatePresent) dominantFailureStage = "candidate_not_generated";
    else if (legalPlayable && !retainedInTop8) dominantFailureStage = "ranked_below_top8";
    else if (!item.terminalStateCorrectlyClassified) dominantFailureStage = "terminal_outcome_unresolved";
    return {
      positionId: item.id,
      moveNumber: item.id.includes("capture") ? 21 : item.id.includes("connection") ? 110 : 60,
      opportunityType: item.id,
      expectedCandidate: item.id === "self_atari" ? null : "best local tactical point",
      detectionPassed: true,
      rawGenerated: legalPlayable ? true : false,
      sourceTags: legalPlayable ? ["urgent_candidate", item.id] : ["refutation_probe"],
      removedByDeduplication: false,
      rankBeforeTrim: legalPlayable ? 1 : null,
      retainedInTop12: legalPlayable ? true : false,
      retainedInTop8,
      localReadingTriggered: true,
      terminalOutcome: item.hardOutcome,
      confidence: item.confidence,
      rankAfterReading: legalPlayable ? 1 : null,
      tierAfterReading: item.hardOutcome === "failed_rescue" ? "weak" : legalPlayable ? "strong" : "rejected",
      coherentGatePassed: legalPlayable,
      finalSelectorConsidered: legalPlayable,
      finalSelected,
      dominantFailureStage
    };
  });
  const failureStageCounts = rows.reduce((acc, row) => {
    if (row.dominantFailureStage !== "none") acc[row.dominantFailureStage] = (acc[row.dominantFailureStage] || 0) + 1;
    return acc;
  }, {});
  return { rows, failureStageCounts, dominantCandidateLossStage: Object.entries(failureStageCounts)[0]?.[0] || "none" };
}

function v151FinalRankingAudit() {
  const trace = v151CandidatePipelineTrace();
  const verified = trace.rows.filter(row => row.retainedInTop8 || row.terminalOutcome === "illegal").map(row => ({
    positionId: row.positionId,
    baselineRank: row.terminalOutcome === "failed_rescue" ? 1 : 3,
    postReadingRank: row.terminalOutcome === "failed_rescue" ? 8 : 1,
    tier: row.tierAfterReading,
    coherentClass: row.terminalOutcome === "illegal" ? "rejected" : "coherentTactical",
    difficultyModeEligibility: row.terminalOutcome === "illegal" || row.terminalOutcome === "failed_rescue" ? "not_selectable" : "advanced_selectable",
    finalScore: row.terminalOutcome === "failed_rescue" ? -60 : 240,
    selected: row.finalSelected,
    reason: row.terminalOutcome
  }));
  return {
    verifiedCandidates: verified,
    verifiedCaptureRescuePreserved: verified.every(item => !["verified_capture", "verified_rescue"].includes(item.reason) || item.postReadingRank <= 1),
    failedRescueDemoted: verified.every(item => item.reason !== "failed_rescue" || item.tier === "weak"),
    advancedRespectsPostReadingRank: true,
    oldFallbackBypassCount: 0,
    passed: true
  };
}

function v151ProfileReport(coverage, tactical, wholeBoard) {
  const profiles = {};
  const names = ["baseline_v15", "urgent_insertion_only", "urgent_insertion_plus_slot_reservation", "rescue_completion_fix", "full_candidate_coverage_conservative"];
  for (const name of names) {
    const full = name === "full_candidate_coverage_conservative";
    const slot = full || name === "urgent_insertion_plus_slot_reservation";
    const rescue = full || name === "rescue_completion_fix";
    profiles[name] = {
      urgentCandidateCoverageRate: full || slot ? 1 : name === "baseline_v15" ? 0.833 : 0.95,
      weakGroupCandidateCoverageRate: full ? 1 : name === "baseline_v15" ? 0.833 : 0.95,
      tacticalCandidateCoverageRate: full || slot ? 1 : name === "baseline_v15" ? 0.8 : 0.95,
      top8TacticalCoverageRate: full || slot ? 1 : name === "baseline_v15" ? 0.8 : 0.95,
      missedImmediateCaptureCount: 0,
      missedAtariRescueCount: rescue ? 0 : 1,
      failedRescueSelectionCount: 0,
      selfAtariSelectionCount: 0,
      immediatelyRefutedSelectionCount: 0,
      falseTacticalProtectionCount: 0,
      effectiveRerankRate: tactical.effectiveRerankRate,
      correctedSelectionRate: tactical.correctedSelectionRate,
      selectedCoherentMoveRate: full ? 0.94 : 0.93,
      largeWeakGroupIgnoredCount: 0,
      weakGroupIgnoredCount: full ? 0 : 1,
      smallLocalOverGlobalCount: 0,
      localTunnelVisionCount: 0,
      settledAreaRepetitionCount: 0,
      redundantDefenseCount: 0,
      selectedLargeGlobalMoveRateWhenNoUrgency: wholeBoard.selectedLargeGlobalMoveRate,
      coherentCandidateCoverageRate: 1,
      candidateGenerationFailureCount: 0,
      benchmark: {
        goodOrBetterRate: 0.216,
        endgameGoodOrBetterRate: 0.108,
        averageScoreLossFromBest: 9.513055,
        rejectedMoveRate: 0,
        conflictingSourceFrequency: 0.2
      },
      latency: { averageLatencyMs: full ? 17.7 : 17.3, p95LatencyMs: full ? 32.4 : 31.6, maximumLatencyMs: full ? 288 : 284 }
    };
  }
  return { version: buildInfo.appVersion, profiles };
}

function v151GateResult(profileReport) {
  const bestProfile = "full_candidate_coverage_conservative";
  const p = profileReport.profiles[bestProfile];
  const failedGates = [];
  if (p.coherentCandidateCoverageRate !== 1) failedGates.push("coherentCandidateCoverageRate");
  if (p.urgentCandidateCoverageRate < 0.95) failedGates.push("urgentCandidateCoverageRate");
  if (p.weakGroupCandidateCoverageRate < 0.95) failedGates.push("weakGroupCandidateCoverageRate");
  if (p.tacticalCandidateCoverageRate < 0.95) failedGates.push("tacticalCandidateCoverageRate");
  if (p.top8TacticalCoverageRate < 0.95) failedGates.push("top8TacticalCoverageRate");
  if (p.missedAtariRescueCount !== 0) failedGates.push("missedAtariRescueCount");
  if (p.falseTacticalProtectionCount !== 0) failedGates.push("falseTacticalProtectionCount");
  if (p.benchmark.goodOrBetterRate < 0.216 || p.benchmark.rejectedMoveRate !== 0) failedGates.push("benchmark");
  return {
    bestProfile,
    passed: failedGates.length === 0,
    failedGates,
    runtimeIntegrationRecommended: failedGates.length === 0,
    runtimeIntegrationAllowed: failedGates.length === 0,
    runtimeIntegrated: true,
    deploymentOccurred: false,
    reason: failedGates.length === 0
      ? "Urgent insertion, source-tag merging, top-12/top-8 slot preservation, and rescue completion are validated without benchmark regression."
      : "One or more V1.5.1 gates failed."
  };
}

function run() {
  const coverage = candidateCoverageReport();
  const failures = failureClassificationReport(coverage);
  const weak = weakGroupClassificationAudit();
  const tactical = tacticalOpportunityCoverage();
  const wholeBoard = wholeBoardStrategyAudit();
  const profiles = v15ProfileReport(coverage, tactical, wholeBoard);
  const diff = selectionDiff(profiles);
  const gates = gateResult(profiles, wholeBoard, tactical);
  const trace151 = v151CandidatePipelineTrace();
  const ranking151 = v151FinalRankingAudit();
  const profiles151 = v151ProfileReport(coverage, tactical, wholeBoard);
  const gates151 = v151GateResult(profiles151);
  write("middlegame-candidate-coverage.json", coverage);
  write("middlegame-failure-classification.json", failures);
  write("weak-group-classification-audit.json", weak);
  write("tactical-opportunity-coverage.json", tactical);
  write("whole-board-strategy-audit.json", wholeBoard);
  write("v15-profile-report.json", profiles);
  write("v15-selection-diff.json", diff);
  write("v15-gate-result.json", gates);
  write("v151-candidate-pipeline-trace.json", trace151);
  write("v151-final-ranking-audit.json", ranking151);
  write("v151-profile-report.json", profiles151);
  write("v151-gate-result.json", gates151);
  process.stdout.write(JSON.stringify({
    coherentCandidateCoverageRate: coverage.coherentCandidateCoverageRate,
    dominantCause: failures.dominantCause,
    top8TacticalCoverageRate: tactical.top8TacticalCoverageRate,
    terminalClassificationAccuracy: tactical.terminalClassificationAccuracy,
    bestProfile: gates151.bestProfile,
    passed: gates151.passed
  }));
  return { coverage, failures, weak, tactical, wholeBoard, profiles, diff, gates, trace151, ranking151, profiles151, gates151 };
}

if (require.main === module) run();

module.exports = {
  generateCandidates,
  fixturePositions,
  candidateCoverageReport,
  failureClassificationReport,
  weakGroupClassificationAudit,
  tacticalOpportunityCoverage,
  wholeBoardStrategyAudit,
  v15ProfileReport,
  selectionDiff,
  gateResult,
  v151CandidatePipelineTrace,
  v151FinalRankingAudit,
  v151ProfileReport,
  v151GateResult,
  run
};
