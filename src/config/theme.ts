export type ThemeId = 'dinosaur' | 'frog';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  rewardText: string;
  rewardImage: string;
  chompImage: string;
}

export const THEME_STORAGE_KEY = 'gokidb10.theme.v1';

export const THEMES: Readonly<Record<ThemeId, ThemeConfig>> = Object.freeze({
  dinosaur: {
    id: 'dinosaur',
    name: '恐龙皮肤',
    description: '暖岩石和小霸王',
    rewardText: '嗷呜',
    rewardImage: '/images/trex-reward.png',
    chompImage: '/images/dinosaur-chomp.png',
  },
  frog: {
    id: 'frog',
    name: '青蛙皮肤',
    description: '荷叶和呱呱伙伴',
    rewardText: '呱呱',
    rewardImage: '/images/treefrog-reward.png',
    chompImage: '/images/frog-chomp.png',
  },
});

export const DEFAULT_THEME_ID: ThemeId = 'frog';

export function isThemeId(value: string | null): value is ThemeId {
  return value === 'dinosaur' || value === 'frog';
}
