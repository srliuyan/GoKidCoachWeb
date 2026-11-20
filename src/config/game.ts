export const GAME_RULES = Object.freeze({
  boardSize: 19,
  rules: 'chinese' as const,
  komi: 7.5,
  koRule: 'simple' as const,
  allowSuicide: false,
  consecutivePassesToEnd: 2,
});

export const MODEL_CONFIG = Object.freeze({
  label: 'B10 · b10c128',
  identity: 'model:g170e-b10c128-s1141046784-d204142634.bin.gz',
  file: 'g170e-b10c128-s1141046784-d204142634.bin.gz',
  chunkDirectory: 'b10-chunks',
  chunkPrefix: 'g170e-b10c128-s1141046784-d204142634.bin.gz.part',
  chunkCount: 22,
  chunkSize: 524_288,
  chunkConcurrency: 3,
  bytes: 11_138_361,
  uncompressedBytes: 12_003_218,
  sha256: '1a8e05a4ea3fca20dab79410cbb566c760767fcdd2fa0b701cfe259a84cc8b04',
  preferredBackend: 'webgpu' as const,
});

export const STORAGE_CONFIG = Object.freeze({
  gameKey: 'gokidb10.game.v1',
  adaptiveKey: 'gokidb10.adaptive.v1',
  gameVersion: 1,
  adaptiveVersion: 1,
});
