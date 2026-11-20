import { describe, expect, it } from 'vitest';
import { captureRewardFor, chompImageFor, rewardImageFor } from '../src/ui/reward';

describe('吃子奖励', () => {
  it('孩子提子时显示当前皮肤奖励', () => {
    expect(captureRewardFor(0, 'frog')).toBeNull();
    expect(captureRewardFor(1, 'frog')).toBe('frog');
    expect(captureRewardFor(5, 'dinosaur')).toBe('dinosaur');
  });

  it('皮肤奖励图路径固定', () => {
    expect(rewardImageFor('frog')).toBe('/images/treefrog-reward.png');
    expect(rewardImageFor('dinosaur')).toBe('/images/trex-reward.png');
    expect(chompImageFor('frog')).toBe('/images/frog-chomp.png');
    expect(chompImageFor('dinosaur')).toBe('/images/dinosaur-chomp.png');
  });
});
