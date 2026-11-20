import { describe, expect, it } from 'vitest';
import { toEngineMoves } from '../src/engine/b10-engine';
import type { PlayedMove } from '../src/game/types';

describe('B10 引擎输入转换', () => {
  it('只传最近 5 个真实落子，不把停一手的 -1 坐标传给底层引擎', () => {
    const moves: PlayedMove[] = [
      move(0, 0, 'black'),
      { x: -1, y: -1, player: 'white', pass: true, captured: 0, playedAt: 2 },
      move(1, 1, 'black'),
      move(2, 2, 'white'),
      move(3, 3, 'black'),
      move(4, 4, 'white'),
      move(5, 5, 'black'),
      move(6, 6, 'white'),
    ];

    expect(toEngineMoves(moves)).toEqual([
      { x: 2, y: 2, player: 'white' },
      { x: 3, y: 3, player: 'black' },
      { x: 4, y: 4, player: 'white' },
      { x: 5, y: 5, player: 'black' },
      { x: 6, y: 6, player: 'white' },
    ]);
  });
});

function move(x: number, y: number, player: 'black' | 'white'): PlayedMove {
  return { x, y, player, pass: false, captured: 0, playedAt: x * 10 + y };
}
