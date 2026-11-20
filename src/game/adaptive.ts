import { clampDifficultyLevel, DEFAULT_DIFFICULTY_LEVEL, type DifficultyLevel } from '../config/difficulty';
import type { Player } from './types';

export interface MoveQuality {
  winRateLoss: number;
  scoreLoss: number;
  moveNumber: number;
  quality: number;
}

export interface AdaptiveProfile {
  version: 1;
  estimatedLevel: number;
  recentMoves: MoveQuality[];
  recentGames: Array<{ gameId: string; childWon: boolean; endedAt: number }>;
  updatedAt: number;
}

export function createAdaptiveProfile(now = Date.now()): AdaptiveProfile {
  return { version: 1, estimatedLevel: DEFAULT_DIFFICULTY_LEVEL, recentMoves: [], recentGames: [], updatedAt: now };
}

export function qualityFromLoss(winRateLoss: number, scoreLoss: number): number {
  const winComponent = Math.min(1, Math.max(0, winRateLoss) / 0.12);
  const scoreComponent = Math.min(1, Math.max(0, scoreLoss) / 4);
  return clamp01(1 - (winComponent * 0.58 + scoreComponent * 0.42));
}

export function recordMoveQuality(
  profile: AdaptiveProfile,
  input: { winRateLoss: number; scoreLoss: number; moveNumber: number },
  now = Date.now(),
): AdaptiveProfile {
  const quality = qualityFromLoss(input.winRateLoss, input.scoreLoss);
  const phaseWeight = input.moveNumber < 40 ? 0.75 : input.moveNumber > 190 ? 0.8 : 1;
  const centered = quality - 0.58;
  const rawStep = centered * 0.24 * phaseWeight;
  const step = Math.round(Math.max(-0.099, Math.min(0.099, rawStep)) * 1000) / 1000;
  return {
    ...profile,
    estimatedLevel: Math.round(clampFloat(profile.estimatedLevel + step, 1, 5) * 1000) / 1000,
    recentMoves: [...profile.recentMoves, { ...input, quality }].slice(-12),
    updatedAt: now,
  };
}

export function recordGameResult(profile: AdaptiveProfile, winner: Player, childColor: Player, gameId: string, now = Date.now()): AdaptiveProfile {
  if (profile.recentGames.some((game) => game.gameId === gameId)) return profile;
  const recentGames = [...profile.recentGames, { gameId, childWon: winner === childColor, endedAt: now }].slice(-8);
  const aiWinRate = recentGames.filter((game) => !game.childWon).length / recentGames.length;
  const adjustment = aiWinRate < 0.52 ? 0.24 : aiWinRate > 0.58 ? -0.24 : 0;
  return {
    ...profile,
    estimatedLevel: clampFloat(profile.estimatedLevel + adjustment, 1, 5),
    recentGames,
    updatedAt: now,
  };
}

export function adaptiveLevel(profile: AdaptiveProfile): DifficultyLevel {
  if (profile.recentMoves.length < 3 && profile.recentGames.length === 0) return DEFAULT_DIFFICULTY_LEVEL;
  const window = profile.recentMoves.slice(-10);
  const meanQuality = window.length > 0 ? window.reduce((sum, move) => sum + move.quality, 0) / window.length : 0.58;
  const nudge = meanQuality > 0.78 ? 0.25 : meanQuality < 0.38 ? -0.25 : 0;
  return clampDifficultyLevel(profile.estimatedLevel + nudge);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampFloat(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
