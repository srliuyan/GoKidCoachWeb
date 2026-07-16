#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ruleEngine = require("../rule-engine.js");
const v15 = require("./run-v15-middlegame-audit.js");
const stressGenerator = require("./generate-bad-move-stress-positions.js");
const endgameAudit = require("./run-v161-endgame-audit.js");
const buildInfo = require("../build-info.js");
const product = require("../product-support.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_OUT = path.join(__dirname, "v200-positions.json");
const BLACK = 1;
const WHITE = 2;
const EMPTY = 0;
const MAX_MODE = "MAX_STRENGTH_FIXED";
const DEFAULT_REAL_GAME_SGF = "/mnt/data/GoKidCoach-2026-07-14.sgf";
const DEFAULT_REAL_GAME_DEBUG = "/mnt/data/GoKidCoach-debug-2026-07-14.json";
const LETTERS = "ABCDEFGHJKLMNOPQRST";

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    out: DEFAULT_OUT,
    seed: 20260715,
    target: 2200,
    realGameSgf: DEFAULT_REAL_GAME_SGF,
    realGameDebug: DEFAULT_REAL_GAME_DEBUG,
    check: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out") args.out = argv[index += 1];
    else if (item === "--seed") args.seed = Number(argv[index += 1]);
    else if (item === "--target") args.target = Number(argv[index += 1]);
    else if (item === "--real-game-sgf" || item === "--sgf") args.realGameSgf = argv[index += 1];
    else if (item === "--real-game-debug" || item === "--debug") args.realGameDebug = argv[index += 1];
    else if (item === "--check") args.check = true;
  }
  return args;
}

function pointKey(point) {
  if (!point) return "pass";
  return `${point.x},${point.y}`;
}

function sgfCoordToPoint(raw) {
  if (raw === "") return null;
  return { x: raw.charCodeAt(0) - 97, y: raw.charCodeAt(1) - 97 };
}

function pointToSgfCoord(point) {
  if (!point) return "";
  return `${String.fromCharCode(97 + point.x)}${String.fromCharCode(97 + point.y)}`;
}

function pointToKataGoCoord(point, boardSize = 19) {
  if (!point) return "pass";
  return `${LETTERS[point.x]}${boardSize - point.y}`;
}

function kataGoCoordToPoint(move, boardSize = 19) {
  if (!move || String(move).toLowerCase() === "pass") return null;
  const x = LETTERS.indexOf(String(move)[0].toUpperCase());
  const y = boardSize - Number(String(move).slice(1));
  return x >= 0 && Number.isFinite(y) ? { x, y } : null;
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function opponent(color) {
  return color === BLACK ? WHITE : BLACK;
}

function normalizeColor(value, fallback = WHITE) {
  if (value === BLACK || value === "B" || value === "black" || value === "BLACK") return BLACK;
  if (value === WHITE || value === "W" || value === "white" || value === "WHITE") return WHITE;
  return fallback;
}

function phaseFor(moveNumber) {
  if (moveNumber <= 20) return "opening_1_20";
  if (moveNumber <= 60) return "early_middlegame_21_60";
  if (moveNumber <= 120) return "middlegame_61_120";
  if (moveNumber <= 200) return "late_middlegame_121_200";
  return "endgame_201_plus";
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boardHash(board) {
  return ruleEngine.boardHash ? ruleEngine.boardHash(board) : stableHash(board).slice(0, 16);
}

function legalMoves(board, color) {
  const moves = [];
  for (let y = 0; y < board.length; y += 1) {
    for (let x = 0; x < board[y].length; x += 1) {
      if (board[y][x] !== EMPTY) continue;
      const result = ruleEngine.simulateMove(board, { x, y }, color, []);
      if (result.legal) moves.push({ x, y });
    }
  }
  return moves;
}

function normalizeCandidate(candidate, index) {
  return {
    move: pointKey(candidate.point),
    point: candidate.point,
    engineRank: index + 1,
    score: Number(candidate.priority ?? candidate.combinedScore ?? candidate.score ?? 0),
    tier: candidate.tier || candidate.qualityTier || (index === 0 ? "best" : index < 3 ? "strong" : "candidate"),
    sourceTags: candidate.sourceTags || [candidate.source || "unknown"]
  };
}

function engineSelection(board, color, mode = MAX_MODE) {
  const candidates = v15.generateCandidates(board, color).slice(0, 12).map(normalizeCandidate);
  const selected = candidates[0] || null;
  return {
    currentEngineSelectedMove: selected?.point || null,
    currentEngineSelectedMoveKey: selected?.move || null,
    currentTop10Candidates: candidates.slice(0, 10),
    selectedCandidateRank: selected?.engineRank || 0,
    selectedTier: selected?.tier || "none",
    difficultyMode: mode,
    readingTrace: {
      localReadingCandidateCap: mode === MAX_MODE ? 10 : 8,
      maxDepth: 3,
      maxOpponentReplies: 4,
      allowConditionalReply5: mode === MAX_MODE,
      maxAiContinuations: 3
    },
    finalSelectorTrace: {
      selectedBy: mode === MAX_MODE ? "deterministicCandidateCompare_after_current_pipeline" : "current_mode_pipeline",
      finalSelectorGuardObserved: true
    }
  };
}

function classifySourceTags(position, candidates) {
  const joined = candidates.flatMap(candidate => candidate.sourceTags || []).join(" ");
  const expected = (position.expectedIssueCategories || []).join(" ");
  const tags = new Set(position.sourceTags || []);
  if (/capture|atari|tactical|rescue|self-atari|critical/i.test(`${joined} ${expected}`)) tags.add("tactical_high_risk");
  if (/weak|rescue|escape|critical_own/i.test(`${joined} ${expected}`)) tags.add("weak_group");
  if (/endgame|yose|dame|territory|first.line/i.test(`${position.phase} ${expected}`)) tags.add("endgame");
  if (/whole_board|invasion|reduction|large_whole_board/i.test(joined)) tags.add("whole_board_strategy");
  return Array.from(tags);
}

function makePosition(source, position, index, mode = MAX_MODE) {
  const board = cloneBoard(position.board);
  const color = normalizeColor(position.sideToMove ?? position.color, WHITE);
  const moveNumber = Number(position.moveNumber || index + 1);
  const selection = engineSelection(board, color, mode);
  const sourceTags = classifySourceTags(position, selection.currentTop10Candidates);
  return {
    positionId: `${source}:${position.positionId || position.id || index}:${boardHash(board)}:${color}`,
    sourceGame: source,
    moveNumber,
    sideToMove: color === BLACK ? "B" : "W",
    board,
    koState: position.koState || null,
    komi: Number.isFinite(Number(position.komi)) ? Number(position.komi) : 7.5,
    moveHistory: Array.isArray(position.moveHistory) ? position.moveHistory : [],
    currentEngineSelectedMove: selection.currentEngineSelectedMove,
    currentEngineSelectedMoveKey: selection.currentEngineSelectedMoveKey,
    currentTop10Candidates: selection.currentTop10Candidates,
    selectedCandidateRank: selection.selectedCandidateRank,
    selectedTier: selection.selectedTier,
    difficultyMode: selection.difficultyMode,
    sourceTags,
    phase: phaseFor(moveNumber),
    deterministicBoardHash: stableHash({ board, color, moveNumber }).slice(0, 24),
    readingTrace: selection.readingTrace,
    finalSelectorTrace: selection.finalSelectorTrace,
    legalMoveCount: legalMoves(board, color).length,
    realGameDataCompleteness: position.realGameDataCompleteness,
    actualSgfMove: position.actualSgfMove,
    uploadedDebugMode: position.uploadedDebugMode,
    privateFixtureHashesOnly: position.privateFixtureHashesOnly,
    evaluationVersion: "2.0.0-dev"
  };
}

function parseSgfMoves(text) {
  const sizeMatch = text.match(/SZ\[(\d+)\]/);
  const size = sizeMatch ? Number(sizeMatch[1]) : 19;
  const komiMatch = text.match(/KM\[([^\]]+)\]/);
  const parsedKomi = komiMatch ? Number(komiMatch[1]) : 7.5;
  const moves = [];
  const re = /;([BW])\[([^\]]*)\]/g;
  let match;
  while ((match = re.exec(text))) {
    const raw = match[2];
    moves.push({
      color: match[1] === "B" ? BLACK : WHITE,
      pass: raw === "",
      x: sgfCoordToPoint(raw)?.x ?? null,
      y: sgfCoordToPoint(raw)?.y ?? null,
      sgf: raw,
      coordinateSource: "sgf"
    });
  }
  return { size, komi: Number.isFinite(parsedKomi) ? parsedKomi : 7.5, moves };
}

function loadDebug(debugPath) {
  if (!debugPath || !fs.existsSync(debugPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(debugPath, "utf8"));
  } catch {
    return null;
  }
}

function extractSgfPositions(sgfPath, debugPath) {
  if (!sgfPath || !fs.existsSync(sgfPath)) return { positions: [], fixtureStatus: "missing", sgfPath, debugPath };
  const parsed = parseSgfMoves(fs.readFileSync(sgfPath, "utf8"));
  const debug = loadDebug(debugPath);
  const rows = [];
  let board = Array.from({ length: parsed.size }, () => Array(parsed.size).fill(EMPTY));
  const history = [];
  const debugMode = product.normalizeDifficultyMode(debug?.difficultyMode || debug?.profile?.difficultyMode || "adaptive");
  for (let index = 0; index < parsed.moves.length; index += 1) {
    const move = parsed.moves[index];
    const moveNumber = index + 1;
    const sideToMove = move.color;
    if (sideToMove === WHITE || moveNumber <= 20 || moveNumber % 5 === 0) {
      const diagnostics = Array.isArray(debug?.moveDiagnostics) ? debug.moveDiagnostics.find(item => Number(item.moveNumber) === moveNumber) : null;
      const row = makePosition("uploaded_real_game_20260714", {
        positionId: `real_game_before_${moveNumber}`,
        board,
        sideToMove,
        moveNumber,
        moveHistory: history,
        sourceTags: ["uploaded_real_game"].concat(diagnostics ? ["existing_diagnostics"] : []),
        koState: null
      }, index, debugMode);
      row.komi = parsed.komi;
      row.uploadedDebugMode = debugMode;
      row.existingDiagnostics = diagnostics || null;
      row.realGameDataCompleteness = diagnostics ? "debug_move_diagnostics_present" : "derived_from_sgf";
      row.privateFixtureHashesOnly = true;
      row.actualSgfMove = {
        color: sideToMove === BLACK ? "B" : "W",
        move: move.pass ? "pass" : pointKey(move),
        sgf: move.sgf,
        katago: move.pass ? "pass" : pointToKataGoCoord(move, parsed.size),
        derived_from_sgf: true
      };
      rows.push(row);
    }
    if (!move.pass) {
      const result = ruleEngine.simulateMove(board, { x: move.x, y: move.y }, sideToMove, []);
      if (result.legal) board = result.board;
    }
    history.push({ ...move });
  }
  const hashFile = file => fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
  return {
    positions: rows,
    fixtureStatus: "loaded",
    sgfPath,
    debugPath,
    sgfSha256: hashFile(sgfPath),
    debugSha256: hashFile(debugPath),
    debugCompleteness: Array.isArray(debug?.moveDiagnostics) ? "moveDiagnostics_present" : "reduced_metadata_only",
    difficultyMode: debugMode,
    actualMoveCount: parsed.moves.length
  };
}

function synthesizeOpeningPositions(seed, count) {
  const rows = [];
  const base = stressGenerator.generateSelfPlayPositions(seed, 800);
  for (let index = 0; rows.length < count && index < base.length; index += 1) {
    const source = base[index];
    const board = Array.from({ length: 19 }, () => Array(19).fill(EMPTY));
    const anchors = [
      [3, 3], [15, 15], [15, 3], [3, 15], [9, 3], [9, 15], [3, 9], [15, 9],
      [9, 9], [6, 6], [12, 12], [6, 12], [12, 6]
    ];
    const stones = Math.min(18, 2 + rows.length % 18);
    for (let move = 0; move < stones; move += 1) {
      const [x, y] = anchors[(move + rows.length) % anchors.length];
      if (board[y][x] === EMPTY) board[y][x] = move % 2 === 0 ? BLACK : WHITE;
    }
    rows.push({
      ...source,
      positionId: `opening_synthetic_${rows.length + 1}`,
      board,
      moveNumber: 1 + rows.length % 20,
      sideToMove: rows.length % 2 === 0 ? BLACK : WHITE,
      moveHistory: [],
      sourceTags: ["opening_synthetic"]
    });
  }
  return rows;
}

function buildPositions(options = {}) {
  const seed = Number(options.seed) || 20260715;
  const target = Number(options.target) || 2200;
  const real = extractSgfPositions(options.realGameSgf, options.realGameDebug);
  const raw = [];
  raw.push(...real.positions);
  raw.push(...synthesizeOpeningPositions(seed + 1, 220));
  raw.push(...stressGenerator.generateStressPositions({ seed, positions: 1800 }));
  raw.push(...stressGenerator.generateStressPositions({ seed: seed + 101, positions: 900 }));
  if (typeof endgameAudit.buildAuditPositions === "function") {
    raw.push(...endgameAudit.buildAuditPositions(seed + 7, 420));
  }
  const dedup = new Map();
  for (let index = 0; index < raw.length; index += 1) {
    if (!raw[index] || !raw[index].board) continue;
    const row = makePosition(raw[index].sourceType || raw[index].sourceGame || "generated_v200", raw[index], index, raw[index].difficultyMode || MAX_MODE);
    const key = `${row.deterministicBoardHash}:${row.sideToMove}:${row.moveNumber}`;
    if (!dedup.has(key)) dedup.set(key, row);
    if (dedup.size >= target) break;
  }
  const positions = Array.from(dedup.values());
  const counts = positions.reduce((acc, row) => {
    acc.byPhase[row.phase] = (acc.byPhase[row.phase] || 0) + 1;
    for (const tag of row.sourceTags) acc.byTag[tag] = (acc.byTag[tag] || 0) + 1;
    return acc;
  }, { byPhase: {}, byTag: {} });
  return {
    evaluationVersion: "2.0.0-dev",
    generatedAt: new Date().toISOString(),
    runtimeProductVersion: buildInfo.appVersion || buildInfo.productVersion,
    runtimeEngineVersion: buildInfo.engineVersion,
    runtimeBehaviorChanged: false,
    defaultDifficultyMode: product.normalizeDifficultyMode("adaptive"),
    realGameFixture: real,
    targetUniquePositions: target,
    uniquePositions: positions.length,
    counts,
    positions
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const payload = buildPositions(args);
  if (!args.check) {
    fs.writeFileSync(args.out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    uniquePositions: payload.uniquePositions,
    byPhase: payload.counts.byPhase,
    byTag: payload.counts.byTag,
    realGameFixtureStatus: payload.realGameFixture.fixtureStatus,
    output: args.check ? null : args.out
  })}\n`);
  return payload;
}

if (require.main === module) main();

module.exports = {
  buildPositions,
  parseSgfMoves,
  extractSgfPositions,
  sgfCoordToPoint,
  pointToSgfCoord,
  pointToKataGoCoord,
  kataGoCoordToPoint,
  phaseFor
};
