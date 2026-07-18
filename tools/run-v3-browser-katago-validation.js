#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const childProcess = require("child_process");

const core = require("../engine/neural-mcts-worker.js");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.GOKIDCOACH_VALIDATION_PORT || 8766);
const cdpPort = Number(process.env.GOKIDCOACH_CDP_PORT || 9226);
const chromium = process.env.CHROMIUM_BIN || "chromium";
const validationUrl = process.env.GOKIDCOACH_VALIDATION_URL || "";
const maxPositions = Number(process.env.GOKIDCOACH_VALIDATION_POSITIONS || 80);
const visitLimit = Number(process.env.GOKIDCOACH_VALIDATION_VISITS || 96);
const timeLimitMs = Number(process.env.GOKIDCOACH_VALIDATION_TIME_MS || 3000);
const browserStartupWaitMs = Number(process.env.GOKIDCOACH_BROWSER_STARTUP_WAIT_MS || 5000);
const nodeLimit = Number(process.env.GOKIDCOACH_VALIDATION_NODE_LIMIT || 768);
const maxChildrenPerNode = process.env.GOKIDCOACH_MAX_CHILDREN_PER_NODE
  ? Number(process.env.GOKIDCOACH_MAX_CHILDREN_PER_NODE)
  : null;
const cpuct = process.env.GOKIDCOACH_CPUCT ? Number(process.env.GOKIDCOACH_CPUCT) : null;
const inputFile = process.env.GOKIDCOACH_KATAGO_CACHE || "evaluation/v200-katago-analysis-combined.json";
const outputFile = process.env.GOKIDCOACH_VALIDATION_OUTPUT || "evaluation/v3-browser-katago-validation.json";
const modelManifest = process.env.GOKIDCOACH_MODEL_MANIFEST || "";
const openingEarlyModelManifest = process.env.GOKIDCOACH_OPENING_EARLY_MODEL_MANIFEST || "models/v3/opening-early-failed-1200/model-manifest.json";
const earlyModelManifest = process.env.GOKIDCOACH_EARLY_MODEL_MANIFEST || "models/v3/early-cache-teacher-res8c96/model-manifest.json";
const middlegameModelManifest = process.env.GOKIDCOACH_MIDDLEGAME_MODEL_MANIFEST || "";
const endgameModelManifest = process.env.GOKIDCOACH_ENDGAME_MODEL_MANIFEST || "models/v3/opening-endgame-target/model-manifest.json";
const teacherCache = process.env.GOKIDCOACH_TEACHER_CACHE;
const rootSymmetryAveraging = process.env.GOKIDCOACH_ROOT_SYMMETRY_AVERAGING === "1";

const COLS = "ABCDEFGHJKLMNOPQRST";
const BOARD_SIZE = 19;
const PASS_INDEX = 361;

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".mjs")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".wasm")) return "application/wasm";
  if (file.endsWith(".onnx")) return "application/octet-stream";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    const file = path.normalize(path.join(root, pathname));
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end("forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function getJson(requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: cdpPort, path: requestPath }, response => {
      let data = "";
      response.on("data", chunk => { data += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function websocketConnect(webSocketUrl) {
  const url = new URL(webSocketUrl);
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString("base64");
    const socket = net.connect(Number(url.port), url.hostname, () => {
      socket.write(
        `GET ${url.pathname}${url.search} HTTP/1.1\r\n`
        + `Host: ${url.host}\r\n`
        + "Upgrade: websocket\r\n"
        + "Connection: Upgrade\r\n"
        + `Sec-WebSocket-Key: ${key}\r\n`
        + "Sec-WebSocket-Version: 13\r\n\r\n"
      );
    });
    let buffer = Buffer.alloc(0);
    socket.on("data", function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      const index = buffer.indexOf("\r\n\r\n");
      if (index < 0) return;
      socket.off("data", onData);
      resolve(new WebSocketClient(socket, buffer.subarray(index + 4)));
    });
    socket.on("error", reject);
  });
}

class WebSocketClient {
  constructor(socket, initialBuffer) {
    this.socket = socket;
    this.buffer = initialBuffer || Buffer.alloc(0);
    this.waiters = [];
    socket.on("data", chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  send(payload) {
    const data = Buffer.from(JSON.stringify(payload));
    const header = [0x81];
    if (data.length < 126) header.push(0x80 | data.length);
    else if (data.length < 65536) header.push(0x80 | 126, data.length >> 8, data.length & 255);
    else throw new Error("CDP payload too large");
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 1) masked[i] = data[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([Buffer.from(header), mask, masked]));
  }

  next() {
    return new Promise(resolve => {
      this.waiters.push(resolve);
      this.drain();
    });
  }

  drain() {
    while (this.waiters.length) {
      if (this.buffer.length < 2) return;
      const opcode = this.buffer[0] & 0x0f;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      }
      if (this.buffer.length < offset + length) return;
      const payload = this.buffer.subarray(offset, offset + length);
      this.buffer = this.buffer.subarray(offset + length);
      if (opcode === 1) this.waiters.shift()(JSON.parse(payload.toString("utf8")));
    }
  }
}

async function connectToPage() {
  const pages = await getJson("/json/list");
  const page = pages.find(item => item.url.includes("neural-prototype.html")) || pages[0];
  if (!page) throw new Error("No Chromium page found");
  const socket = await websocketConnect(page.webSocketDebuggerUrl);
  let id = 1;
  async function evaluate(expression) {
    const requestId = id;
    id += 1;
    socket.send({ id: requestId, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } });
    while (true) {
      const message = await socket.next();
      if (message.id === requestId) {
        if (message.result?.exceptionDetails) throw new Error(message.result.exceptionDetails.text || "CDP evaluation failed");
        return message.result?.result?.value;
      }
    }
  }
  return { evaluate };
}

function parseBoardString(boardString) {
  const rows = String(boardString || "").split("|");
  if (rows.length !== BOARD_SIZE || rows.some(row => row.length !== BOARD_SIZE)) return null;
  return rows.map(row => Array.from(row, ch => (ch === "1" ? 1 : ch === "2" ? -1 : 0)));
}

function reconstructPosition(result) {
  const parts = String(result.positionId || "").split(":");
  for (let i = 0; i < parts.length; i += 1) {
    const board = parseBoardString(parts[i]);
    if (!board) continue;
    const sideToken = parts[i + 1];
    const sideToMove = sideToken === "2" || sideToken === "-1" || result.sideToMove === "W" ? "W" : "B";
    const position = {
      board,
      sideToMove,
      komi: Number.isFinite(Number(result.komi)) ? Number(result.komi) : 7.5,
      moveNumber: Number.isFinite(Number(result.moveNumber)) ? Number(result.moveNumber) : 0,
      moveHistory: [],
      phase: result.phase,
      positionId: result.positionId
    };
    const mask = core.legalMask(position);
    position.legalMoves = [];
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      position.legalMoves.push(index === PASS_INDEX ? { pass: true, index } : { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE), index });
    }
    return position;
  }
  return null;
}

function katagoMoveToIndex(move) {
  if (!move || String(move).toLowerCase() === "pass") return PASS_INDEX;
  const text = String(move).toUpperCase();
  const col = COLS.indexOf(text[0]);
  const row = Number(text.slice(1));
  if (col < 0 || !Number.isInteger(row)) return null;
  const y = BOARD_SIZE - row;
  if (y < 0 || y >= BOARD_SIZE) return null;
  return y * BOARD_SIZE + col;
}

function indexToGtp(index) {
  if (index === PASS_INDEX) return "pass";
  const x = index % BOARD_SIZE;
  const y = Math.floor(index / BOARD_SIZE);
  return `${COLS[x]}${BOARD_SIZE - y}`;
}

function topToGtp(items, valueKey) {
  return (items || []).slice(0, 20).map(item => ({
    move: indexToGtp(item.index),
    index: item.index,
    value: item[valueKey],
    visits: item.visits,
    prior: item.prior,
    q: item.q,
    legal: item.legal
  }));
}

function selectedIndex(move) {
  if (!move) return null;
  if (move.pass || move.index === PASS_INDEX) return PASS_INDEX;
  if (Number.isInteger(move.index)) return move.index;
  if (Number.isInteger(move.x) && Number.isInteger(move.y)) return move.y * BOARD_SIZE + move.x;
  return null;
}

function chooseRows() {
  const data = JSON.parse(fs.readFileSync(path.join(root, inputFile), "utf8"));
  const rows = Array.isArray(data) ? data : data.results || [];
  const seen = new Set();
  const usable = rows
    .filter(row => row && row.katagoBestMove && Array.isArray(row.moveInfos) && row.moveInfos.length >= 3)
    .map(row => ({ row, position: reconstructPosition(row), bestIndex: katagoMoveToIndex(row.katagoBestMove) }))
    .filter(item => item.position && item.bestIndex !== null && item.position.legalMoves.some(move => core.moveToIndex(move) === item.bestIndex))
    .filter(item => {
      const key = item.row.positionId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const buckets = new Map();
  for (const item of usable) {
    const phase = item.row.phase || "unknown";
    if (!buckets.has(phase)) buckets.set(phase, []);
    buckets.get(phase).push(item);
  }
  const selected = [];
  while (selected.length < maxPositions && [...buckets.values()].some(items => items.length)) {
    for (const items of buckets.values()) {
      const next = items.shift();
      if (next) selected.push(next);
      if (selected.length >= maxPositions) break;
    }
  }
  return selected;
}

async function waitForHarness(page) {
  for (let i = 0; i < 90; i += 1) {
    const result = await page.evaluate("window.GoKidCoachNeuralPrototypeHarness?.diagnostics?.()");
    if (result?.manager?.activeEngine === "neural-mcts") return result;
    if (result?.manager?.lastError) throw new Error(result.manager.lastError);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Timed out waiting for neural prototype harness");
}

function summarize(results) {
  const total = results.length || 1;
  const knownLoss = results.filter(item => Number.isFinite(item.scoreLoss));
  const byPhase = {};
  for (const item of results) {
    const phase = item.phase || "unknown";
    byPhase[phase] ||= { rows: 0, top1: 0, top3: 0, top10: 0, illegal: 0 };
    byPhase[phase].rows += 1;
    byPhase[phase].top1 += item.top1 ? 1 : 0;
    byPhase[phase].top3 += item.top3 ? 1 : 0;
    byPhase[phase].top10 += item.top10 ? 1 : 0;
    byPhase[phase].illegal += item.legal ? 0 : 1;
  }
  const selectedMoveCounts = {};
  const policyTop1Counts = {};
  const rawTop1Counts = {};
  for (const item of results) {
    selectedMoveCounts[item.selectedMove] = (selectedMoveCounts[item.selectedMove] || 0) + 1;
    const policyTop = item.legalPolicyTop20?.[0]?.move;
    const rawTop = item.rawLogitTop20?.[0]?.move;
    if (policyTop) policyTop1Counts[policyTop] = (policyTop1Counts[policyTop] || 0) + 1;
    if (rawTop) rawTop1Counts[rawTop] = (rawTop1Counts[rawTop] || 0) + 1;
  }
  function topCounts(counts) {
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([move, count]) => ({ move, count }));
  }
  for (const phase of Object.keys(byPhase)) {
    const bucket = byPhase[phase];
    bucket.top1Rate = bucket.top1 / bucket.rows;
    bucket.top3Rate = bucket.top3 / bucket.rows;
    bucket.top10Rate = bucket.top10 / bucket.rows;
  }
  return {
    positions: results.length,
    legalMoveRate: results.filter(item => item.legal).length / total,
    top1Rate: results.filter(item => item.top1).length / total,
    top3Rate: results.filter(item => item.top3).length / total,
    top10Rate: results.filter(item => item.top10).length / total,
    selectedPassRate: results.filter(item => item.selectedIndex === PASS_INDEX).length / total,
    comparableScoreLossCount: knownLoss.length,
    averageScoreLoss: knownLoss.length ? knownLoss.reduce((sum, item) => sum + item.scoreLoss, 0) / knownLoss.length : null,
    averageLatencyMs: results.reduce((sum, item) => sum + item.latencyMs, 0) / total,
    averageVisits: results.reduce((sum, item) => sum + item.visits, 0) / total,
    repeatedSelectedMoves: topCounts(selectedMoveCounts),
    repeatedPolicyTop1: topCounts(policyTop1Counts),
    repeatedRawTop1: topCounts(rawTop1Counts),
    byPhase
  };
}

async function main() {
  const rows = chooseRows();
  if (!rows.length) throw new Error(`No usable KataGo cache rows found in ${inputFile}`);
  const server = validationUrl ? null : await startServer();
  const profile = path.join("/tmp", `gokidcoach-browser-katago-${process.pid}`);
  const targetUrl = validationUrl || `http://127.0.0.1:${port}/neural-prototype.html`;
  const separator = targetUrl.includes("?") ? "&" : "?";
  const chrome = childProcess.spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    `${targetUrl}${separator}provider=wasm${modelManifest ? `&model=${encodeURIComponent(modelManifest)}` : ""}${openingEarlyModelManifest ? `&openingEarlyModel=${encodeURIComponent(openingEarlyModelManifest)}` : ""}${earlyModelManifest ? `&earlyModel=${encodeURIComponent(earlyModelManifest)}` : ""}${middlegameModelManifest ? `&middlegameModel=${encodeURIComponent(middlegameModelManifest)}` : ""}${endgameModelManifest ? `&endgameModel=${encodeURIComponent(endgameModelManifest)}` : ""}${teacherCache !== undefined ? `&teacherCache=${encodeURIComponent(teacherCache)}` : ""}`
  ], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    await new Promise(resolve => setTimeout(resolve, browserStartupWaitMs));
    const page = await connectToPage();
    const init = await waitForHarness(page);
    const results = [];
    for (const item of rows) {
      const options = { mode: "max", timeoutMs: timeLimitMs + 6000, visitLimit, timeLimitMs, nodeLimit };
      if (maxChildrenPerNode) options.maxChildrenPerNode = maxChildrenPerNode;
      if (cpuct) options.cpuct = cpuct;
      if (rootSymmetryAveraging) options.rootSymmetryAveraging = true;
      const expression = `window.GoKidCoachNeuralPrototypeHarness.selectMove(${JSON.stringify(item.position)}, ${JSON.stringify(options)})`;
      const result = await page.evaluate(expression);
      const picked = selectedIndex(result?.move);
      const top = item.row.moveInfos.map(info => ({ index: katagoMoveToIndex(info.move), move: info.move, scoreLead: info.scoreLead, winrate: info.winrate }));
      const pickedInfo = top.find(info => info.index === picked);
      const bestInfo = top[0];
      const legal = picked !== null && item.position.legalMoves.some(move => core.moveToIndex(move) === picked);
      results.push({
        positionId: item.row.positionId,
        phase: item.row.phase,
        moveNumber: item.row.moveNumber,
        sideToMove: item.row.sideToMove,
        selectedMove: indexToGtp(picked),
        selectedIndex: picked,
        katagoBestMove: item.row.katagoBestMove,
        legal,
        top1: picked === top[0]?.index,
        top3: top.slice(0, 3).some(info => info.index === picked),
        top10: top.slice(0, 10).some(info => info.index === picked),
        scoreLoss: pickedInfo && bestInfo ? Math.max(0, Number(bestInfo.scoreLead) - Number(pickedInfo.scoreLead)) : null,
        latencyMs: result?.latencyMs || 0,
        visits: result?.move?.visits || 0,
        nodeCount: result?.diagnostics?.active?.lastResult?.nodeCount || 0,
        teacherCacheOverride: Boolean(result?.move?.teacherCacheOverride),
        teacherCacheBestMove: result?.move?.teacherCacheBestMove || null,
        teacherCachePhase: result?.move?.teacherCachePhase || null,
        teacherCacheSource: result?.move?.teacherCacheSource || null,
        rawNeuralMove: result?.move?.rawNeuralMove ? indexToGtp(selectedIndex(result.move.rawNeuralMove)) : null,
        rawLogitTop20: topToGtp(result?.move?.rawLogitTop || result?.diagnostics?.active?.lastResult?.rawLogitTop, "value"),
        legalPolicyTop20: topToGtp(result?.move?.policyTop || result?.diagnostics?.active?.lastResult?.policyTop, "probability"),
        mctsTop20: topToGtp(result?.move?.candidates || result?.diagnostics?.active?.lastResult?.candidates, "visits"),
        katagoTop10: top.slice(0, 10).map(info => info.move)
      });
    }
    const report = {
      generatedAt: new Date().toISOString(),
      inputFile,
      validationUrl: validationUrl || null,
      model: init.manager?.active?.model?.id || init.manager?.active?.modelId || "student-res6c64-fp16",
      openingEarlyModel: openingEarlyModelManifest || null,
      earlyModel: earlyModelManifest || null,
      middlegameModel: middlegameModelManifest || null,
      endgameModel: endgameModelManifest || null,
      teacherCache: teacherCache !== undefined ? teacherCache : null,
      provider: init.manager?.active?.provider || "unknown",
      visitLimit,
      timeLimitMs,
      nodeLimit,
      maxChildrenPerNode,
      cpuct,
      rootSymmetryAveraging,
      summary: summarize(results),
      results
    };
    fs.writeFileSync(path.join(root, outputFile), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    process.stdout.write(`Wrote ${outputFile}\n`);
  } finally {
    chrome.kill("SIGTERM");
    if (server) server.close();
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
