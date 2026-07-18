#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const crypto = require("crypto");
const childProcess = require("child_process");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.GOKIDCOACH_SMOKE_PORT || 8765);
const chromium = process.env.CHROMIUM_BIN || "chromium";

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

function getJson(cdpPort, requestPath) {
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

async function connectToPage(cdpPort) {
  const pages = await getJson(cdpPort, "/json/list");
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

async function waitForPage(cdpPort, chrome, stderrLines) {
  let lastError = null;
  for (let i = 0; i < 30; i += 1) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chromium exited before CDP was ready: ${stderrLines.slice(-20).join("\n")}`);
    }
    try {
      return await connectToPage(cdpPort);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Timed out waiting for Chromium CDP: ${String(lastError?.message || lastError)}\n${stderrLines.slice(-20).join("\n")}`);
}

function board(stones = []) {
  const out = Array.from({ length: 19 }, () => Array(19).fill(0));
  for (const [x, y, value] of stones) out[y][x] = value;
  return out;
}

const positions = [
  {
    name: "opening",
    position: {
      board: board([[3, 3, 1], [15, 15, -1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 3,
      moveHistory: [{ x: 3, y: 3, color: "B" }, { x: 15, y: 15, color: "W" }],
      legalMoves: [{ x: 16, y: 3 }, { x: 3, y: 16 }, { x: 10, y: 10 }, { pass: true }]
    }
  },
  {
    name: "capture",
    position: {
      board: board([[0, 0, -1], [1, 0, 1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 12,
      moveHistory: [],
      legalMoves: [{ x: 0, y: 1 }, { x: 10, y: 10 }, { pass: true }]
    }
  },
  {
    name: "weak-group",
    position: {
      board: board([[4, 4, 1], [5, 4, 1], [4, 5, -1], [5, 5, -1], [6, 4, -1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 48,
      moveHistory: [],
      legalMoves: [{ x: 3, y: 4 }, { x: 4, y: 3 }, { x: 6, y: 5 }, { x: 10, y: 10 }, { pass: true }]
    }
  },
  {
    name: "connection",
    position: {
      board: board([[8, 8, 1], [10, 8, 1], [9, 7, -1], [9, 9, -1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 72,
      moveHistory: [],
      legalMoves: [{ x: 9, y: 8 }, { x: 8, y: 9 }, { x: 10, y: 9 }, { pass: true }]
    }
  },
  {
    name: "endgame",
    position: {
      board: board([[0, 18, 1], [1, 18, 1], [3, 18, -1], [4, 18, -1], [2, 17, -1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 210,
      moveHistory: [],
      legalMoves: [{ x: 2, y: 18 }, { x: 6, y: 18 }, { x: 10, y: 10 }, { pass: true }]
    }
  },
  {
    name: "pass-sensitive",
    position: {
      board: board([[3, 3, 1], [15, 15, -1], [16, 3, 1], [3, 16, -1]]),
      sideToMove: "B",
      komi: 7.5,
      moveNumber: 260,
      moveHistory: [{ pass: true, color: "W" }],
      legalMoves: [{ x: 10, y: 10 }, { x: 10, y: 11 }, { pass: true }]
    }
  }
];

function legal(position, move) {
  const index = move?.pass ? 361 : Number.isInteger(move?.index) ? move.index : move?.y * 19 + move?.x;
  return position.legalMoves.some(item => {
    const candidate = item.pass ? 361 : Number.isInteger(item.index) ? item.index : item.y * 19 + item.x;
    return candidate === index;
  });
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

async function main() {
  const server = await startServer();
  const cdpPort = Number(process.env.GOKIDCOACH_CDP_PORT || 9225);
  const modelManifest = process.env.GOKIDCOACH_MODEL_MANIFEST || "models/student-res6c64-fp16.dev.json";
  const profile = path.join("/tmp", `gokidcoach-browser-smoke-${process.pid}`);
  const pageUrl = `http://127.0.0.1:${port}/neural-prototype.html?provider=wasm&model=${encodeURIComponent(modelManifest)}`;
  const chrome = childProcess.spawn(chromium, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profile}`,
    pageUrl
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const chromeStderr = [];
  chrome.stderr.on("data", chunk => {
    chromeStderr.push(String(chunk).trim());
    if (chromeStderr.length > 50) chromeStderr.shift();
  });

  try {
    const page = await waitForPage(cdpPort, chrome, chromeStderr);
    const init = await waitForHarness(page);
    const results = [];
    let passSelected = 0;
    let passDominated = 0;
    for (const item of positions) {
      const expression = `window.GoKidCoachNeuralPrototypeHarness.selectMove(${JSON.stringify(item.position)}, {mode: "max", timeoutMs: 8000, visitLimit: 64, timeLimitMs: 2500, nodeLimit: 512})`;
      const result = await page.evaluate(expression);
      if (!result?.move) throw new Error(`${item.name}: no move returned`);
      if (!legal(item.position, result.move)) throw new Error(`${item.name}: illegal move ${JSON.stringify(result.move)}`);
      const passCandidate = result.move.candidates?.find(candidate => candidate.index === 361);
      const bestNonPass = result.move.candidates?.find(candidate => candidate.index !== 361);
      if (result.move.pass || result.move.index === 361) passSelected += 1;
      if (passCandidate && bestNonPass && passCandidate.visits > bestNonPass.visits) passDominated += 1;
      results.push({
        name: item.name,
        move: result.move,
        latencyMs: result.latencyMs,
        visits: result.move.visits,
        nodeCount: result.diagnostics?.active?.lastResult?.nodeCount || 0
      });
    }
    const summary = {
      ok: true,
      activeEngine: init.manager.activeEngine,
      provider: init.manager.active?.provider,
      positions: results.length,
      illegalMoves: 0,
      passSelected,
      passDominated,
      results
    };
    if (passSelected) throw new Error(`Pass was selected in ${passSelected} smoke positions with non-pass legal moves`);
    if (passDominated) throw new Error(`Pass dominated root visits in ${passDominated} smoke positions`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    chrome.kill("SIGTERM");
    server.close();
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
