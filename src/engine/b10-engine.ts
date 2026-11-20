import { MODEL_CONFIG, GAME_RULES } from '../config/game';
import type { DifficultyConfig } from '../config/difficulty';
import type { GameState, PlayedMove } from '../game/types';
import { KataGoEngineClient } from '../../vendor/web-katrain/src/engine/katago/client';
import type { KataGoAnalysisPayload } from '../../vendor/web-katrain/src/engine/katago/types';
import type { BoardState, Move } from '../../vendor/web-katrain/src/types';

export interface EngineProgress {
  stage: 'download' | 'initialize' | 'ready';
  percent: number;
  detail: string;
}

const MODEL_CACHE_NAME = `gokidb10-b10-${MODEL_CONFIG.sha256.slice(0, 12)}`;
const CHUNK_CACHE_NAME = `gokidb10-b10-chunks-${MODEL_CONFIG.sha256.slice(0, 12)}`;

export class B10Engine {
  private client: KataGoEngineClient | null = null;
  private initialization: Promise<void> | null = null;
  private warmup: Promise<void> | null = null;
  private warmed = false;
  private backend: string | null = null;
  private loadController: AbortController | null = null;

  get activeBackend(): string | null {
    return this.backend;
  }

  async initialize(onProgress?: (progress: EngineProgress) => void): Promise<void> {
    if (this.client && this.backend) return;
    if (this.initialization) return this.initialization;
    this.initialization = this.load(onProgress).catch((error) => {
      this.dispose();
      throw error;
    });
    return this.initialization;
  }

  async analyze(
    state: GameState,
    config: DifficultyConfig,
    options: { assessment?: boolean; parentMoveCount?: number } = {},
  ): Promise<KataGoAnalysisPayload> {
    await this.initialize();
    if (!this.client) throw new Error('B10 引擎尚未初始化');
    const moveCount = state.moves.length;
    return this.client.analyze({
      analysisGroup: options.assessment ? 'background' : 'interactive',
      positionId: `${state.id}:${moveCount}`,
      parentPositionId: options.parentMoveCount === undefined ? undefined : `${state.id}:${options.parentMoveCount}`,
      modelUrl: MODEL_CONFIG.identity,
      backend: MODEL_CONFIG.preferredBackend,
      board: state.board as BoardState,
      previousBoard: state.previousBoard as BoardState | undefined,
      currentPlayer: state.currentPlayer,
      moveHistory: toEngineMoves(state.moves),
      komi: GAME_RULES.komi,
      rules: GAME_RULES.rules,
      visits: options.assessment ? 16 : config.visits,
      maxTimeMs: options.assessment ? Math.min(260, config.maxTimeMs) : config.maxTimeMs,
      batchSize: this.backend === 'webgpu' ? 8 : 2,
      maxChildren: config.maxChildren,
      topK: options.assessment ? Math.max(10, config.topK) : config.topK,
      analysisPvLen: 4,
      nnRandomize: false,
      wideRootNoise: 0,
      conservativePass: true,
      ownershipMode: 'root',
      reuseTree: true,
    });
  }

  async prewarm(
    state: GameState,
    onProgress?: (progress: EngineProgress) => void,
    shouldRunSearch: () => boolean = () => true,
  ): Promise<void> {
    await this.initialize(onProgress);
    if (this.warmed) return;
    if (this.warmup) return this.warmup;
    if (!shouldRunSearch()) return;
    if (!this.client) throw new Error('B10 引擎尚未初始化');

    const snapshotMoveCount = state.moves.length;
    this.warmup = this.client.analyze({
      analysisGroup: 'background',
      positionId: `warmup:${state.id}:${snapshotMoveCount}`,
      modelUrl: MODEL_CONFIG.identity,
      backend: MODEL_CONFIG.preferredBackend,
      board: state.board as BoardState,
      previousBoard: state.previousBoard as BoardState | undefined,
      currentPlayer: state.currentPlayer,
      moveHistory: toEngineMoves(state.moves),
      komi: GAME_RULES.komi,
      rules: GAME_RULES.rules,
      visits: 4,
      maxTimeMs: 120,
      batchSize: this.backend === 'webgpu' ? 8 : 2,
      maxChildren: 8,
      topK: 4,
      analysisPvLen: 1,
      nnRandomize: false,
      wideRootNoise: 0,
      conservativePass: true,
      ownershipMode: 'none',
      reuseTree: false,
    }).then(() => {
      this.warmed = true;
    }).finally(() => {
      this.warmup = null;
    });
    return this.warmup;
  }

  dispose(): void {
    this.loadController?.abort();
    this.client?.dispose();
    this.client = null;
    this.initialization = null;
    this.warmup = null;
    this.warmed = false;
    this.backend = null;
    this.loadController = null;
  }

  private async load(onProgress?: (progress: EngineProgress) => void): Promise<void> {
    const loadController = new AbortController();
    this.loadController = loadController;
    const modelPath = `/models/${MODEL_CONFIG.file}`;
    onProgress?.({ stage: 'download', percent: 0, detail: '正在检查本机 B10 缓存' });
    const cachedBytes = await readCachedModel(modelPath);
    if (loadController.signal.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
    const bytes = cachedBytes ?? await downloadModel(modelPath, onProgress, loadController.signal);
    if (bytes.byteLength !== MODEL_CONFIG.bytes && bytes.byteLength !== MODEL_CONFIG.uncompressedBytes) {
      throw new Error(`B10 模型大小不正确：收到 ${bytes.byteLength} 字节`);
    }

    onProgress?.({ stage: 'initialize', percent: 100, detail: '正在启动本地 AI' });
    if (loadController.signal.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
    const client = new KataGoEngineClient();
    this.client = client;
    const info = await client.init(MODEL_CONFIG.identity, MODEL_CONFIG.preferredBackend, bytes.buffer);
    if (loadController.signal.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
    this.backend = info.backend ?? null;
    if (this.loadController === loadController) this.loadController = null;
    onProgress?.({ stage: 'ready', percent: 100, detail: `${backendLabel(info.backend)} 已就绪` });
  }
}

async function downloadModel(
  modelPath: string,
  onProgress?: (progress: EngineProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    return await downloadChunkedModel(modelPath, onProgress, signal);
  } catch {
    if (signal?.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
    onProgress?.({ stage: 'download', percent: 0, detail: '分块下载失败，改用完整模型下载' });
  }

  onProgress?.({ stage: 'download', percent: 0, detail: '正在下载 B10 模型' });
  const response = await fetch(modelPath, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`B10 模型下载失败：HTTP ${response.status}`);
  const persist = persistModelResponse(modelPath, response.clone());
  const bytes = await readResponseWithProgress(response, MODEL_CONFIG.bytes, (progress) => {
    onProgress?.({
      stage: 'download',
      percent: progress.percent,
      detail: downloadDetail(progress),
    });
  });
  if (signal?.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
  await persist;
  return bytes;
}

async function downloadChunkedModel(
  modelPath: string,
  onProgress?: (progress: EngineProgress) => void,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const chunks = new Array<Uint8Array>(MODEL_CONFIG.chunkCount);
  let nextIndex = 0;
  let received = 0;
  const startedAt = performance.now();

  onProgress?.({ stage: 'download', percent: 0, detail: '正在分块下载 B10 模型' });

  for (let index = 0; index < MODEL_CONFIG.chunkCount; index += 1) {
    const cached = await readCachedChunk(index);
    if (!cached) continue;
    chunks[index] = cached;
    received += cached.byteLength;
  }
  if (received > 0) {
    onProgress?.({
      stage: 'download',
      percent: Math.min(100, (received / MODEL_CONFIG.bytes) * 100),
      detail: `已恢复本机缓存 ${Math.round((received / MODEL_CONFIG.bytes) * 100)}%`,
    });
  }

  async function worker(): Promise<void> {
    while (nextIndex < MODEL_CONFIG.chunkCount) {
      if (signal?.aborted) throw new DOMException('B10 加载已重启', 'AbortError');
      const index = nextIndex;
      nextIndex += 1;
      if (chunks[index]) continue;
      const response = await fetch(chunkPath(index), { cache: 'force-cache', signal });
      if (!response.ok) throw new Error(`B10 模型分块下载失败：HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      chunks[index] = bytes;
      await persistChunk(index, bytes);
      received += bytes.byteLength;
      onProgress?.({
        stage: 'download',
        percent: Math.min(100, (received / MODEL_CONFIG.bytes) * 100),
        detail: downloadDetail({
          percent: Math.min(100, (received / MODEL_CONFIG.bytes) * 100),
          received,
          expected: MODEL_CONFIG.bytes,
          elapsedMs: Math.max(1, performance.now() - startedAt),
        }),
      });
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(MODEL_CONFIG.chunkConcurrency, MODEL_CONFIG.chunkCount) },
    () => worker(),
  ));

  const combined = new Uint8Array(MODEL_CONFIG.bytes);
  let offset = 0;
  for (const chunk of chunks) {
    if (!chunk) throw new Error('B10 模型分块缺失');
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== MODEL_CONFIG.bytes) throw new Error(`B10 模型分块大小不正确：${offset}`);
  await persistModelBytes(modelPath, combined);
  await clearChunkCache();
  return combined as Uint8Array<ArrayBuffer>;
}

async function readCachedModel(modelPath: string): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!('caches' in globalThis)) return null;
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const cached = await cache.match(modelPath);
    if (!cached || !cached.ok) return null;
    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (bytes.byteLength === MODEL_CONFIG.bytes || bytes.byteLength === MODEL_CONFIG.uncompressedBytes) {
      return bytes as Uint8Array<ArrayBuffer>;
    }
    await cache.delete(modelPath);
    return null;
  } catch {
    return null;
  }
}

async function persistModelResponse(modelPath: string, response: Response): Promise<void> {
  if (!('caches' in globalThis)) return;
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(modelPath, response);
  } catch {
    // Cache Storage may be unavailable in private mode or under storage pressure.
  }
}

async function persistModelBytes(modelPath: string, bytes: Uint8Array): Promise<void> {
  if (!('caches' in globalThis)) return;
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    await cache.put(modelPath, new Response(bytes.slice(), {
      headers: {
        'Content-Type': 'application/gzip',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }));
  } catch {
    // Cache Storage may be unavailable in private mode or under storage pressure.
  }
}

async function readCachedChunk(index: number): Promise<Uint8Array | null> {
  if (!('caches' in globalThis)) return null;
  try {
    const cache = await caches.open(CHUNK_CACHE_NAME);
    const cached = await cache.match(chunkPath(index));
    if (!cached || !cached.ok) return null;
    const bytes = new Uint8Array(await cached.arrayBuffer());
    const expected = index === MODEL_CONFIG.chunkCount - 1
      ? MODEL_CONFIG.bytes - MODEL_CONFIG.chunkSize * (MODEL_CONFIG.chunkCount - 1)
      : MODEL_CONFIG.chunkSize;
    if (bytes.byteLength === expected) return bytes;
    await cache.delete(chunkPath(index));
    return null;
  } catch {
    return null;
  }
}

async function persistChunk(index: number, bytes: Uint8Array): Promise<void> {
  if (!('caches' in globalThis)) return;
  try {
    const cache = await caches.open(CHUNK_CACHE_NAME);
    await cache.put(chunkPath(index), new Response(bytes.slice(), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    }));
  } catch {
    // Cache Storage may be unavailable in private mode or under storage pressure.
  }
}

async function clearChunkCache(): Promise<void> {
  if (!('caches' in globalThis)) return;
  try {
    await caches.delete(CHUNK_CACHE_NAME);
  } catch {
    // Cache cleanup is only an optimization.
  }
}

async function readResponseWithProgress(
  response: Response,
  expectedBytes: number,
  onProgress: (progress: { percent: number; received: number; expected: number; elapsedMs: number }) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const startedAt = performance.now();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress({
      percent: Math.min(100, (received / expectedBytes) * 100),
      received,
      expected: expectedBytes,
      elapsedMs: Math.max(1, performance.now() - startedAt),
    });
  }
  const combined = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function downloadDetail(progress: { percent: number; received: number; expected: number; elapsedMs: number }): string {
  const speedBytesPerSecond = progress.received / (progress.elapsedMs / 1000);
  const speedKbps = speedBytesPerSecond / 1024;
  const remainingBytes = Math.max(0, progress.expected - progress.received);
  const remainingSeconds = speedBytesPerSecond > 1024 ? remainingBytes / speedBytesPerSecond : null;
  const percent = Math.round(progress.percent);
  if (remainingSeconds === null || progress.elapsedMs < 2500) {
    return `正在下载 B10 模型 ${percent}%`;
  }
  return `正在下载 B10 模型 ${percent}% · ${formatSpeed(speedKbps)} · 约 ${formatDuration(remainingSeconds)}`;
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(kbps))} KB/s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} 秒`;
  return `${Math.max(1, Math.round(seconds / 60))} 分钟`;
}

function chunkPath(index: number): string {
  return `/models/${MODEL_CONFIG.chunkDirectory}/${MODEL_CONFIG.chunkPrefix}${String(index).padStart(2, '0')}`;
}

export function toEngineMoves(moves: readonly PlayedMove[]): Move[] {
  return moves
    .filter((move) => !move.pass)
    .slice(-5)
    .map((move) => ({ x: move.x, y: move.y, player: move.player }));
}

function backendLabel(backend?: string): string {
  if (backend === 'webgpu') return 'WebGPU';
  if (backend === 'wasm') return 'WASM';
  if (backend === 'cpu') return 'CPU';
  return '本地引擎';
}
