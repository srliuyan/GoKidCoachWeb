import type { ThemeId } from '../config/theme';
import { THEMES } from '../config/theme';

export type CaptureRewardKind = ThemeId;

export function captureRewardFor(captured: number, theme: ThemeId): CaptureRewardKind | null {
  if (captured > 0) return theme;
  return null;
}

export function rewardImageFor(kind: CaptureRewardKind): string {
  return THEMES[kind].rewardImage;
}

export function chompImageFor(kind: CaptureRewardKind): string {
  return THEMES[kind].chompImage;
}
