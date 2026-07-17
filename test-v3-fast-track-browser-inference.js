#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const workerCore = require("./engine/neural-mcts-worker.js");
const neuralModule = require("./engine/neural-mcts-prototype-engine.js");
const managerModule = require("./engine/engine-manager.js");

const root = __dirname;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function samplePosition() {
  const board = Array.from({ length: 19 }, () => Array(19).fill(0));
  board[3][3] = 1;
  board[15][15] = -1;
  return {
    board,
    sideToMove: "B",
    komi: 7.5,
    moveNumber: 3,
    moveHistory: [{ x: 3, y: 3, color: "B" }, { x: 15, y: 15, color: "W" }],
    legalMoves: [{ x: 16, y: 3 }, { x: 3, y: 16 }, { x: 10, y: 10 }, { pass: true }]
  };
}

function makeOutputs(bestIndex = 3 * 19 + 16) {
  const policy = new Float32Array(362);
  policy.fill(-4);
  policy[bestIndex] = 8;
  policy[16 * 19 + 3] = 6;
  policy[10 * 19 + 10] = 5;
  policy[361] = -2;
  return {
    policy_logits: { data: policy },
    value_logit: { data: new Float32Array([0.4]) },
    score: { data: new Float32Array([0.2]) }
  };
}

class FakeWorker {
  constructor(options = {}) {
    this.listeners = [];
    this.state = new workerCore.WorkerState({});
    this.delayMs = options.delayMs || 0;
    this.mockSession = options.mockSession || { run: async () => makeOutputs() };
  }

  addEventListener(type, listener) {
    if (type === "message") this.listeners.push(listener);
  }

  postMessage(message) {
    const payload = message.type === "initialize" ? { ...message, mockSession: this.mockSession } : message;
    const run = async () => {
      const response = await workerCore.handleMessage(payload, this.state);
      this.listeners.forEach(listener => listener({ data: response }));
    };
    if (message.type === "search" && this.delayMs) setTimeout(run, this.delayMs);
    else setTimeout(run, 0);
  }

  terminate() {
    this.terminated = true;
  }
}

async function makeEngine(options = {}) {
  const manifest = JSON.parse(read("models/student-res6c64-fp16.dev.json"));
  const engine = new neuralModule.NeuralMctsPrototypeEngine({
    modelManifest: manifest,
    provider: options.provider || "wasm",
    workerFactory: () => new FakeWorker(options.worker || {})
  });
  await engine.initialize({ modelManifest: manifest, provider: options.provider || "wasm", timeoutMs: 1000 });
  return engine;
}

function testManifestAndArtifactHash() {
  const manifest = JSON.parse(read("models/student-res6c64-fp16.dev.json"));
  assert.strictEqual(manifest.modelFormat, "onnx-fp16");
  assert.strictEqual(manifest.boardSize, 19);
  assert.deepStrictEqual(manifest.spatialInputShape, [1, 12, 19, 19]);
  assert.deepStrictEqual(manifest.globalInputShape, [1, 4]);
  assert.strictEqual(manifest.passIndex, 361);
  assert.strictEqual(manifest.inputTensorNames.spatial, "spatial");
  assert.strictEqual(manifest.outputTensorNames.policy, "policy_logits");
  const modelPath = path.join(root, manifest.modelPath);
  if (fs.existsSync(modelPath)) {
    const actual = crypto.createHash("sha256").update(fs.readFileSync(modelPath)).digest("hex");
    assert.strictEqual(actual, manifest.sha256);
  }
}

function testFeatureShapeCoordinateAndPass() {
  const encoded = workerCore.encodeFeatures(samplePosition());
  assert.strictEqual(encoded.spatial.length, 12 * 19 * 19);
  assert.strictEqual(encoded.globalFeatures.length, 4);
  assert.strictEqual(workerCore.moveToIndex({ x: 16, y: 3 }), 3 * 19 + 16);
  assert.deepStrictEqual(workerCore.indexToMove(361), { pass: true, index: 361 });
  assert.strictEqual(encoded.legalMask[3 * 19 + 16], 1);
  assert.strictEqual(encoded.legalMask[0], 0);
  assert.strictEqual(encoded.legalMask[361], 1);
}

async function testInferenceAndMctsLegalMove() {
  const engine = await makeEngine();
  const move = await engine.selectMove(samplePosition(), { mode: "max", visitLimit: 24, timeLimitMs: 200, timeoutMs: 1000 });
  assert.strictEqual(move.x, 16);
  assert.strictEqual(move.y, 3);
  assert.strictEqual(move.engine, "neural-mcts");
  assert(move.visits > 0);
  assert.strictEqual(engine.getDiagnostics().lastResult.legalMoveCount, 4);
}

async function testCancellationAndStaleRejection() {
  const engine = await makeEngine({ worker: { delayMs: 40 } });
  const pending = engine.selectMove(samplePosition(), { mode: "adaptive", visitLimit: 64, timeLimitMs: 500, timeoutMs: 1000 });
  const cancelled = engine.cancelSearch();
  assert.strictEqual(cancelled.cancelled, true);
  await assert.rejects(pending, /stale|cancel/i);
}

async function testManagerFallbackAndTwoModes() {
  const fallbackManager = new managerModule.EngineManager({
    timeoutMs: 50,
    legacyOptions: { selectMove: () => ({ pass: true, engine: "legacy" }) },
    neuralEngineFactory: () => new neuralModule.NeuralMctsPrototypeEngine({
      scope: { navigator: {}, WebAssembly, fetch: async () => { throw new Error("no manifest"); } },
      workerFactory: () => { throw new Error("no worker"); }
    })
  });
  await fallbackManager.initialize({ preferNeural: true, timeoutMs: 50 });
  assert.strictEqual(fallbackManager.getActiveEngineName(), "legacy");
  assert.strictEqual((await fallbackManager.selectMove(samplePosition())).engine, "legacy");

  const manager = new managerModule.EngineManager({
    timeoutMs: 1000,
    legacyOptions: { selectMove: () => ({ pass: true, engine: "legacy" }) },
    neuralEngineFactory: () => new neuralModule.NeuralMctsPrototypeEngine({
      modelManifest: JSON.parse(read("models/student-res6c64-fp16.dev.json")),
      workerFactory: () => new FakeWorker()
    })
  });
  await manager.initialize({ preferNeural: true, neural: { provider: "wasm" }, timeoutMs: 1000 });
  assert.strictEqual(manager.getActiveEngineName(), "neural-mcts");
  const adaptive = await manager.selectMove(samplePosition(), { mode: "adaptive", timeoutMs: 1000 });
  const max = await manager.selectMove(samplePosition(), { mode: "max", timeoutMs: 1000 });
  assert.strictEqual(adaptive.engine, "neural-mcts");
  assert.strictEqual(max.engine, "neural-mcts");
}

function testUiAndNoLegacyNeuralPathContamination() {
  const html = read("index.html");
  const prototype = read("neural-prototype.html");
  assert(html.includes("自适应对弈"));
  assert(html.includes("当前最高棋力"));
  assert(!/<option value=\"beginner\"/.test(html));
  assert(!/<option value=\"basic\"/.test(html));
  assert(!/<option value=\"advanced\"/.test(html));
  assert(/skill-card\" hidden/.test(html));
  assert(/task-card\" hidden/.test(html));
  assert(!prototype.includes("Adaptive Engine"));
  assert(!prototype.includes("能力档案"));
  const neuralEngine = read("engine/neural-mcts-prototype-engine.js") + read("engine/neural-mcts-worker.js");
  for (const token of ["OpeningBook", "Shape", "Fuseki", "Joseki", "EndgameLibrary", "ContextFusion", "PositionEvaluator", "MoveQualityController", "CompanionEngine"]) {
    assert(!neuralEngine.includes(token), `${token} leaked into neural path`);
  }
}

(async function run() {
  testManifestAndArtifactHash();
  testFeatureShapeCoordinateAndPass();
  await testInferenceAndMctsLegalMove();
  await testCancellationAndStaleRejection();
  await testManagerFallbackAndTwoModes();
  testUiAndNoLegacyNeuralPathContamination();
  process.stdout.write("test-v3-fast-track-browser-inference: ok\n");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
