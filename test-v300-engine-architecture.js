#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const interfaceModule = require("./engine/ai-engine-interface.js");
const legacyModule = require("./engine/legacy-engine-adapter.js");
const neuralModule = require("./engine/neural-mcts-prototype-engine.js");
const managerModule = require("./engine/engine-manager.js");

const root = __dirname;

function delay(ms, value) {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

async function testInterfaceAndLegacyDefault() {
  const legacy = new legacyModule.LegacyEngineAdapter({ selectMove: () => ({ x: 3, y: 3 }) });
  assert.strictEqual(interfaceModule.validateAIEngine(legacy), true);
  await legacy.initialize();
  assert.deepStrictEqual(await legacy.selectMove({ legalMoves: [{ x: 4, y: 4 }] }), { x: 3, y: 3 });
  assert.strictEqual(legacy.getCapabilities().productionDefault, true);

  const unsafeDefault = new legacyModule.LegacyEngineAdapter();
  await unsafeDefault.initialize();
  await assert.rejects(
    () => unsafeDefault.selectMove({ legalMoves: [{ x: 0, y: 0 }] }),
    /required; refusing unsafe default move/
  );
}

async function testManagerDefaultsToLegacy() {
  const manager = new managerModule.EngineManager({
    legacyOptions: { selectMove: position => position.legalMoves[0] }
  });
  await manager.initialize({ preferNeural: false });
  assert.strictEqual(manager.getActiveEngineName(), "legacy");
  assert.strictEqual(manager.getDiagnostics().fallbackReason, "default_legacy");
  assert.deepStrictEqual(await manager.selectMove({ legalMoves: [{ x: 1, y: 2 }] }), { x: 1, y: 2 });
}

async function testInitializationFailureFallback() {
  const manager = new managerModule.EngineManager({
    legacyOptions: { selectMove: () => ({ pass: true }) },
    neuralEngineFactory: () => ({
      name: "broken-neural",
      initialize: async () => { throw new Error("init failed"); },
      selectMove: async () => ({ x: 9, y: 9 }),
      cancelSearch: () => ({ cancelled: true }),
      getCapabilities: () => ({ engine: "broken-neural" }),
      getDiagnostics: () => ({}),
      dispose: () => {}
    })
  });
  await manager.initialize({ preferNeural: true, timeoutMs: 20 });
  assert.strictEqual(manager.getActiveEngineName(), "legacy");
  assert.strictEqual(manager.getDiagnostics().fallbackReason, "neural_initialization_failed");
}

async function testTimeoutAndActiveFailureFallback() {
  const slowEngine = {
    name: "slow-neural",
    initialize: async () => ({}),
    selectMove: () => new Promise(() => {}),
    cancelSearch: () => ({ cancelled: true }),
    getCapabilities: () => ({ engine: "slow-neural" }),
    getDiagnostics: () => ({}),
    dispose: () => {}
  };
  const manager = new managerModule.EngineManager({
    timeoutMs: 15,
    legacyOptions: { selectMove: position => position.legalMoves[0] },
    neuralEngineFactory: () => slowEngine
  });
  await manager.initialize({ preferNeural: true, timeoutMs: 15 });
  assert.strictEqual(manager.getActiveEngineName(), "slow-neural");
  assert.deepStrictEqual(await manager.selectMove({ legalMoves: [{ x: 1, y: 1 }] }), { x: 1, y: 1 });
  assert.strictEqual(manager.getActiveEngineName(), "legacy");
  assert.strictEqual(manager.getDiagnostics().fallbackReason, "request_timeout");
}

async function testIllegalActiveMoveFallback() {
  const badEngine = {
    name: "bad-neural",
    initialize: async () => ({}),
    selectMove: async () => ({ x: 18, y: 18, engine: "bad-neural" }),
    cancelSearch: () => ({ cancelled: true }),
    getCapabilities: () => ({ engine: "bad-neural" }),
    getDiagnostics: () => ({}),
    dispose: () => {}
  };
  const manager = new managerModule.EngineManager({
    timeoutMs: 100,
    legacyOptions: { selectMove: () => ({ x: 1, y: 1, engine: "legacy" }) },
    neuralEngineFactory: () => badEngine
  });
  await manager.initialize({ preferNeural: true, timeoutMs: 100 });
  const move = await manager.selectMove({
    legalMoves: [{ x: 1, y: 1 }]
  });
  assert.deepStrictEqual(move, { x: 1, y: 1, engine: "legacy" });
  assert.strictEqual(manager.getDiagnostics().fallbackReason, "active_engine_failed");
}

async function testStaleResponseAndOneActiveRequest() {
  let calls = 0;
  const manager = new managerModule.EngineManager({
    timeoutMs: 100,
    legacyOptions: {
      selectMove: position => {
        calls += 1;
        return delay(calls === 1 ? 30 : 1, position.legalMoves[0]);
      }
    }
  });
  await manager.initialize({ preferNeural: false });
  const first = manager.selectMove({ legalMoves: [{ x: 1, y: 1 }] });
  const second = manager.selectMove({ legalMoves: [{ x: 2, y: 2 }] });
  await second;
  await first;
  assert(manager.getDiagnostics().staleResponseCount >= 1);
}

async function testCancellationAndDiagnostics() {
  const manager = new managerModule.EngineManager();
  await manager.initialize({ preferNeural: false });
  const result = manager.cancelSearch();
  assert.strictEqual(result.cancelled, true);
  const diagnostics = manager.getDiagnostics();
  assert.strictEqual(typeof JSON.stringify(diagnostics), "string");
}

function testNeuralPlaceholderCapabilities() {
  const engine = new neuralModule.NeuralMctsPrototypeEngine({ scope: { navigator: {}, WebAssembly } });
  const capabilities = engine.getCapabilities();
  assert.strictEqual(capabilities.architectureOnly, false);
  assert.strictEqual(capabilities.neuralModelLoaded, false);
  assert.strictEqual(capabilities.mctsImplemented, true);
  assert.strictEqual(capabilities.serverDependency, false);
  assert.strictEqual(capabilities.paidApiDependency, false);
}

function testNoProductionContamination() {
  assert(!read("index.html").includes("neural-prototype"));
  assert(!read("app.js").includes("NeuralMctsPrototypeEngine"));
  assert(!read("sw.js").includes("neural-prototype"));
  assert(!read("sw.js").includes("neural-mcts"));
  assert(!/run-v200-katago-analysis|katago-analysis-played|\.bin\.gz|\.onnx|\.tflite/.test(read("neural-prototype.js")));
  const ignoredDirs = new Set([
    ".git",
    "vendor",
    `evaluation${path.sep}models${path.sep}private`,
    `evaluation${path.sep}fixtures${path.sep}private`,
    `training${path.sep}v31${path.sep}private`,
    `training${path.sep}v31${path.sep}generated`,
    `training${path.sep}v31${path.sep}checkpoints`,
    `training${path.sep}v31${path.sep}__pycache__`
  ]);
  const files = [];
  const stack = [""];
  while (stack.length) {
    const relativeDir = stack.pop();
    const entries = fs.readdirSync(path.join(root, relativeDir), { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(relativePath)) stack.push(relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }
  assert(!files.some(file => /\.(onnx|tflite|pt|pb|bin\.gz|weights)$/i.test(file)));
}

function testPrototypePageDiagnosticsExport() {
  const html = read("neural-prototype.html");
  const js = read("neural-prototype.js");
  assert(html.includes("exportDiagnosticsBtn"));
  assert(js.includes("modelIncluded: false"));
  assert(js.includes("mctsImplemented: true"));
  assert(js.includes("URLSearchParams"));
  assert(js.includes("ortScriptUrl"));
  assert(js.includes("ortMjsPath"));
  assert(js.includes("ortWasmPath"));
  assert(js.includes("modelManifestPath"));
  assert(js.includes("GoKidCoachNeuralPrototypeHarness"));
  assert(read("tools/run-v3-browser-smoke.js").includes("neural-prototype.html?provider=wasm"));
  assert(read("engine/neural-mcts-prototype-engine.js").includes("DEFAULT_ORT_SCRIPT"));
  assert(read("engine/neural-mcts-prototype-engine.js").includes("DEFAULT_ORT_MJS"));
  assert(read("engine/neural-mcts-prototype-engine.js").includes("DEFAULT_ORT_WASM"));
}

(async function run() {
  await testInterfaceAndLegacyDefault();
  await testManagerDefaultsToLegacy();
  await testInitializationFailureFallback();
  await testTimeoutAndActiveFailureFallback();
  await testIllegalActiveMoveFallback();
  await testStaleResponseAndOneActiveRequest();
  await testCancellationAndDiagnostics();
  testNeuralPlaceholderCapabilities();
  testNoProductionContamination();
  testPrototypePageDiagnosticsExport();
  process.stdout.write("test-v300-engine-architecture: ok\n");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
