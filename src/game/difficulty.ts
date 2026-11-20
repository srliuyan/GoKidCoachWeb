import { DIFFICULTY_LEVELS, type DifficultyConfig, type DifficultyLevel } from '../config/difficulty';
import type { Board, PlayedMove, Player } from './types';
import { opponent } from './types';

export interface EngineCandidate {
  x: number;
  y: number;
  order: number;
  prior?: number;
  winRateLost?: number;
  pointsLost?: number;
  relativePointsLost?: number;
  policyOnly?: boolean;
  personalityOnly?: boolean;
  policyRank?: number;
}

export interface DifficultyContext {
  board: Board;
  currentPlayer: Player;
  moveNumber?: number;
  lastMove?: PlayedMove | null;
  recentMoves?: readonly PlayedMove[];
}

export interface CandidateDifficultyExplanation {
  shapeWeight: number;
  reasons: string[];
  ownNeighbors: number;
  opponentNeighbors: number;
  lastMoveDistance: number | null;
  safety: {
    weight: number;
    captured: number;
    liberties: number;
  } | null;
}

export function chooseAiCandidate<T extends EngineCandidate>(
  candidates: readonly T[],
  level: DifficultyLevel,
  isLegal: (candidate: T) => boolean,
  random = Math.random,
  context?: DifficultyContext,
): T | null {
  const config = DIFFICULTY_LEVELS[level];
  const legal = candidates
    .filter(isLegal)
    .sort((left, right) => left.order - right.order)
    .slice(0, config.topK);
  if (legal.length === 0) return null;

  const reasonable = legal.filter((candidate, index) => {
    if (index === 0) return true;
    const scoreLoss = normalizedScoreLoss(candidate);
    const winLoss = Math.max(0, candidate.winRateLost ?? 0);
    const policy = Math.max(0, candidate.prior ?? 0);
    return scoreLoss <= Math.min(config.maxScoreLoss, config.obviousBlunderScoreLoss)
      && winLoss <= config.maxWinRateLoss
      && policy >= config.minimumPolicy;
  }).slice(0, config.candidatePool);
  const pool = config.beginnerStyle === 'twist' && context
    ? reasonable.filter((candidate) => isTwistCombatCandidate(candidate, context))
    : reasonable;
  const strongCombatPool = config.beginnerStyle === 'twist' && context
    ? pool.filter((candidate) => isStrongTwistCombatCandidate(candidate, context))
    : [];
  const active = strongCombatPool.length > 0 ? strongCombatPool : pool.length > 0 ? pool : reasonable.slice(0, 1);

  const best = active[0]!;
  if (active.length === 1 || random() <= config.bestMoveProbability) return best;
  if (active.length >= 2 && random() <= config.strongMoveProbability) {
    return weightedChoice(active.slice(0, 2), config, random, level, context);
  }
  const personality = config.beginnerStyle !== 'normal' && config.personalityMoveProbability > 0 && context
    ? active.filter((candidate) => isBeginnerPersonalityCandidate(candidate, context, config.beginnerStyle))
    : [];
  if (personality.length >= 1 && random() <= config.personalityMoveProbability) {
    return weightedChoice(personality, config, random, level, context);
  }
  const exploratory = active.filter((candidate) => candidate.order >= config.exploratoryMinOrder);
  if (exploratory.length >= 2 && random() <= config.exploratoryMoveProbability) {
    return weightedChoice(exploratory, config, random, level, context);
  }
  return weightedChoice(active, config, random, level, context);
}

export function chooseHintCandidate<T extends EngineCandidate>(
  candidates: readonly T[],
  isLegal: (candidate: T) => boolean,
): T | null {
  return [...candidates]
    .sort((left, right) => left.order - right.order)
    .find(isLegal) ?? null;
}

export function expandBeginnerPolicyCandidates<T extends EngineCandidate>(
  candidates: readonly T[],
  level: DifficultyLevel,
  isLegal: (candidate: EngineCandidate) => boolean,
  policy?: ArrayLike<number>,
  context?: DifficultyContext,
  boardSize = 19,
): EngineCandidate[] {
  const sorted = [...candidates].sort((left, right) => left.order - right.order);
  if (DIFFICULTY_LEVELS[level].beginnerStyle === 'normal' || DIFFICULTY_LEVELS[level].personalityMoveProbability <= 0 || !policy) return sorted;

  const config = DIFFICULTY_LEVELS[level];
  const seen = new Set(sorted.map((candidate) => `${candidate.x},${candidate.y}`));
  const rankedPolicy = Array.from({ length: boardSize * boardSize }, (_, index) => ({
    index,
    rank: 0,
    prior: Math.max(0, policy[index] ?? 0),
  }))
    .filter((entry) => entry.prior >= config.minimumPolicy)
    .sort((left, right) => right.prior - left.prior)
    .map((entry, rank) => ({ ...entry, rank }));

  const expanded: EngineCandidate[] = [...sorted];
  const addCandidate = (entry: (typeof rankedPolicy)[number], order: number, personalityOnly = false): void => {
    const { index, prior, rank } = entry;
    const x = index % boardSize;
    const y = Math.floor(index / boardSize);
    const key = `${x},${y}`;
    if (seen.has(key)) return;
    const candidate: EngineCandidate = { x, y, order, prior, policyOnly: true, personalityOnly, policyRank: rank };
    if (!isLegal(candidate)) return;
    if (config.beginnerStyle === 'twist' && context && !isTwistCombatCandidate(candidate, context)) return;
    seen.add(key);
    expanded.push(candidate);
  };

  if (context) {
    const personality = rankedPolicy
      .map((entry) => {
        const candidate = policyEntryToCandidate(entry, boardSize);
        if (!isLegal(candidate)) return null;
        const explanation = analyzeBeginnerShape(candidate, context, config.beginnerStyle);
        if (!isSafeBeginnerShape(explanation)) return null;
        if (config.beginnerStyle === 'twist' ? !isTwistCombatExplanation(explanation) : !hasBeginnerPersonalityReason(explanation)) return null;
        const cutBonus = config.beginnerStyle === 'twist' && explanation.reasons.includes('cuts-opponent-shape') ? 4.0 : 0;
        const haneBonus = config.beginnerStyle === 'twist' && hasHaneContact(explanation) ? 2.4 : 0;
        const captureBonus = config.beginnerStyle === 'twist' && (explanation.safety?.captured ?? 0) > 0 ? 3.8 : 0;
        const contactBonus = config.beginnerStyle === 'twist' && explanation.opponentNeighbors > 0 ? 1.2 : 0;
        const gentleBonus = config.beginnerStyle === 'gentle' && explanation.ownNeighbors > 0 ? 1.2 : 0;
        const gentleCaptureBonus = config.beginnerStyle === 'gentle' && (explanation.safety?.captured ?? 0) > 0 ? 2.0 : 0;
        const localBonus = explanation.lastMoveDistance !== null ? Math.max(0, 3 - explanation.lastMoveDistance) * 0.9 : 0;
        return { entry, score: explanation.shapeWeight + cutBonus + haneBonus + captureBonus + contactBonus + gentleBonus + gentleCaptureBonus + localBonus };
      })
      .filter((entry): entry is { entry: (typeof rankedPolicy)[number]; score: number } => entry !== null)
      .sort((left, right) => right.score - left.score || left.entry.rank - right.entry.rank)
      .slice(0, Math.max(10, Math.floor(config.topK * 0.55)));

    for (let index = 0; index < personality.length; index += 1) {
      addCandidate(personality[index]!.entry, config.exploratoryMinOrder + index, true);
    }
  }

  for (let rank = 0; rank < rankedPolicy.length && expanded.length < config.topK; rank += 1) {
    addCandidate(rankedPolicy[rank]!, rank);
  }
  return expanded.sort((left, right) => left.order - right.order);
}

function policyEntryToCandidate(
  entry: { index: number; rank: number; prior: number },
  boardSize: number,
): EngineCandidate {
  return {
    x: entry.index % boardSize,
    y: Math.floor(entry.index / boardSize),
    order: entry.rank,
    prior: entry.prior,
    policyOnly: true,
    policyRank: entry.rank,
  };
}

function weightedChoice<T extends EngineCandidate>(
  candidates: readonly T[],
  config: DifficultyConfig,
  random: () => number,
  level: DifficultyLevel,
  context?: DifficultyContext,
): T {
  const weights = candidates.map((candidate) => {
    const scorePenalty = Math.exp(-normalizedScoreLoss(candidate) / Math.max(0.1, config.randomTemperature));
    const policyWeight = Math.sqrt(Math.max(candidate.prior ?? config.minimumPolicy, config.minimumPolicy));
    const bestMoveWeight = candidate.order === 0 ? config.bestMoveWeightMultiplier : 1;
    const shapeWeight = DIFFICULTY_LEVELS[level].beginnerStyle !== 'normal' && context
      ? analyzeBeginnerShape(candidate, context, DIFFICULTY_LEVELS[level].beginnerStyle).shapeWeight
      : 1;
    return Math.max(0.0001, scorePenalty * policyWeight * bestMoveWeight * shapeWeight);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    target -= weights[index]!;
    if (target <= 0) return candidates[index]!;
  }
  return candidates[candidates.length - 1]!;
}

function normalizedScoreLoss(candidate: EngineCandidate): number {
  return Math.max(0, candidate.relativePointsLost ?? candidate.pointsLost ?? 0);
}

function isBeginnerPersonalityCandidate(
  candidate: EngineCandidate,
  context: DifficultyContext,
  style: DifficultyConfig['beginnerStyle'],
): boolean {
  if (candidate.order < 2 && !candidate.personalityOnly) return false;
  const explanation = analyzeBeginnerShape(candidate, context, style);
  if (!isSafeBeginnerShape(explanation)) return false;
  if (style === 'twist') return isTwistCombatExplanation(explanation);
  return hasBeginnerPersonalityReason(explanation);
}

function isSafeBeginnerShape(explanation: CandidateDifficultyExplanation): boolean {
  return !((explanation.safety?.liberties ?? 0) <= 1 && (explanation.safety?.captured ?? 0) === 0);
}

function hasBeginnerPersonalityReason(explanation: CandidateDifficultyExplanation): boolean {
  return explanation.reasons.some((reason) =>
    reason === 'cuts-opponent-shape'
    || reason === 'contacts-opponent'
    || reason === 'contact-between-groups'
    || reason === 'horizontal-hane-contact'
    || reason === 'vertical-hane-contact'
    || reason === 'connects-own-stones'
    || reason === 'simple-capture'
    || reason === 'near-child-last-move',
  );
}

function isTwistCombatCandidate(candidate: EngineCandidate, context: DifficultyContext): boolean {
  const explanation = analyzeTwistCutShape(candidate, context);
  return isSafeBeginnerShape(explanation) && isTwistCombatExplanation(explanation);
}

function isStrongTwistCombatCandidate(candidate: EngineCandidate, context: DifficultyContext): boolean {
  const explanation = analyzeTwistCutShape(candidate, context);
  if (!isSafeBeginnerShape(explanation) || !isTwistCombatExplanation(explanation)) return false;
  return explanation.reasons.includes('cuts-opponent-shape')
    || explanation.reasons.includes('contact-between-groups')
    || hasHaneContact(explanation)
    || (explanation.safety?.captured ?? 0) > 0
    || explanation.opponentNeighbors >= 2;
}

function isTwistCombatExplanation(explanation: CandidateDifficultyExplanation): boolean {
  return (explanation.safety?.captured ?? 0) > 0
    || explanation.reasons.some((reason) =>
      reason === 'cuts-opponent-shape'
      || reason === 'contacts-opponent'
      || reason === 'contact-between-groups'
      || reason === 'horizontal-hane-contact'
      || reason === 'vertical-hane-contact'
      || reason === 'captures-stones',
    );
}

function hasHaneContact(explanation: CandidateDifficultyExplanation): boolean {
  return explanation.reasons.includes('horizontal-hane-contact')
    || explanation.reasons.includes('vertical-hane-contact');
}

export function explainAiCandidate(candidate: EngineCandidate, level: DifficultyLevel, context?: DifficultyContext): CandidateDifficultyExplanation | null {
  const config = DIFFICULTY_LEVELS[level];
  if (config.beginnerStyle === 'normal' || config.personalityMoveProbability <= 0 || !context) return null;
  return analyzeBeginnerShape(candidate, context, config.beginnerStyle);
}

function analyzeBeginnerShape(
  candidate: EngineCandidate,
  context: DifficultyContext,
  style: DifficultyConfig['beginnerStyle'],
): CandidateDifficultyExplanation {
  if (style === 'gentle') return analyzeGentleBeginnerShape(candidate, context);
  return analyzeTwistCutShape(candidate, context);
}

function analyzeGentleBeginnerShape(candidate: EngineCandidate, context: DifficultyContext): CandidateDifficultyExplanation {
  if (candidate.x < 0 || candidate.y < 0) {
    return {
      shapeWeight: 0.82,
      reasons: ['pass-deprioritized'],
      ownNeighbors: 0,
      opponentNeighbors: 0,
      lastMoveDistance: null,
      safety: null,
    };
  }

  const boardSize = context.board.length;
  const x = candidate.x;
  const y = candidate.y;
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
    return {
      shapeWeight: 1,
      reasons: ['off-board-candidate'],
      ownNeighbors: 0,
      opponentNeighbors: 0,
      lastMoveDistance: null,
      safety: null,
    };
  }

  const player = context.currentPlayer;
  const other = opponent(player);
  const left = stoneAt(context.board, x - 1, y);
  const right = stoneAt(context.board, x + 1, y);
  const up = stoneAt(context.board, x, y - 1);
  const down = stoneAt(context.board, x, y + 1);
  const orthogonal = [left, right, up, down];
  const ownNeighbors = orthogonal.filter((stone) => stone === player).length;
  const opponentNeighbors = orthogonal.filter((stone) => stone === other).length;
  const cutsOpponent = (left === other && right === other) || (up === other && down === other);
  const lastChildMove = context.lastMove?.player === other && !context.lastMove.pass ? context.lastMove : null;
  const lastMoveDistance = lastChildMove ? Math.max(Math.abs(x - lastChildMove.x), Math.abs(y - lastChildMove.y)) : null;
  const safety = safetyWeight(candidate, context, ownNeighbors, opponentNeighbors);

  let weight = 1;
  const reasons: string[] = [];
  if (ownNeighbors > 0) {
    weight += 0.72 + ownNeighbors * 0.18;
    reasons.push('connects-own-stones');
  }
  if (safety.captured > 0) {
    weight += 1.05 + Math.min(0.55, safety.captured * 0.12);
    reasons.push('simple-capture');
  }
  if (lastMoveDistance !== null && lastMoveDistance <= 3) {
    weight += 0.48;
    reasons.push('near-child-last-move');
  }
  if (opponentNeighbors > 0) {
    weight *= ownNeighbors > 0 || safety.captured > 0 ? 0.94 : 0.74;
    reasons.push('avoids-complex-contact');
  }
  if (cutsOpponent) {
    weight *= 0.58;
    reasons.push('avoids-early-cut');
  }
  if (ownNeighbors === 0 && opponentNeighbors === 0) {
    weight *= 0.86;
    reasons.push('open-area');
  }
  weight *= safety.weight;
  reasons.push(...safety.reasons);

  const shapeWeight = Math.max(0.55, Math.min(2.35, weight));
  if (shapeWeight !== weight) reasons.push('weight-clamped');
  if (reasons.length === 0) reasons.push('neutral');
  return {
    shapeWeight,
    reasons,
    ownNeighbors,
    opponentNeighbors,
    lastMoveDistance,
    safety: {
      weight: safety.weight,
      captured: safety.captured,
      liberties: safety.liberties,
    },
  };
}

function analyzeTwistCutShape(candidate: EngineCandidate, context: DifficultyContext): CandidateDifficultyExplanation {
  if (candidate.x < 0 || candidate.y < 0) {
    return {
      shapeWeight: 0.7,
      reasons: ['pass-deprioritized'],
      ownNeighbors: 0,
      opponentNeighbors: 0,
      lastMoveDistance: null,
      safety: null,
    };
  }

  const boardSize = context.board.length;
  const x = candidate.x;
  const y = candidate.y;
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) {
    return {
      shapeWeight: 1,
      reasons: ['off-board-candidate'],
      ownNeighbors: 0,
      opponentNeighbors: 0,
      lastMoveDistance: null,
      safety: null,
    };
  }

  const player = context.currentPlayer;
  const other = opponent(player);
  const left = stoneAt(context.board, x - 1, y);
  const right = stoneAt(context.board, x + 1, y);
  const up = stoneAt(context.board, x, y - 1);
  const down = stoneAt(context.board, x, y + 1);
  const orthogonal = [left, right, up, down];
  const ownNeighbors = orthogonal.filter((stone) => stone === player).length;
  const opponentNeighbors = orthogonal.filter((stone) => stone === other).length;

  let weight = 1;
  const reasons: string[] = [];
  const moveNumber = context.moveNumber ?? 80;
  const opening = moveNumber < 20;
  const endgame = moveNumber >= 180;
  const contactScale = opening ? 0.95 : endgame ? 0.66 : 1.05;
  const lastChildMove = context.lastMove?.player === other && !context.lastMove.pass ? context.lastMove : null;
  const lastMoveDistance = lastChildMove ? Math.max(Math.abs(x - lastChildMove.x), Math.abs(y - lastChildMove.y)) : null;

  if (opening) reasons.push('opening-muted-contact');
  if (endgame) reasons.push('endgame-muted-contact');
  if (opponentNeighbors > 0) {
    weight += 0.40 * contactScale;
    reasons.push('contacts-opponent');
  }
  if (ownNeighbors > 0 && opponentNeighbors > 0) {
    weight += 0.92 * contactScale;
    reasons.push('contact-between-groups');
  }
  if ((left === other && right === other) || (up === other && down === other)) {
    weight += 1.38 * contactScale;
    reasons.push('cuts-opponent-shape');
  }
  if ((left === player && right === other) || (left === other && right === player)) {
    weight += 0.86 * contactScale;
    reasons.push('horizontal-hane-contact');
  }
  if ((up === player && down === other) || (up === other && down === player)) {
    weight += 0.86 * contactScale;
    reasons.push('vertical-hane-contact');
  }
  if (lastMoveDistance !== null && lastMoveDistance <= 3) {
    weight += opening ? 0.44 : 0.62;
    reasons.push('near-child-last-move');
  }
  if (lastMoveDistance !== null && lastMoveDistance > 6 && opponentNeighbors === 0) {
    weight *= opening ? 0.90 : 0.72;
    reasons.push('far-from-child-last-move');
  }
  if (ownNeighbors === 0 && opponentNeighbors === 0) {
    weight *= opening ? 0.88 : 0.76;
    reasons.push('empty-area');
  }
  if (recentLocalMoveCount(context, x, y, player) >= 2 && opponentNeighbors === 0) {
    weight *= 0.68;
    reasons.push('repeated-local-attachment');
  }
  const safety = safetyWeight(candidate, context, ownNeighbors, opponentNeighbors);
  weight *= safety.weight;
  reasons.push(...safety.reasons);

  const shapeWeight = Math.max(0.65, Math.min(3.20, weight));
  if (shapeWeight !== weight) reasons.push('weight-clamped');
  if (reasons.length === 0) reasons.push('neutral');
  return {
    shapeWeight,
    reasons,
    ownNeighbors,
    opponentNeighbors,
    lastMoveDistance,
    safety: {
      weight: safety.weight,
      captured: safety.captured,
      liberties: safety.liberties,
    },
  };
}

function stoneAt(board: Board, x: number, y: number): Player | null {
  return board[y]?.[x] ?? null;
}

function safetyWeight(
  candidate: EngineCandidate,
  context: DifficultyContext,
  ownNeighbors: number,
  opponentNeighbors: number,
): { weight: number; captured: number; liberties: number; reasons: string[] } {
  const result = playCandidateOnBoard(context.board, candidate.x, candidate.y, context.currentPlayer);
  if (!result) return { weight: 1, captured: 0, liberties: 0, reasons: ['no-safety-preview'] };
  if (result.captured > 0) return { weight: 1.12, captured: result.captured, liberties: result.liberties, reasons: ['captures-stones'] };
  if (ownNeighbors >= 3 && opponentNeighbors === 0) {
    return { weight: 0.55, captured: 0, liberties: result.liberties, reasons: ['fills-own-eye-shape'] };
  }
  if (result.liberties <= 1) return { weight: 0.45, captured: 0, liberties: result.liberties, reasons: ['low-liberty-danger'] };
  if (result.liberties === 2 && opponentNeighbors >= 2) {
    return { weight: 0.72, captured: 0, liberties: result.liberties, reasons: ['thin-contact-danger'] };
  }
  return { weight: 1, captured: 0, liberties: result.liberties, reasons: [] };
}

function playCandidateOnBoard(board: Board, x: number, y: number, player: Player): { captured: number; liberties: number } | null {
  if (board[y]?.[x] !== null) return null;
  const nextBoard = board.map((row) => [...row]);
  nextBoard[y]![x] = player;
  const other = opponent(player);
  let captured = 0;
  for (const adjacent of neighbors(nextBoard, x, y)) {
    if (nextBoard[adjacent.y]![adjacent.x] !== other) continue;
    const group = collectGroup(nextBoard, adjacent.x, adjacent.y);
    if (group.liberties > 0) continue;
    captured += group.stones.length;
    for (const stone of group.stones) nextBoard[stone.y]![stone.x] = null;
  }
  return { captured, liberties: collectGroup(nextBoard, x, y).liberties };
}

function recentLocalMoveCount(context: DifficultyContext, x: number, y: number, player: Player): number {
  return (context.recentMoves ?? [])
    .slice(-6)
    .filter((move) => !move.pass && move.player === player && Math.max(Math.abs(move.x - x), Math.abs(move.y - y)) <= 2)
    .length;
}

function neighbors(board: Board, x: number, y: number): { x: number; y: number }[] {
  const boardSize = board.length;
  const points: { x: number; y: number }[] = [];
  if (x > 0) points.push({ x: x - 1, y });
  if (x + 1 < boardSize) points.push({ x: x + 1, y });
  if (y > 0) points.push({ x, y: y - 1 });
  if (y + 1 < boardSize) points.push({ x, y: y + 1 });
  return points;
}

function collectGroup(board: Board, startX: number, startY: number): { stones: { x: number; y: number }[]; liberties: number } {
  const color = board[startY]?.[startX] ?? null;
  if (!color) return { stones: [], liberties: 0 };
  const stones: { x: number; y: number }[] = [];
  const stack = [{ x: startX, y: startY }];
  const visited = new Set<number>();
  const liberties = new Set<number>();
  const boardSize = board.length;
  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = point.y * boardSize + point.x;
    if (visited.has(key)) continue;
    visited.add(key);
    stones.push(point);
    for (const adjacent of neighbors(board, point.x, point.y)) {
      const value = board[adjacent.y]![adjacent.x];
      const adjacentKey = adjacent.y * boardSize + adjacent.x;
      if (value === null) liberties.add(adjacentKey);
      else if (value === color && !visited.has(adjacentKey)) stack.push(adjacent);
    }
  }
  return { stones, liberties: liberties.size };
}
