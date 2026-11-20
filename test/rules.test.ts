import { describe, expect, it } from 'vitest';
import { createGame, passTurn, playMove, resignGame } from '../src/game/rules';
import type { Board, GameState, Player } from '../src/game/types';

describe('围棋规则状态机', () => {
  it('正常落子并切换行棋方', () => {
    const game = createGame('black', undefined, 100);
    const result = playMove(game, 3, 3, 'black', 101);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.board[3]![3]).toBe('black');
    expect(result.state.currentPlayer).toBe('white');
    expect(result.state.moves).toHaveLength(1);
  });

  it('完成提子并累计执子方提子数', () => {
    let game = withBoard([
      ['.', 'B', '.'],
      ['B', 'W', '.'],
      ['.', 'B', '.'],
    ], 'black');
    const result = playMove(game, 2, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    game = result.state;
    expect(game.board[1]![1]).toBeNull();
    expect(game.captures.black).toBe(1);
    expect(result.move.capturedStones).toEqual([{ x: 1, y: 1 }]);
  });

  it('拒绝自杀棋', () => {
    const game = withBoard([
      ['.', 'W', '.'],
      ['W', '.', 'W'],
      ['.', 'W', '.'],
    ], 'black');
    const result = playMove(game, 1, 1);
    expect(result).toEqual({ ok: false, reason: 'suicide' });
  });

  it('拒绝立即劫回', () => {
    const beforeCapture = withBoard([
      ['.', '.', 'W', '.', '.'],
      ['.', 'W', '.', 'W', '.'],
      ['.', 'B', 'W', 'B', '.'],
      ['.', '.', 'B', '.', '.'],
    ], 'black');
    const capture = playMove(beforeCapture, 2, 1);
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    const recapture = playMove(capture.state, 2, 2, 'white');
    expect(recapture).toEqual({ ok: false, reason: 'ko' });
  });

  it('连续两次停一手后按中国规则结束', () => {
    const first = passTurn(createGame());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = passTurn(first.state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.status).toBe('finished');
    expect(second.state.result).toMatchObject({ winner: 'white', reason: 'score', margin: 7.5 });
  });

  it('认输后立即结束且对手获胜', () => {
    const game = resignGame(createGame('black'), 'black');
    expect(game.status).toBe('finished');
    expect(game.result).toEqual({ winner: 'white', reason: 'resign' });
  });
});

function withBoard(rows: string[][], currentPlayer: Player): GameState {
  const game = createGame();
  const board: Board = game.board.map((row) => [...row]);
  for (let y = 0; y < rows.length; y += 1) {
    for (let x = 0; x < (rows[y]?.length ?? 0); x += 1) {
      const value = rows[y]![x];
      board[y]![x] = value === 'B' ? 'black' : value === 'W' ? 'white' : null;
    }
  }
  return { ...game, board, currentPlayer };
}
