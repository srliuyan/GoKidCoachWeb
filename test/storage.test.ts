import { describe, expect, it } from 'vitest';
import { createGame, playMove, resignGame } from '../src/game/rules';
import { parseStoredGame } from '../src/game/storage';

describe('版本化棋局恢复', () => {
  it('恢复有效棋局', () => {
    const game = createGame('white', undefined, 123);
    expect(parseStoredGame(JSON.stringify(game))).toEqual(game);
  });

  it('损坏或未知版本存档安全回退', () => {
    expect(parseStoredGame('{broken')).toBeNull();
    expect(parseStoredGame(JSON.stringify({ ...createGame(), version: 99 }))).toBeNull();
  });

  it('拒绝尺寸错误的棋盘', () => {
    const game = createGame();
    expect(parseStoredGame(JSON.stringify({ ...game, board: [[null]] }))).toBeNull();
  });

  it('旧高等级存档夹到当前最高级', () => {
    const game = createGame();
    const restored = parseStoredGame(JSON.stringify({
      ...game,
      difficulty: { mode: 'manual', manualLevel: 8 },
    }));
    expect(restored?.difficulty.manualLevel).toBe(5);
  });

  it('兼容缺失 previousBoard 并修正非法难度模式', () => {
    const game = createGame();
    const raw = { ...game, previousBoard: undefined, difficulty: { mode: 'broken', manualLevel: 2 } };
    const restored = parseStoredGame(JSON.stringify(raw));
    expect(restored?.previousBoard).toBeNull();
    expect(restored?.difficulty).toEqual({ mode: 'manual', manualLevel: 2 });
  });

  it('拒绝损坏的提子数和落子记录', () => {
    const game = createGame();
    expect(parseStoredGame(JSON.stringify({
      ...game,
      captures: { black: Number.NaN, white: 0 },
    }))).toBeNull();
    expect(parseStoredGame(JSON.stringify({
      ...game,
      moves: [{ x: 99, y: 99, player: 'black', pass: false, captured: 0, playedAt: 1 }],
    }))).toBeNull();
  });

  it('拒绝棋盘、提子和对局状态不一致的存档', () => {
    const first = playMove(createGame('black', undefined, 100), 3, 3, 'black', 101);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const game = first.state;
    const tamperedBoard = game.board.map((row) => [...row]);
    tamperedBoard[4]![4] = 'white';

    expect(parseStoredGame(JSON.stringify({ ...game, board: tamperedBoard }))).toBeNull();
    expect(parseStoredGame(JSON.stringify({ ...game, captures: { black: 1, white: 0 } }))).toBeNull();
    expect(parseStoredGame(JSON.stringify({ ...game, status: 'finished', result: null }))).toBeNull();
    expect(parseStoredGame(JSON.stringify({ ...game, status: 'active', result: { winner: 'black', reason: 'resign' } }))).toBeNull();
  });

  it('恢复认输结束的有效存档', () => {
    const first = playMove(createGame('black', undefined, 100), 3, 3, 'black', 101);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const resigned = resignGame(first.state, 'black', 102);
    expect(parseStoredGame(JSON.stringify(resigned))).toEqual(resigned);
  });

  it('拒绝非有限手动难度', () => {
    const game = createGame();
    expect(parseStoredGame(JSON.stringify({
      ...game,
      difficulty: { mode: 'manual', manualLevel: 'bad' },
    }))).toBeNull();
  });
});
