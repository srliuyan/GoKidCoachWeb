const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const fixturesPath = path.join(root, "fixtures", "v303-katago-positions.json");
const referenceScript = path.join(root, "tools", "run-katago-network-reference.py");
const featuresScript = path.join(root, "tools", "inspect-katago-features.py");
const exportScript = path.join(root, "tools", "export-katago-small-to-onnx.py");
const modelPath = path.join(root, "evaluation", "models", "private", "g170e-b10c128-s1141046784-d204142634.txt.gz");
const sourcePath = path.join(root, "evaluation", "models", "private", "katago-source");
const expectedHash = "3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4";

function runPython(args) {
  return childProcess.spawnSync("python3", args, { cwd: root, encoding: "utf8" });
}

function parseLastJson(stdout) {
  const start = stdout.indexOf("{");
  assert(start >= 0, stdout);
  return JSON.parse(stdout.slice(start));
}

function testFixtures() {
  const data = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  assert.strictEqual(data.fixtureCount, 30);
  const ids = new Set(data.fixtures.map((fixture) => fixture.id));
  assert.strictEqual(ids.size, 30);
  for (const fixture of data.fixtures) {
    assert.strictEqual(fixture.boardSize, 19);
    assert(["B", "W"].includes(fixture.sideToMove));
    assert.strictEqual(361, fixture.boardSize * fixture.boardSize);
    assert.strictEqual(typeof fixture.fixtureHash, "string");
  }
}

function testFeatureInspector() {
  const result = runPython([featuresScript, "--fixtures", fixturesPath]);
  assert.strictEqual(result.status, 0, result.stderr);
  const report = parseLastJson(result.stdout);
  assert.strictEqual(report.status, "blocked");
  assert.strictEqual(report.fixtureCount, 30);
  assert.deepStrictEqual(report.hashMismatches, []);
  assert.strictEqual(report.fixtures[0].passIndex, 361);
  assert.deepStrictEqual(report.fixtures[0].officialSpatialInputShape, [1, 361, 22]);
  assert.deepStrictEqual(report.fixtures[0].officialGlobalInputShape, [1, 19]);
}

function testReferenceRunnerFailureIsExplicit() {
  if (!fs.existsSync(modelPath) || !fs.existsSync(sourcePath)) {
    console.log("test-v303-katago-loader-bridge: private model/source unavailable; skipping reference runner");
    return;
  }
  const result = runPython([
    referenceScript,
    "--model", modelPath,
    "--fixtures", fixturesPath,
    "--katago-source", sourcePath,
    "--expected-sha256", expectedHash
  ]);
  assert.notStrictEqual(result.status, 0);
  const report = parseLastJson(result.stdout);
  assert.strictEqual(report.model.sha256, expectedHash);
  assert.strictEqual(report.model.modelVersion, 8);
  assert.strictEqual(report.model.spatialInputFeatures, 22);
  assert.strictEqual(report.loader.officialPytorchTextLoaderAvailable, false);
  assert.strictEqual(report.outputs, null);
}

function testExportBridgeFailureIsExplicit() {
  if (!fs.existsSync(modelPath) || !fs.existsSync(sourcePath)) {
    console.log("test-v303-katago-loader-bridge: private model/source unavailable; skipping exporter private check");
    return;
  }
  const out = path.join(root, "evaluation", "models", "private", "v303-test-output.onnx");
  const result = runPython([
    exportScript,
    modelPath,
    out,
    "--expected-sha256", expectedHash,
    "--katago-source", sourcePath
  ]);
  assert.notStrictEqual(result.status, 0);
  assert(result.stderr.includes("no official PyTorch text-network loader exists"), result.stderr);
  assert(!fs.existsSync(out), "exporter must not emit placeholder ONNX");
}

function testNoProductionChanges() {
  for (const file of ["app.js", "index.html", "sw.js"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert(!text.includes("v303"));
    assert(!text.includes("onnxruntime"));
  }
}

function testNoTrackedModelBinaries() {
  let stdout = "";
  try {
    stdout = childProcess.execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  } catch (error) {
    stdout = String(error.stdout || "");
    if (!stdout) throw error;
  }
  const tracked = stdout.trim().split(/\n/).filter(Boolean);
  const binary = tracked.filter((file) => /\.(onnx|tflite|pt|pth|pb|safetensors|weights)$|(\.bin\.gz|\.txt\.gz)$/i.test(file));
  assert.deepStrictEqual(binary, []);
}

testFixtures();
testFeatureInspector();
testReferenceRunnerFailureIsExplicit();
testExportBridgeFailureIsExplicit();
testNoProductionChanges();
testNoTrackedModelBinaries();
console.log("test-v303-katago-loader-bridge: ok");
