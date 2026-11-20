import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../src/config/difficulty';
import { chooseAiCandidate, type DifficultyContext, type EngineCandidate } from '../src/game/difficulty';
import type { Board } from '../src/game/types';

const samples = Number(process.argv[2] ?? 100000);

const candidates: EngineCandidate[] = [
  { x: 3, y: 3, order: 0, prior: 0.22, winRateLost: 0, relativePointsLost: 0 },
  { x: 15, y: 15, order: 1, prior: 0.18, winRateLost: 0.002, relativePointsLost: 0.08 },
  { x: 3, y: 15, order: 2, prior: 0.14, winRateLost: 0.005, relativePointsLost: 0.18 },
  { x: 15, y: 3, order: 3, prior: 0.10, winRateLost: 0.010, relativePointsLost: 0.35 },
  { x: 9, y: 3, order: 4, prior: 0.08, winRateLost: 0.018, relativePointsLost: 0.55 },
  { x: 3, y: 9, order: 5, prior: 0.06, winRateLost: 0.028, relativePointsLost: 0.80 },
  { x: 15, y: 9, order: 6, prior: 0.045, winRateLost: 0.038, relativePointsLost: 1.10 },
  { x: 9, y: 15, order: 7, prior: 0.035, winRateLost: 0.050, relativePointsLost: 1.40 },
];

const twistBoard: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
twistBoard[9]![8] = 'white';
twistBoard[9]![10] = 'white';
twistBoard[8]![9] = 'black';
twistBoard[10]![10] = 'black';

const twistCandidates: EngineCandidate[] = [
  { x: 3, y: 3, order: 0, prior: 0.22, winRateLost: 0, relativePointsLost: 0 },
  { x: 15, y: 15, order: 1, prior: 0.18, winRateLost: 0.002, relativePointsLost: 0.08 },
  { x: 9, y: 9, order: 2, prior: 0.14, winRateLost: 0.005, relativePointsLost: 0.18 },
  { x: 8, y: 8, order: 3, prior: 0.10, winRateLost: 0.010, relativePointsLost: 0.35 },
  { x: 10, y: 8, order: 4, prior: 0.08, winRateLost: 0.018, relativePointsLost: 0.55 },
  { x: 8, y: 10, order: 5, prior: 0.06, winRateLost: 0.028, relativePointsLost: 0.80 },
  { x: 15, y: 9, order: 6, prior: 0.045, winRateLost: 0.038, relativePointsLost: 1.10 },
  { x: 9, y: 15, order: 7, prior: 0.035, winRateLost: 0.050, relativePointsLost: 1.40 },
];

function candidatesForLevel(level: DifficultyLevel): { candidates: EngineCandidate[]; context?: DifficultyContext } {
  if (level !== 2) return { candidates };
  return {
    candidates: twistCandidates,
    context: {
      board: twistBoard,
      currentPlayer: 'black',
      moveNumber: 60,
      lastMove: { x: 9, y: 10, player: 'white', pass: false, captured: 0, playedAt: 1 },
    },
  };
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function percent(value: number): string {
  return `${(Math.max(0, value) * 100).toFixed(1)}%`;
}

console.log(`samples=${samples}`);
console.log('| 等级 | 名称 | top1 | top2 | top3+ | 平均目差损失 | 合理池 |');
console.log('| ---: | --- | ---: | ---: | ---: | ---: | ---: |');

for (let level = 1 as DifficultyLevel; level <= 5; level = (level + 1) as DifficultyLevel) {
  const random = createRandom(20260729 + level);
  const sample = candidatesForLevel(level);
  const counts = new Map<number, number>();
  let scoreLossTotal = 0;

  for (let index = 0; index < samples; index += 1) {
    const selected = chooseAiCandidate(sample.candidates, level, () => true, random, sample.context);
    if (!selected) throw new Error(`level ${level} selected no candidate`);
    counts.set(selected.order, (counts.get(selected.order) ?? 0) + 1);
    scoreLossTotal += selected.relativePointsLost ?? selected.pointsLost ?? 0;
  }

  const config = DIFFICULTY_LEVELS[level];
  const reasonablePool = sample.candidates
    .slice(0, config.topK)
    .filter((candidate, index) => (
      index === 0
      || ((candidate.relativePointsLost ?? candidate.pointsLost ?? 0) <= Math.min(config.maxScoreLoss, config.obviousBlunderScoreLoss)
        && Math.max(0, candidate.winRateLost ?? 0) <= config.maxWinRateLoss
        && Math.max(0, candidate.prior ?? 0) >= config.minimumPolicy)
    ))
    .slice(0, config.candidatePool).length;

  const top1 = (counts.get(0) ?? 0) / samples;
  const top2 = (counts.get(1) ?? 0) / samples;
  const top3Plus = 1 - top1 - top2;
  console.log(`| ${level} | ${config.name} | ${percent(top1)} | ${percent(top2)} | ${percent(top3Plus)} | ${(scoreLossTotal / samples).toFixed(3)} | ${reasonablePool} |`);
}
