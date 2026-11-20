import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const targetUrl = process.argv[2] ?? 'https://gokidb10.pages.dev/?debug&v=level1-backtest';
const chromeBin = process.env.CHROME_BIN ?? 'google-chrome';
const remotePort = Number(process.env.CHROME_REMOTE_PORT ?? 9231);
const userDataDir = await mkdtemp(join(tmpdir(), 'gokidb10-level1-'));
const childMoves = [
  [3, 3], [15, 4], [16, 3], [14, 3], [3, 15], [15, 15], [9, 9],
  [9, 3], [3, 9], [10, 10], [4, 15], [15, 14],
];

const chrome = spawn(chromeBin, [
  '--headless=new',
  `--remote-debugging-port=${remotePort}`,
  `--user-data-dir=${userDataDir}`,
  '--no-sandbox',
  '--disable-gpu',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

try {
  await waitForChrome(remotePort);
  const cdp = await connectCdp(remotePort);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: targetUrl });
    await sleep(5000);
    await cdp.evalJs('localStorage.clear(); location.reload();', false);
    await sleep(5000);
    await cdp.evalJs(`
      const select = document.querySelector('#level-select');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `);

    const initial = await readState(cdp);
    assert(initial.script?.includes('/assets/index-'), '没有加载生产 JS');
    assert(initial.selectedText?.includes('第 1 级 · 刚入门·吃子陪练'), `第 1 级文案异常：${initial.selectedText}`);
    assert(initial.engine !== 'B10 暂时没准备好', `引擎异常：${initial.detail}`);

    const turnLogs = [];
    let moveIndex = 0;
    while (moveIndex < childMoves.length && turnLogs.length < 6) {
      const before = await readState(cdp);
      if (!before.turn.includes('你下')) break;
      const move = await playNextAcceptedChildMove(cdp, before, moveIndex);
      moveIndex = move.nextIndex;
      if (!move.point) break;
      const after = await waitAiDone(cdp, before.searches.length);
      const latest = after.searches.at(-1);
      turnLogs.push({
        childMove: move.point,
        moveCount: after.moveCount,
        chosen: latest.chosen,
        searchMs: Math.round(latest.searchMs),
        rootVisits: latest.rootVisits,
        candidateCount: latest.candidateCount,
      });
    }

    const final = await readState(cdp);
    assert(turnLogs.length >= 4, `AI 回手次数不足：${turnLogs.length}`);
    assert(final.turn.includes('你下'), `最终没有回到孩子回合：${final.turn}`);
    assert(final.searches.every((entry) => entry.level === 1), '存在非 1 级搜索日志');
    assert(
      final.searches.every((entry) => entry.requestedVisits === 14 && entry.maxTimeMs === 130),
      `1 级预算参数异常：${JSON.stringify(final.searches.map((entry) => ({
        level: entry.level,
        requestedVisits: entry.requestedVisits,
        maxTimeMs: entry.maxTimeMs,
        chosen: entry.chosen,
      })))}`,
    );
    assert(final.searches.every((entry) => entry.chosen && entry.chosen.difficulty), '缺少 1 级选择解释日志');

    console.log('GoKidB10 1级线上回测通过。');
    console.log(`地址：${targetUrl}`);
    console.log(`构建：${initial.script}`);
    console.log(`难度：${initial.selectedText}`);
    console.log(`回手：${turnLogs.length}`);
    for (const log of turnLogs) {
      console.log(JSON.stringify(log));
    }
  } finally {
    cdp.close();
  }
} finally {
  chrome.kill('SIGTERM');
  await waitForProcessExit(chrome).catch(() => {});
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 }).catch(() => {});
}

async function playNextAcceptedChildMove(cdp, before, startIndex) {
  for (let index = startIndex; index < childMoves.length; index += 1) {
    const move = childMoves[index];
    if (before.saved.board[move[1]][move[0]] !== null) continue;
    await clickBoard(cdp, move[0], move[1]);
    const accepted = await waitChildMoveAccepted(cdp, before.saved.moves.length);
    if (accepted) return { point: move, nextIndex: index + 1 };
  }
  return { point: null, nextIndex: childMoves.length };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForChrome(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome DevTools 没有启动');
}

async function connectCdp(port) {
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  const tab = tabs.find((entry) => entry.type === 'page');
  if (!tab) throw new Error('没有可用 Chrome 页面');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    send(method, params = {}) {
      const messageId = ++id;
      ws.send(JSON.stringify({ id: messageId, method, params }));
      return new Promise((resolve, reject) => pending.set(messageId, { resolve, reject }));
    },
    async evalJs(expression, awaitPromise = true) {
      const result = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'JS 执行失败');
      return result.result.value;
    },
    close() {
      ws.close();
    },
  };
}

async function readState(cdp) {
  return JSON.parse(await cdp.evalJs(`JSON.stringify({
    script: document.querySelector('script[type="module"]')?.getAttribute('src') ?? '',
    selectedText: document.querySelector('#level-select')?.selectedOptions?.[0]?.textContent ?? '',
    turn: document.querySelector('#turn-label')?.textContent ?? '',
    engine: document.querySelector('#engine-status')?.textContent ?? '',
    detail: document.querySelector('#engine-detail')?.textContent ?? '',
    moveCount: document.querySelector('#move-count')?.textContent ?? '',
    message: document.querySelector('#board-message')?.textContent ?? '',
    thinkingHidden: document.querySelector('#thinking-mask')?.hidden ?? false,
    searches: globalThis.__GOKIDB10_DEBUG__?.searches ?? [],
    saved: JSON.parse(localStorage.getItem('gokidb10.game.v1')),
  })`));
}

async function clickBoard(cdp, x, y) {
  const point = JSON.parse(await cdp.evalJs(`JSON.stringify((() => {
    const canvas = document.querySelector('#go-board');
    const rect = canvas.getBoundingClientRect();
    const size = canvas.clientWidth;
    const padding = size * 0.055;
    const cell = (size - padding * 2) / 18;
    return { x: rect.left + padding + ${x} * cell, y: rect.top + padding + ${y} * cell };
  })())`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function waitAiDone(cdp, previousSearches) {
  const deadline = Date.now() + 90000;
  let last = null;
  while (Date.now() < deadline) {
    last = await readState(cdp);
    if (last.searches.length > previousSearches && last.thinkingHidden && last.turn.includes('你下')) return last;
    assert(last.engine !== 'B10 暂时没准备好', `引擎错误：${last.detail}`);
    await sleep(1000);
  }
  throw new Error(`AI 回手超时：${JSON.stringify({ turn: last?.turn, moveCount: last?.moveCount, message: last?.message })}`);
}

async function waitChildMoveAccepted(cdp, previousMoveCount) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const latest = await readState(cdp);
    if (latest.saved.moves.length > previousMoveCount || latest.turn.includes('小伙伴')) return true;
    await sleep(250);
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForProcessExit(process) {
  if (process.exitCode !== null || process.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    process.once('exit', resolve);
    setTimeout(resolve, 3000);
  });
}
