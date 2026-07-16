const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const contract = require("./engine/neural-model-contract.js");
const { InferenceProvider, NOT_CONFIGURED } = require("./engine/inference/inference-provider.js");
const { OnnxWebGpuProvider } = require("./engine/inference/onnx-webgpu-provider.js");
const { OnnxWasmProvider } = require("./engine/inference/onnx-wasm-provider.js");
const { EngineManager } = require("./engine/engine-manager.js");

const root = __dirname;

function validManifest(overrides = {}) {
  return {
    id: "example-small-go-policy-value",
    displayName: "Example Small Go Policy/Value Model",
    version: "0.0.0-example",
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    boardSize: 19,
    policySize: 362,
    passIndex: 361,
    license: {
      name: "MIT",
      url: "https://example.invalid/license",
      status: "verified",
      redistribution: "permitted",
      attribution: "Example attribution"
    },
    featureSchema: {
      id: "example-schema",
      version: "0.0.0",
      planes: 18
    },
    inputs: [
      { name: "features", shape: [1, 18, 19, 19], dtype: "float32" }
    ],
    outputs: [
      { name: "policy", semantic: "policy", shape: [1, 362], dtype: "float32" },
      { name: "value", semantic: "value", shape: [1, 1], dtype: "float32" }
    ],
    executionProviders: ["onnx-webgpu", "onnx-wasm"],
    ...overrides
  };
}

function expectInvalid(overrides, message) {
  const result = contract.validateModelManifest(validManifest(overrides));
  assert.strictEqual(result.valid, false, message);
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

(async function main() {
  assert.strictEqual(contract.validateModelManifest(validManifest()).valid, true, "valid manifest should pass");

  expectInvalid({ license: undefined }, "missing license should fail");
  expectInvalid({ sha256: "" }, "missing hash should fail");
  expectInvalid({ boardSize: 13 }, "invalid board size should fail");
  expectInvalid({ inputs: [{ name: "features", shape: [1, 18, 19, 18], dtype: "float32" }] }, "invalid input shape should fail");
  expectInvalid({ executionProviders: ["paid-cloud-api"] }, "unsupported provider should fail");
  expectInvalid({ license: { name: "Unknown", status: "unknown", redistribution: "unknown" } }, "unknown license should fail");

  const genericProvider = new InferenceProvider();
  assert.strictEqual((await genericProvider.initialize(validManifest())).code, NOT_CONFIGURED);
  assert.strictEqual((await genericProvider.run({})).code, NOT_CONFIGURED);

  const webgpuProvider = new OnnxWebGpuProvider();
  assert.strictEqual((await webgpuProvider.initialize(validManifest())).code, NOT_CONFIGURED);
  assert.strictEqual((await webgpuProvider.run({})).code, NOT_CONFIGURED);

  const wasmProvider = new OnnxWasmProvider();
  assert.strictEqual((await wasmProvider.initialize(validManifest())).code, NOT_CONFIGURED);
  assert.strictEqual((await wasmProvider.run({})).code, NOT_CONFIGURED);

  const manager = new EngineManager();
  await manager.initialize({ requestedEngine: "legacy" });
  const diagnostics = manager.getDiagnostics();
  assert.strictEqual(diagnostics.activeEngine, "legacy", "EngineManager should still default to legacy");
  manager.dispose();

  const forbiddenModelExtensions = new Set([".onnx", ".tflite", ".pt", ".pth", ".pb", ".safetensors", ".weights"]);
  const forbiddenModelFiles = listFiles(root).filter((file) => {
    if (file.includes(`${path.sep}evaluation${path.sep}fixtures${path.sep}private${path.sep}`)) return false;
    if (file.endsWith(".bin.gz")) return true;
    return forbiddenModelExtensions.has(path.extname(file));
  });
  assert.deepStrictEqual(forbiddenModelFiles, [], "no model binary should be committed or present in source tree");

  const productionFiles = ["app.js", "index.html", "sw.js"].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  for (const content of productionFiles) {
    assert(!content.includes("onnxruntime"), "production files must not load ONNX Runtime");
    assert(!content.includes("neural-prototype"), "production files must not link the prototype page");
    assert(!/https?:\/\/[^"']*(api|infer|predict|cloud)/i.test(content), "production files must not contain a network inference endpoint");
  }

  const packageFiles = ["package.json", "package-lock.json"].filter((file) => fs.existsSync(path.join(root, file)));
  for (const file of packageFiles) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert(!text.includes("onnxruntime-web"), `${file} should not add ONNX Runtime yet`);
    assert(!text.includes("@tensorflow/tfjs"), `${file} should not add TensorFlow.js yet`);
  }

  let stash = "";
  try {
    stash = childProcess.execFileSync("git", ["stash", "list", "--max-count=1"], {
      cwd: root,
      encoding: "utf8"
    });
  } catch (error) {
    stash = String(error.stdout || "");
    if (!stash) throw error;
  }
  assert(stash.includes("checkpoint before v3 architecture scaffold"), "stash@{0} should remain preserved");

  console.log("test-v301-model-contract: ok");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
