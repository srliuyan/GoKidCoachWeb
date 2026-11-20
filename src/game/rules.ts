import { DEFAULT_DIFFICULTY_LEVEL } from '../config/difficulty';
import { GAME_RULES } from '../config/game';
import type { Board, DifficultySettings, GameResult, GameState, Intersection, PlayResult, Player } from './types';
import { opponent } from './types';

type Point = { x: number; y: number };

export function createEmptyBoard(): Board {
  return Array.from({ length: GAME_RULES.boardSize }, () =>
    Array.from<unknown, Intersection>({ length: GAME_RULES.boardSize }, () => null),
  );
}

export function createGame(
  childColor: Player = 'black',
  difficulty: DifficultySettings = { mode: 'manual', manualLevel: DEFAULT_DIFFICULTY_LEVEL },
  now = Date.now(),
): GameState {
  return {
    version: 1,
    id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
    board: createEmptyBoard(),
    previousBoard: null,
    currentPlayer: 'black',
    childColor,
    captures: { black: 0, white: 0 },
    consecutivePasses: 0,
    moves: [],
    status: 'active',
    result: null,
    difficulty: { ...difficulty },
    createdAt: now,
    updatedAt: now,
  };
}

export function playMove(state: GameState, x: number, y: number, player = state.currentPlayer, now = Date.now()): PlayResult {
  if (state.status !== 'active') return { ok: false, reason: 'game-over' };
  if (player !== state.currentPlayer) return { ok: false, reason: 'wrong-turn' };
  if (!isOnBoard(x, y)) return { ok: false, reason: 'out-of-bounds' };
  if (state.board[y]![x] !== null) return { ok: false, reason: 'occupied' };

  const nextBoard = cloneBoard(state.board);
  nextBoard[y]![x] = player;
  let captured = 0;
  const capturedStones: Point[] = [];
  const enemy = opponent(player);
  for (const neighbor of neighbors(x, y)) {
    if (nextBoard[neighbor.y]![neighbor.x] !== enemy) continue;
    const group = collectGroup(nextBoard, neighbor.x, neighbor.y);
    if (group.liberties > 0) continue;
    captured += group.stones.length;
    capturedStones.push(...group.stones);
    for (const stone of group.stones) nextBoard[stone.y]![stone.x] = null;
  }

  if (!GAME_RULES.allowSuicide && collectGroup(nextBoard, x, y).liberties === 0) {
    return { ok: false, reason: 'suicide' };
  }
  if (GAME_RULES.koRule === 'simple' && state.previousBoard && boardsEqual(nextBoard, state.previousBoard)) {
    return { ok: false, reason: 'ko' };
  }

  const move = { x, y, player, pass: false, captured, capturedStones, playedAt: now } as const;
  return {
    ok: true,
    move,
    state: {
      ...state,
      board: nextBoard,
      previousBoard: cloneBoard(state.board),
      currentPlayer: enemy,
      captures: { ...state.captures, [player]: state.captures[player] + captured },
      consecutivePasses: 0,
      moves: [...state.moves, move],
      updatedAt: now,
    },
  };
}

export function passTurn(state: GameState, player = state.currentPlayer, now = Date.now()): PlayResult {
  if (state.status !== 'active') return { ok: false, reason: 'game-over' };
  if (player !== state.currentPlayer) return { ok: false, reason: 'wrong-turn' };
  const move = { x: -1, y: -1, player, pass: true, captured: 0, playedAt: now } as const;
  const consecutivePasses = state.consecutivePasses + 1;
  const nextState: GameState = {
    ...state,
    previousBoard: cloneBoard(state.board),
    currentPlayer: opponent(player),
    consecutivePasses,
    moves: [...state.moves, move],
    updatedAt: now,
  };
  if (consecutivePasses >= GAME_RULES.consecutivePassesToEnd) {
    nextState.status = 'finished';
    nextState.result = scoreChineseArea(nextState.board);
  }
  return { ok: true, state: nextState, move };
}

export function resignGame(state: GameState, player: Player, now = Date.now()): GameState {
  if (state.status !== 'active') return state;
  return {
    ...state,
    status: 'finished',
    result: { winner: opponent(player), reason: 'resign' },
    updatedAt: now,
  };
}

export function isLegalMove(state: GameState, x: number, y: number, player = state.currentPlayer): boolean {
  return playMove(state, x, y, player, state.updatedAt).ok;
}

export function scoreChineseArea(board: Board): GameResult {
  let blackScore = 0;
  let whiteScore = GAME_RULES.komi;
  const visited = new Set<number>();
  for (let y = 0; y < GAME_RULES.boardSize; y += 1) {
    for (let x = 0; x < GAME_RULES.boardSize; x += 1) {
      const value = board[y]![x];
      if (value === 'black') {
        blackScore += 1;
        continue;
      }
      if (value === 'white') {
        whiteScore += 1;
        continue;
      }
      const key = pointKey(x, y);
      if (visited.has(key)) continue;
      const region = collectEmptyRegion(board, x, y, visited);
      if (region.borders.size === 1) {
        if (region.borders.has('black')) blackScore += region.points.length;
        if (region.borders.has('white')) whiteScore += region.points.length;
      }
    }
  }
  const winner: Player = blackScore > whiteScore ? 'black' : 'white';
  return { winner, reason: 'score', margin: Math.abs(blackScore - whiteScore), blackScore, whiteScore };
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

export function boardsEqual(left: Board, right: Board): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, y) => row.every((value, x) => value === right[y]?.[x]));
}

function isOnBoard(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GAME_RULES.boardSize && y < GAME_RULES.boardSize;
}

function neighbors(x: number, y: number): Point[] {
  const points: Point[] = [];
  if (x > 0) points.push({ x: x - 1, y });
  if (x + 1 < GAME_RULES.boardSize) points.push({ x: x + 1, y });
  if (y > 0) points.push({ x, y: y - 1 });
  if (y + 1 < GAME_RULES.boardSize) points.push({ x, y: y + 1 });
  return points;
}

function pointKey(x: number, y: number): number {
  return y * GAME_RULES.boardSize + x;
}

function collectGroup(board: Board, startX: number, startY: number): { stones: Point[]; liberties: number } {
  const color = board[startY]?.[startX] ?? null;
  if (!color) return { stones: [], liberties: 0 };
  const stones: Point[] = [];
  const stack: Point[] = [{ x: startX, y: startY }];
  const visited = new Set<number>();
  const liberties = new Set<number>();
  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = pointKey(point.x, point.y);
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(point);
    for (const adjacent of neighbors(point.x, point.y)) {
      const value = board[adjacent.y]![adjacent.x];
      if (value === null) liberties.add(pointKey(adjacent.x, adjacent.y));
      else if (value === color && !visited.has(pointKey(adjacent.x, adjacent.y))) stack.push(adjacent);
    }
  }
  return { stones, liberties: liberties.size };
}

function collectEmptyRegion(board: Board, startX: number, startY: number, visited: Set<number>): { points: Point[]; borders: Set<Player> } {
  const points: Point[] = [];
  const borders = new Set<Player>();
  const stack: Point[] = [{ x: startX, y: startY }];
  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = pointKey(point.x, point.y);
    if (visited.has(key)) continue;
    visited.add(key);
    points.push(point);
    for (const adjacent of neighbors(point.x, point.y)) {
      const value = board[adjacent.y]![adjacent.x];
      if (value) borders.add(value);
      else if (!visited.has(pointKey(adjacent.x, adjacent.y))) stack.push(adjacent);
    }
  }
  return { points, borders };
}
