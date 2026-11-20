import type { DifficultyLevel } from '../config/difficulty';

export type Player = 'black' | 'white';
export type Intersection = Player | null;
export type Board = Intersection[][];
export type DifficultyMode = 'adaptive' | 'manual';
export type GameStatus = 'active' | 'finished';

export interface PlayedMove {
  x: number;
  y: number;
  player: Player;
  pass: boolean;
  captured: number;
  capturedStones?: { x: number; y: number }[];
  playedAt: number;
}

export interface GameResult {
  winner: Player;
  reason: 'score' | 'resign';
  margin?: number;
  blackScore?: number;
  whiteScore?: number;
}

export interface DifficultySettings {
  mode: DifficultyMode;
  manualLevel: DifficultyLevel;
}

export interface GameState {
  version: 1;
  id: string;
  board: Board;
  previousBoard: Board | null;
  currentPlayer: Player;
  childColor: Player;
  captures: Record<Player, number>;
  consecutivePasses: number;
  moves: PlayedMove[];
  status: GameStatus;
  result: GameResult | null;
  difficulty: DifficultySettings;
  createdAt: number;
  updatedAt: number;
}

export type MoveFailure = 'occupied' | 'suicide' | 'ko' | 'out-of-bounds' | 'game-over' | 'wrong-turn';

export type PlayResult =
  | { ok: true; state: GameState; move: PlayedMove }
  | { ok: false; reason: MoveFailure };

export function opponent(player: Player): Player {
  return player === 'black' ? 'white' : 'black';
}
