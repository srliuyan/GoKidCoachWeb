import { describe, expect, it } from 'vitest';
import { adaptiveLevel, createAdaptiveProfile, recordGameResult, recordMoveQuality } from '../src/game/adaptive';
import { chooseAiCandidate, chooseHintCandidate, expandBeginnerPolicyCandidates, explainAiCandidate } from '../src/game/difficulty';
import { DIFFICULTY_LEVELS } from '../src/config/difficulty';
import type { Board } from '../src/game/types';

const candidates = [
  { x: 3, y: 3, order: 0, prior: 0.31, winRateLost: 0, relativePointsLost: 0 },
  { x: 15, y: 15, order: 1, prior: 0.22, winRateLost: 0.01, relativePointsLost: 0.25 },
  { x: 3, y: 15, order: 2, prior: 0.14, winRateLost: 0.04, relativePointsLost: 1.2 },
  { x: 9, y: 9, order: 3, prior: 0.001, winRateLost: 0.3, relativePointsLost: 9 },
];

describe('统一难度选择器', () => {
  it('5级预算单调增加且最强级仍受响应上限约束', () => {
    const levels = Object.values(DIFFICULTY_LEVELS);
    expect(levels).toHaveLength(5);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]!.visits).toBeGreaterThanOrEqual(levels[index - 1]!.visits);
      expect(levels[index]!.maxTimeMs).toBeGreaterThan(levels[index - 1]!.maxTimeMs);
      expect(levels[index]!.bestMoveProbability).toBeGreaterThan(levels[index - 1]!.bestMoveProbability);
    }
    expect(DIFFICULTY_LEVELS[5].maxTimeMs).toBeLessThan(700);
  });

  it('高等级稳定选择最佳着', () => {
    const selected = chooseAiCandidate(candidates, 5, () => true, () => 0.5);
    expect(selected).toEqual(candidates[0]);
  });

  it('低等级只在合理候选中波动并过滤明显恶手', () => {
    const sequence = [0.99, 0.99, 0.99];
    const selected = chooseAiCandidate(candidates, 1, () => true, () => sequence.shift() ?? 0.99);
    expect(selected).not.toEqual(candidates[3]);
    expect(candidates.slice(0, 3)).toContain(selected);
  });

  it('1级更偏向连接和简单吃子，降低复杂扭断', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[9]![8] = 'black';
    board[9]![10] = 'white';
    board[8]![9] = 'white';
    board[8]![7] = 'white';

    const gentleCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 9, y: 9, order: 4, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
      { x: 8, y: 8, order: 5, prior: 0.07, winRateLost: 0.05, relativePointsLost: 1.8 },
    ];
    const sequence = [0.99, 0.99, 0.01, 0.2];
    const selected = chooseAiCandidate(gentleCandidates, 1, () => true, () => sequence.shift() ?? 0.5, {
      board,
      currentPlayer: 'black',
      moveNumber: 50,
    });

    expect(selected).toEqual(gentleCandidates[1]);
    const gentle = explainAiCandidate(gentleCandidates[1]!, 1, { board, currentPlayer: 'black', moveNumber: 50 })!;
    const cut = explainAiCandidate(gentleCandidates[2]!, 1, { board, currentPlayer: 'black', moveNumber: 50 })!;
    expect(gentle.reasons).toContain('connects-own-stones');
    expect(cut.reasons).toContain('avoids-early-cut');
    expect(gentle.shapeWeight).toBeGreaterThan(cut.shapeWeight);
  });

  it('2级强扭断局只从近身搏杀候选中选择', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[9]![8] = 'white';
    board[9]![10] = 'white';
    board[8]![9] = 'black';

    const twistCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 16, y: 16, order: 1, prior: 0.16, winRateLost: 0.01, relativePointsLost: 0.2 },
      { x: 9, y: 9, order: 5, prior: 0.08, winRateLost: 0.06, relativePointsLost: 2.2 },
    ];
    const selected = chooseAiCandidate(twistCandidates, 2, () => true, () => 0.99, {
      board,
      currentPlayer: 'black',
      moveNumber: 60,
    });
    expect(selected).toEqual(twistCandidates[2]);
  });

  it('1级在搜索候选过少时使用 B10 policy 补足温和候选', () => {
    const policy = new Float32Array(362).fill(-1);
    for (let rank = 0; rank < 12; rank += 1) {
      policy[rank] = 0.20 - rank * 0.01;
    }
    const expanded = expandBeginnerPolicyCandidates(candidates.slice(0, 1), 1, () => true, policy);
    expect(expanded.length).toBeGreaterThan(6);
    expect(expanded.some((candidate) => candidate.policyOnly && candidate.order >= 6)).toBe(true);

    const sequence = [0.99, 0.99, 0.01, 0.5];
    const selected = chooseAiCandidate(expanded, 1, () => true, () => sequence.shift() ?? 0.5);
    expect(selected?.policyOnly).toBe(true);
    expect(selected?.order).toBeGreaterThanOrEqual(4);
  });

  it('2级强扭断局只用 B10 policy 补足搏杀候选', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[1]![1] = 'white';
    const policy = new Float32Array(362).fill(-1);
    for (let rank = 0; rank < 20; rank += 1) {
      policy[rank] = 0.16 - rank * 0.006;
    }
    const expanded = expandBeginnerPolicyCandidates(candidates.slice(0, 2), 2, () => true, policy, {
      board,
      currentPlayer: 'black',
      moveNumber: 40,
    });
    expect(expanded.some((candidate) => candidate.policyOnly && candidate.x === 1 && candidate.y === 0)).toBe(true);

    const selected = chooseAiCandidate(expanded, 2, () => true, () => 0.99, {
      board,
      currentPlayer: 'black',
      moveNumber: 40,
    });
    expect(selected?.policyOnly).toBe(true);
  });

  it('2级强扭断局在接触战中选择切断点', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[9]![8] = 'white';
    board[9]![10] = 'white';
    board[8]![9] = 'black';

    const contactCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 16, y: 16, order: 3, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
      { x: 9, y: 9, order: 4, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
    ];
    const sequence = [0.99, 0.99, 0.01, 0.6];
    const selected = chooseAiCandidate(contactCandidates, 2, () => true, () => sequence.shift() ?? 0.5, {
      board,
      currentPlayer: 'black',
      moveNumber: 60,
    });
    expect(selected).toEqual(contactCandidates[2]);
    const explanation = explainAiCandidate(contactCandidates[2]!, 2, { board, currentPlayer: 'black', moveNumber: 60 })!;
    expect(explanation.reasons).toContain('cuts-opponent-shape');
    expect(explanation.shapeWeight).toBeGreaterThan(1);
  });

  it('2级强扭断局有切断点可选时优先尖锐切断', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[9]![8] = 'white';
    board[9]![10] = 'white';
    board[8]![9] = 'black';
    board[10]![10] = 'black';

    const contactCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 16, y: 16, order: 1, prior: 0.16, winRateLost: 0.01, relativePointsLost: 0.2 },
      { x: 9, y: 9, order: 2, prior: 0.14, winRateLost: 0.02, relativePointsLost: 0.5 },
      { x: 8, y: 8, order: 3, prior: 0.10, winRateLost: 0.03, relativePointsLost: 0.8 },
      { x: 10, y: 8, order: 4, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.1 },
    ];
    const selected = chooseAiCandidate(contactCandidates, 2, () => true, () => 0.01, {
      board,
      currentPlayer: 'black',
      moveNumber: 60,
    });
    expect(selected).toEqual(contactCandidates[2]);
    const cut = explainAiCandidate(contactCandidates[2]!, 2, { board, currentPlayer: 'black', moveNumber: 60 })!;
    const lightContact = explainAiCandidate(contactCandidates[3]!, 2, { board, currentPlayer: 'black', moveNumber: 60 })!;
    expect(cut.reasons).toContain('cuts-opponent-shape');
    expect(cut.shapeWeight).toBeGreaterThan(lightContact.shapeWeight);
  });

  it('2级强扭断局不会把远离接触的近手回应当作扭断', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[10]![10] = 'white';

    const localCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 16, y: 16, order: 3, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
      { x: 12, y: 12, order: 4, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
    ];
    const selected = chooseAiCandidate(localCandidates, 2, () => true, () => 0.99, {
      board,
      currentPlayer: 'black',
      moveNumber: 64,
      lastMove: { x: 10, y: 10, player: 'white', pass: false, captured: 0, playedAt: 1 },
    });
    expect(selected).toEqual(localCandidates[0]);
    const explanation = explainAiCandidate(localCandidates[2]!, 2, {
      board,
      currentPlayer: 'black',
      moveNumber: 64,
      lastMove: { x: 10, y: 10, player: 'white', pass: false, captured: 0, playedAt: 1 },
    })!;
    expect(explanation.reasons).toContain('near-child-last-move');
    expect(explanation.reasons).not.toContain('contacts-opponent');
  });

  it('2级扭断局会降低无意义填自己眼位的权重', () => {
    const board: Board = Array.from({ length: 19 }, () => Array.from({ length: 19 }, () => null));
    board[5]![4] = 'black';
    board[5]![6] = 'black';
    board[4]![5] = 'black';
    board[6]![5] = 'black';
    board[10]![10] = 'white';

    const safetyCandidates = [
      { x: 3, y: 3, order: 0, prior: 0.2, winRateLost: 0, relativePointsLost: 0 },
      { x: 5, y: 5, order: 3, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
      { x: 10, y: 9, order: 4, prior: 0.08, winRateLost: 0.04, relativePointsLost: 1.6 },
    ];
    const sequence = [0.99, 0.99, 0.01, 0.45];
    const selected = chooseAiCandidate(safetyCandidates, 2, () => true, () => sequence.shift() ?? 0.5, {
      board,
      currentPlayer: 'black',
      moveNumber: 90,
      lastMove: { x: 10, y: 10, player: 'white', pass: false, captured: 0, playedAt: 1 },
    });
    expect(selected).toEqual(safetyCandidates[2]);
    const explanation = explainAiCandidate(safetyCandidates[1]!, 2, {
      board,
      currentPlayer: 'black',
      moveNumber: 90,
      lastMove: { x: 10, y: 10, player: 'white', pass: false, captured: 0, playedAt: 1 },
    })!;
    expect(explanation.reasons).toContain('fills-own-eye-shape');
    expect(explanation.safety?.weight).toBeLessThan(1);
  });

  it('永远不会选择本地规则判定不合法的候选', () => {
    const selected = chooseAiCandidate(candidates, 1, (candidate) => candidate.x !== 3, () => 0);
    expect(selected?.x).not.toBe(3);
  });

  it('提示候选始终选择最强合法着', () => {
    const hintCandidates = Array.from({ length: 14 }, (_, order) => ({
      x: order,
      y: 0,
      order,
      prior: Math.max(0.01, 0.2 - order * 0.01),
    }));
    const selected = chooseHintCandidate(hintCandidates, (candidate) => candidate.order !== 0)!;
    expect(selected.order).toBe(1);
  });
});

describe('自适应难度', () => {
  it('单手只产生平滑的小幅变化', () => {
    const profile = createAdaptiveProfile(1);
    const next = recordMoveQuality(profile, { winRateLoss: 0, scoreLoss: 0, moveNumber: 80 }, 2);
    expect(next.estimatedLevel - profile.estimatedLevel).toBeLessThanOrEqual(0.1);
    expect(next.recentMoves).toHaveLength(1);
  });

  it('只保留最近12手表现', () => {
    let profile = createAdaptiveProfile(1);
    for (let index = 0; index < 20; index += 1) {
      profile = recordMoveQuality(profile, { winRateLoss: 0.02, scoreLoss: 0.5, moveNumber: index + 1 }, index + 2);
    }
    expect(profile.recentMoves).toHaveLength(12);
    expect(adaptiveLevel(profile)).toBeGreaterThanOrEqual(1);
    expect(adaptiveLevel(profile)).toBeLessThanOrEqual(5);
  });

  it('同一盘结果不会重复计入', () => {
    const profile = createAdaptiveProfile(1);
    const once = recordGameResult(profile, 'black', 'black', 'game-1', 2);
    const twice = recordGameResult(once, 'black', 'black', 'game-1', 3);
    expect(twice.recentGames).toHaveLength(1);
    expect(twice.estimatedLevel).toBe(once.estimatedLevel);
  });
});
