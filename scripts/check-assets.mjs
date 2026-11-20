import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const dist = join(root, 'dist');
const expectedModel = 'g170e-b10c128-s1141046784-d204142634.bin.gz';
const expectedHash = '1a8e05a4ea3fca20dab79410cbb566c760767fcdd2fa0b701cfe259a84cc8b04';
const expectedChunkPrefix = 'g170e-b10c128-s1141046784-d204142634.bin.gz.part';
const expectedChunkCount = 22;
const maximumBytes = 25 * 1024 * 1024;
const files = await walk(dist);
const failures = [];

for (const file of files) {
  const info = await stat(file);
  if (info.size > maximumBytes) failures.push(`${relative(dist, file)} 超过 25 MiB`);
  if (/b15/i.test(file)) failures.push(`${relative(dist, file)} 不得包含 B15`);
}

const modelPath = join(dist, 'models', expectedModel);
try {
  const hash = createHash('sha256').update(await readFile(modelPath)).digest('hex');
  if (hash !== expectedHash) failures.push(`B10 SHA-256 不匹配：${hash}`);
} catch (error) {
  failures.push(`缺少 B10 模型：${error instanceof Error ? error.message : String(error)}`);
}

try {
  const chunkBuffers = [];
  for (let index = 0; index < expectedChunkCount; index += 1) {
    const chunkName = `${expectedChunkPrefix}${String(index).padStart(2, '0')}`;
    chunkBuffers.push(await readFile(join(dist, 'models', 'b10-chunks', chunkName)));
  }
  const chunkHash = createHash('sha256').update(Buffer.concat(chunkBuffers)).digest('hex');
  if (chunkHash !== expectedHash) failures.push(`B10 分块 SHA-256 不匹配：${chunkHash}`);
} catch (error) {
  failures.push(`B10 分块检查失败：${error instanceof Error ? error.message : String(error)}`);
}

const headers = await readFile(join(dist, '_headers'), 'utf8');
for (const required of ['Cross-Origin-Opener-Policy: same-origin', 'Cross-Origin-Embedder-Policy: require-corp', 'max-age=31536000, immutable']) {
  if (!headers.includes(required)) failures.push(`_headers 缺少：${required}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  const largest = (await Promise.all(files.map(async (file) => ({ file, size: (await stat(file)).size })))).sort((a, b) => b.size - a.size)[0];
  console.log('GoKidB10 Cloudflare 资源检查通过。');
  console.log(`文件数：${files.length}`);
  console.log(`最大文件：${relative(dist, largest.file)} (${(largest.size / 1024 / 1024).toFixed(2)} MiB)`);
  console.log(`B10 SHA-256：${expectedHash}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}
