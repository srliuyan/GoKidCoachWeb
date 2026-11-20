import { GAME_RULES, STORAGE_CONFIG } from '../config/game';
import { clampDifficultyLevel, DEFAULT_DIFFICULTY_LEVEL } from '../config/difficulty';
import { createAdaptiveProfile, type AdaptiveProfile } from './adaptive';
import { boardsEqual, createGame, passTurn, playMove, scoreChineseArea } from './rules';
import type { Board, GameResult, GameState, PlayedMove, Player } from './types';

export function saveGame(state: GameState, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_CONFIG.gameKey, JSON.stringify(state));
}

export function loadGame(storage: Storage = localStorage): GameState | null {
  return parseStoredGame(storage.getItem(STORAGE_CONFIG.gameKey));
}

export function parseStoredGame(raw: string | null): GameState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GameState>;
    if (value.version !== STORAGE_CONFIG.gameVersion) return null;
    if (!isBoard(value.board)) return null;
    const previousBoard = value.previousBoard === undefined ? null : value.previousBoard;
    if (previousBoard !== null && !isBoard(previousBoard)) return null;
    if (!isPlayer(value.currentPlayer) || !isPlayer(value.childColor)) return null;
    if (value.status !== 'active' && value.status !== 'finished') return null;
    if (!Array.isArray(value.moves) || !value.captures || !value.difficulty) return null;
    if (!isCaptures(value.captures)) return null;
    const consecutivePasses = value.consecutivePasses;
    if (typeof consecutivePasses !== 'number' || !Number.isInteger(consecutivePasses) || consecutivePasses < 0) return null;
    if (!value.moves.every(isPlayedMove)) return null;
    if (value.result !== null && !isGameResult(value.result)) return null;
    if (typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') return null;
    const state = value as GameState;
    const rawManualLevel = state.difficulty.manualLevel ?? DEFAULT_DIFFICULTY_LEVEL;
    if (typeof rawManualLevel !== 'number' || !Number.isFinite(rawManualLevel)) return null;
    const manualLevel = clampDifficultyLevel(rawManualLevel);
    const difficultyMode = state.difficulty.mode === 'manual' || state.difficulty.mode === 'adaptive'
      ? state.difficulty.mode
      : 'manual';
    const normalized: GameState = difficultyMode === 'manual' && state.difficulty.mode !== 'manual'
      ? {
          ...state,
          previousBoard,
          difficulty: { mode: 'manual', manualLevel },
        }
      : { ...state, previousBoard, difficulty: { mode: difficultyMode, manualLevel } };
    if (!isInternallyConsistentGame(normalized)) return null;
    if (state.difficulty.mode !== 'manual' && state.difficulty.mode !== 'adaptive') {
      return normalized;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function saveAdaptiveProfile(profile: AdaptiveProfile, storage: Storage = localStorage): void {
  storage.setItem(STORAGE_CONFIG.adaptiveKey, JSON.stringify(profile));
}

export function loadAdaptiveProfile(storage: Storage = localStorage): AdaptiveProfile {
  const raw = storage.getItem(STORAGE_CONFIG.adaptiveKey);
  if (!raw) return createAdaptiveProfile();
  try {
    const value = JSON.parse(raw) as Partial<AdaptiveProfile>;
    if (value.version !== STORAGE_CONFIG.adaptiveVersion || typeof value.estimatedLevel !== 'number' || !Number.isFinite(value.estimatedLevel)) {
      return createAdaptiveProfile();
    }
    if (!Array.isArray(value.recentMoves) || !Array.isArray(value.recentGames)) return createAdaptiveProfile();
    return { ...value, estimatedLevel: clampDifficultyLevel(value.estimatedLevel) } as AdaptiveProfile;
  } catch {
    return createAdaptiveProfile();
  }
}

function isBoard(value: unknown): value is Board {
  return Array.isArray(value)
    && value.length === GAME_RULES.boardSize
    && value.every((row) => Array.isArray(row) && row.length === GAME_RULES.boardSize && row.every((point) => point === null || isPlayer(point)));
}

function isPlayer(value: unknown): value is Player {
  return value === 'black' || value === 'white';
}

function isCaptures(value: unknown): value is Record<Player, number> {
  if (!value || typeof value !== 'object') return false;
  const captures = value as Partial<Record<Player, unknown>>;
  const black = captures.black;
  const white = captures.white;
  return typeof black === 'number' && Number.isInteger(black) && black >= 0
    && typeof white === 'number' && Number.isInteger(white) && white >= 0;
}

function isPlayedMove(value: unknown): value is PlayedMove {
  if (!value || typeof value !== 'object') return false;
  const move = value as Partial<PlayedMove>;
  const x = move.x;
  const y = move.y;
  const captured = move.captured;
  if (!isPlayer(move.player)) return false;
  if (typeof move.pass !== 'boolean' || typeof move.playedAt !== 'number') return false;
  if (typeof captured !== 'number' || !Number.isInteger(captured) || captured < 0) return false;
  if (move.capturedStones !== undefined && !isCapturedStones(move.capturedStones, captured)) return false;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (move.pass) return x === -1 && y === -1 && captured === 0;
  return x >= 0 && y >= 0 && x < GAME_RULES.boardSize && y < GAME_RULES.boardSize;
}

function isCapturedStones(value: unknown, captured: number): value is { x: number; y: number }[] {
  return Array.isArray(value)
    && value.length === captured
    && value.every((point) => {
      if (!point || typeof point !== 'object') return false;
      const candidate = point as Partial<{ x: unknown; y: unknown }>;
      return typeof candidate.x === 'number'
        && typeof candidate.y === 'number'
        && Number.isInteger(candidate.x)
        && Number.isInteger(candidate.y)
        && candidate.x >= 0
        && candidate.y >= 0
        && candidate.x < GAME_RULES.boardSize
        && candidate.y < GAME_RULES.boardSize;
    });
}

function isGameResult(value: unknown): value is GameResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<GameResult>;
  if (!isPlayer(result.winner)) return false;
  if (result.reason === 'resign') return true;
  if (result.reason !== 'score') return false;
  return typeof result.margin === 'number'
    && typeof result.blackScore === 'number'
    && typeof result.whiteScore === 'number';
}

function isInternallyConsistentGame(state: GameState): boolean {
  if (state.status === 'active' && state.result !== null) return false;
  if (state.status === 'finished' && state.result === null) return false;

  const replay = createGame(state.childColor, state.difficulty, state.createdAt);
  let cursor: GameState = { ...replay, id: state.id };
  for (const move of state.moves) {
    if (move.player !== cursor.currentPlayer) return false;
    const result = move.pass
      ? passTurn(cursor, move.player, move.playedAt)
      : playMove(cursor, move.x, move.y, move.player, move.playedAt);
    if (!result.ok) return false;
    if (result.move.captured !== move.captured) return false;
    cursor = result.state;
  }

  if (!boardsEqual(cursor.board, state.board)) return false;
  if (state.previousBoard === null) {
    if (cursor.previousBoard !== null) return false;
  } else if (!cursor.previousBoard || !boardsEqual(cursor.previousBoard, state.previousBoard)) {
    return false;
  }
  if (cursor.currentPlayer !== state.currentPlayer) return false;
  if (cursor.captures.black !== state.captures.black || cursor.captures.white !== state.captures.white) return false;
  if (cursor.consecutivePasses !== state.consecutivePasses) return false;

  if (state.result?.reason === 'score') {
    if (cursor.status !== 'finished' || !cursor.result || cursor.result.reason !== 'score') return false;
    const expected = scoreChineseArea(state.board);
    return scoreResultsEqual(state.result, expected);
  }
  if (state.result?.reason === 'resign') {
    return state.status === 'finished';
  }
  return cursor.status === state.status;
}

function scoreResultsEqual(left: GameResult, right: GameResult): boolean {
  return left.winner === right.winner
    && left.reason === right.reason
    && left.margin === right.margin
    && left.blackScore === right.blackScore
    && left.whiteScore === right.whiteScore;
}
