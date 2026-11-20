export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface DifficultyConfig {
  level: DifficultyLevel;
  name: string;
  description: string;
  beginnerStyle: 'normal' | 'gentle' | 'twist';
  visits: number;
  maxTimeMs: number;
  maxChildren: number;
  topK: number;
  candidatePool: number;
  bestMoveProbability: number;
  bestMoveWeightMultiplier: number;
  strongMoveProbability: number;
  randomTemperature: number;
  maxWinRateLoss: number;
  maxScoreLoss: number;
  minimumPolicy: number;
  obviousBlunderScoreLoss: number;
  personalityMoveProbability: number;
  exploratoryMoveProbability: number;
  exploratoryMinOrder: number;
}

export const DIFFICULTY_LEVELS: Readonly<Record<DifficultyLevel, DifficultyConfig>> = Object.freeze({
  1: { level: 1, name: '刚入门·吃子陪练', description: '更稳一些，练连接和吃子', beginnerStyle: 'gentle', visits: 20, maxTimeMs: 204, maxChildren: 64, topK: 32, candidatePool: 18, bestMoveProbability: 0.30, bestMoveWeightMultiplier: 0.22, strongMoveProbability: 0.070, randomTemperature: 7.80, maxWinRateLoss: 0.142, maxScoreLoss: 5.5, minimumPolicy: 0.000112, obviousBlunderScoreLoss: 5.5, personalityMoveProbability: 0.44, exploratoryMoveProbability: 0.46, exploratoryMinOrder: 5 },
  2: { level: 2, name: '强扭断局', description: '贴身切断，主动搏杀', beginnerStyle: 'twist', visits: 24, maxTimeMs: 230, maxChildren: 64, topK: 50, candidatePool: 42, bestMoveProbability: 0.36, bestMoveWeightMultiplier: 0.006, strongMoveProbability: 0.42, randomTemperature: 14.00, maxWinRateLoss: 0.220, maxScoreLoss: 9.0, minimumPolicy: 0.00006, obviousBlunderScoreLoss: 9.0, personalityMoveProbability: 1.00, exploratoryMoveProbability: 0.90, exploratoryMinOrder: 2 },
  3: { level: 3, name: '陪练', description: '常下好棋，也留机会', beginnerStyle: 'normal', visits: 24, maxTimeMs: 340, maxChildren: 36, topK: 9, candidatePool: 7, bestMoveProbability: 0.52, bestMoveWeightMultiplier: 0.55, strongMoveProbability: 0.10, randomTemperature: 2.20, maxWinRateLoss: 0.110, maxScoreLoss: 3.2, minimumPolicy: 0.006, obviousBlunderScoreLoss: 3.2, personalityMoveProbability: 0.00, exploratoryMoveProbability: 0.00, exploratoryMinOrder: 0 },
  4: { level: 4, name: '进阶', description: '多数接近最佳着', beginnerStyle: 'normal', visits: 36, maxTimeMs: 480, maxChildren: 48, topK: 7, candidatePool: 4, bestMoveProbability: 0.72, bestMoveWeightMultiplier: 0.85, strongMoveProbability: 0.45, randomTemperature: 0.95, maxWinRateLoss: 0.065, maxScoreLoss: 1.9, minimumPolicy: 0.012, obviousBlunderScoreLoss: 2.3, personalityMoveProbability: 0.00, exploratoryMoveProbability: 0.00, exploratoryMinOrder: 0 },
  5: { level: 5, name: '最强稳定', description: '基本选择最佳着', beginnerStyle: 'normal', visits: 52, maxTimeMs: 580, maxChildren: 64, topK: 5, candidatePool: 2, bestMoveProbability: 0.90, bestMoveWeightMultiplier: 1.00, strongMoveProbability: 0.85, randomTemperature: 0.45, maxWinRateLoss: 0.025, maxScoreLoss: 0.8, minimumPolicy: 0.022, obviousBlunderScoreLoss: 1.1, personalityMoveProbability: 0.00, exploratoryMoveProbability: 0.00, exploratoryMinOrder: 0 },
});

export const DEFAULT_DIFFICULTY_LEVEL: DifficultyLevel = 3;

export function clampDifficultyLevel(value: number): DifficultyLevel {
  return Math.max(1, Math.min(5, Math.round(value))) as DifficultyLevel;
}
