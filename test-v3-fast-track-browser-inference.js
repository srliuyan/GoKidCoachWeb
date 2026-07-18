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

function halfBits(value) {
  if (value === 0) return 0;
  const sign = value < 0 ? 0x8000 : 0;
  const abs = Math.abs(value);
  if (abs >= 65504) return sign | 0x7bff;
  let exponent = Math.floor(Math.log2(abs));
  let mantissa = abs / (2 ** exponent) - 1;
  let halfExponent = exponent + 15;
  if (halfExponent <= 0) return sign | Math.round(abs / 0.000000059604645);
  let halfMantissa = Math.round(mantissa * 1024);
  if (halfMantissa === 1024) {
    halfMantissa = 0;
    halfExponent += 1;
  }
  return sign | (halfExponent << 10) | (halfMantissa & 0x3ff);
}

function fp16(values) {
  return Uint16Array.from(values, halfBits);
}

function makeOutputs(bestIndex = 3 * 19 + 16) {
  const policy = Array(362).fill(-4);
  policy.fill(-4);
  policy[bestIndex] = 8;
  policy[16 * 19 + 3] = 6;
  policy[10 * 19 + 10] = 5;
  policy[361] = -2;
  return {
    policy_logits: { data: fp16(policy) },
    value_logit: { data: fp16([0.4]) },
    score: { data: fp16([0.2]) }
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
  assert.strictEqual(manifest.inputTensorDtypes.spatial, "float16");
  assert.strictEqual(manifest.inputTensorDtypes.global, "float16");
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

async function testFp16TensorInputs() {
  const manifest = JSON.parse(read("models/student-res6c64-fp16.dev.json"));
  const tensorCalls = [];
  const state = new workerCore.WorkerState({
    ort: {
      Tensor: class Tensor {
        constructor(dtype, data, shape) {
          tensorCalls.push({ dtype, data, shape });
          this.dtype = dtype;
          this.data = data;
          this.shape = shape;
        }
      }
    }
  });
  state.session = { run: async () => makeOutputs() };
  state.manifest = manifest;
  await state.infer(samplePosition());
  assert.strictEqual(tensorCalls[0].dtype, "float16");
  assert.strictEqual(tensorCalls[1].dtype, "float16");
  assert(tensorCalls[0].data instanceof Uint16Array);
  assert(tensorCalls[1].data instanceof Uint16Array);
}

async function testOrtScriptLoadFailureIsExplicit() {
  const state = new workerCore.WorkerState({
    importScripts: () => { throw new Error("missing static ORT asset"); }
  });
  const result = await state.initialize({
    manifest: JSON.parse(read("models/student-res6c64-fp16.dev.json")),
    provider: "wasm",
    ortScriptUrl: "vendor/onnxruntime-web/ort.min.js"
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.code, "ORT_SCRIPT_LOAD_FAILED");
  assert(result.message.includes("missing static ORT asset"));
}

async function testOrtWasmPathConfiguration() {
  const created = [];
  const scope = {
    ort: {
      env: { wasm: {} },
      InferenceSession: {
        create: async (modelPath, options) => {
          created.push({ modelPath, options });
          return { run: async () => makeOutputs() };
        }
      }
    }
  };
  const state = new workerCore.WorkerState(scope);
  const result = await state.initialize({
    manifest: JSON.parse(read("models/student-res6c64-fp16.dev.json")),
    provider: "wasm",
    ortMjsPath: "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.mjs",
    ortWasmPath: "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.wasm",
    numThreads: 1
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(scope.ort.env.wasm.numThreads, 1);
  assert.deepStrictEqual(scope.ort.env.wasm.wasmPaths, {
    mjs: "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.mjs",
    wasm: "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.wasm"
  });
  assert.strictEqual(created[0].options.executionProviders[0], "wasm");
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

function testWorkerRuleSimulation() {
  const captureBoard = Array.from({ length: 19 }, () => Array(19).fill(0));
  captureBoard[0][0] = -1;
  captureBoard[0][1] = 1;
  const captured = workerCore.playMove({ board: captureBoard, sideToMove: "B", moveHistory: [] }, { x: 0, y: 1 });
  assert(captured, "capture move should be legal");
  assert.strictEqual(captured.board[0][0], 0);
  assert.strictEqual(captured.sideToMove, "W");

  const suicideBoard = Array.from({ length: 19 }, () => Array(19).fill(0));
  suicideBoard[0][1] = 1;
  suicideBoard[1][0] = 1;
  const suicide = workerCore.playMove({ board: suicideBoard, sideToMove: "W", moveHistory: [] }, { x: 0, y: 0 });
  assert.strictEqual(suicide, null);
}

async function testInferenceAndMctsLegalMove() {
  let runCount = 0;
  const engine = await makeEngine({
    worker: {
      mockSession: {
        run: async () => {
          runCount += 1;
          return makeOutputs();
        }
      }
    }
  });
  const move = await engine.selectMove(samplePosition(), { mode: "max", visitLimit: 24, timeLimitMs: 200, timeoutMs: 1000 });
  assert.strictEqual(move.x, 16);
  assert.strictEqual(move.y, 3);
  assert.strictEqual(move.engine, "neural-mcts");
  assert(move.visits > 0);
  assert(runCount > 1, "MCTS should evaluate child positions, not only the root");
  assert.strictEqual(engine.getDiagnostics().lastResult.legalMoveCount, 4);
}

function testPrematurePassSuppression() {
  const position = samplePosition();
  position.moveNumber = 60;
  const policy = new Float32Array(362);
  policy[361] = 0.95;
  policy[3 * 19 + 16] = 0.03;
  policy[16 * 19 + 3] = 0.01;
  policy[10 * 19 + 10] = 0.01;
  const result = workerCore.runRootMcts(position, { policy, value: 0.5, score: 0 }, { mode: "max", visitLimit: 24, timeLimitMs: 100 });
  assert.notStrictEqual(result.move.index, 361, "early/midgame search should not choose pass while non-pass moves exist");
  const pass = result.candidates.find(candidate => candidate.index === 361);
  const bestNonPass = result.candidates.find(candidate => candidate.index !== 361);
  assert(pass.visits <= bestNonPass.visits, "pass should not dominate root visits before endgame");
}

function testRootStrategicPriorSafety() {
  const position = samplePosition();
  position.moveNumber = 1;
  position.board = Array.from({ length: 19 }, () => Array(19).fill(0));
  const d15 = 4 * 19 + 3;
  const q16 = 3 * 19 + 15;
  const children = [
    { index: d15, move: workerCore.indexToMove(d15), prior: 0.95 },
    { index: q16, move: workerCore.indexToMove(q16), prior: 0.0001 },
    { index: 16 * 19 + 3, move: workerCore.indexToMove(16 * 19 + 3), prior: 0.0001 },
    { index: 361, move: workerCore.indexToMove(361), prior: 0.0498 }
  ];
  workerCore.applyRootStrategicPriorSafety(position, children);
  const boosted = children.find(child => child.index === q16);
  assert(boosted.strategicPriorFloor > 0);
  assert(boosted.prior > 0.03, "strategic root floor should keep opposing-corner candidates searchable");
}

function testPhaseRoutedDefaultsEnabled() {
  const prototype = read("neural-prototype.js");
  const validation = read("tools/run-v3-browser-katago-validation.js");
  const engine = read("engine/neural-mcts-prototype-engine.js");
  for (const source of [prototype, validation]) {
    assert(source.includes("models/v3/opening-early-failed-1200/model-manifest.json"));
    assert(source.includes("models/v3/early-cache-teacher-res8c96/model-manifest.json"));
    assert(source.includes("models/v3/opening-endgame-target/model-manifest.json"));
  }
  assert(prototype.includes("query.get(\"middlegameModel\")"));
  assert(validation.includes("GOKIDCOACH_MIDDLEGAME_MODEL_MANIFEST"));
  assert(validation.includes("middlegameModel="));
  assert(engine.includes("moveNumber <= 120 && phasePaths.middlegame"));
}

function testEarlyTeacherCacheOverrideConfigured() {
  const prototype = read("neural-prototype.js");
  assert(prototype.includes("models/v3/katago-teacher-cache-compact.json"));
  assert(prototype.includes("teacherCacheOverride"));
  assert(prototype.includes("opening_1_20"));
  assert(prototype.includes("early_middlegame_21_60"));
  assert(prototype.includes("late_middlegame_121_200"));
  assert(prototype.includes("teacherCacheOverride"));
  assert(prototype.includes("teacherCachePhase"));
  assert(prototype.includes("query.get(\"teacherCache\") === \"0\""));
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

function testEarlyMiddlegameTeacherReweighting() {
  const generator = read("training/v31/generate_teacher_data.py");
  assert(generator.includes("\"early_middlegame_21_60\": 0.30"));
  assert(generator.includes("def sample_weight_for"));
  assert(generator.includes("--early-middlegame-weight"));
  assert(generator.includes("--early-sharp-teacher-weight"));
}

(async function run() {
  testManifestAndArtifactHash();
  await testFp16TensorInputs();
  await testOrtScriptLoadFailureIsExplicit();
  await testOrtWasmPathConfiguration();
  testFeatureShapeCoordinateAndPass();
  testWorkerRuleSimulation();
  await testInferenceAndMctsLegalMove();
  testPrematurePassSuppression();
  testRootStrategicPriorSafety();
  testPhaseRoutedDefaultsEnabled();
  testEarlyTeacherCacheOverrideConfigured();
  await testCancellationAndStaleRejection();
  await testManagerFallbackAndTwoModes();
  testUiAndNoLegacyNeuralPathContamination();
  testEarlyMiddlegameTeacherReweighting();
  process.stdout.write("test-v3-fast-track-browser-inference: ok\n");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
