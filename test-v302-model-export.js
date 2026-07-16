const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const root = __dirname;
const script = path.join(root, "tools", "export-katago-small-to-onnx.py");

function run(args) {
  return childProcess.spawnSync("python3", [script, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

function writeTinyModel(file, version = 8) {
  const text = [
    "tiny-test-model",
    String(version),
    "22",
    "19",
    "trunk",
    "10",
    "128",
    "128",
    "96",
    "32",
    "32",
    "policyhead",
    "valuehead",
    ""
  ].join("\n");
  fs.writeFileSync(file, zlib.gzipSync(text));
}

function listFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

(function main() {
  assert(fs.existsSync(script), "export script should exist");

  const missing = run(["does-not-exist.txt.gz", "out.onnx"]);
  assert.notStrictEqual(missing.status, 0, "missing model should fail");
  assert(missing.stderr.includes("source model not found"), "missing model failure should be explicit");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gokidcoach-v302-"));
  try {
    const model = path.join(tmp, "tiny.txt.gz");
    const out = path.join(tmp, "tiny.onnx");
    const manifest = path.join(tmp, "manifest.json");
    writeTinyModel(model);

    const mismatch = run([model, out, "--expected-sha256", "0".repeat(64)]);
    assert.notStrictEqual(mismatch.status, 0, "hash mismatch should fail");
    assert(mismatch.stderr.includes("source hash mismatch"), "hash mismatch should be explicit");

    writeTinyModel(model, 999);
    const unsupported = run([model, out, "--manifest-out", manifest]);
    assert.notStrictEqual(unsupported.status, 0, "unsupported model version should fail");
    assert(unsupported.stderr.includes("unsupported KataGo text model version"), "unsupported version should be explicit");
    const parsed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    assert.strictEqual(parsed.status, "failed", "failure manifest should be written");

    writeTinyModel(model, 8);
    const noExporter = run([model, out, "--manifest-out", manifest]);
    assert.notStrictEqual(noExporter.status, 0, "unimplemented exporter should fail");
    const failed = JSON.parse(fs.readFileSync(manifest, "utf8"));
    assert.strictEqual(failed.status, "failed", "export should report failed status");
    assert(!fs.existsSync(out), "script must not create placeholder ONNX output");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const forbiddenExtensions = new Set([".onnx", ".tflite", ".pt", ".pth", ".pb", ".safetensors", ".weights"]);
  const forbidden = listFiles(root).filter((file) => {
    if (file.includes(`${path.sep}evaluation${path.sep}models${path.sep}private${path.sep}`)) return false;
    if (file.includes(`${path.sep}evaluation${path.sep}fixtures${path.sep}private${path.sep}`)) return false;
    if (file.endsWith(".bin.gz") || file.endsWith(".txt.gz")) return true;
    return forbiddenExtensions.has(path.extname(file));
  });
  assert.deepStrictEqual(forbidden, [], "no model binaries should be tracked or present outside private ignored paths");

  for (const production of ["app.js", "index.html", "sw.js"]) {
    const text = fs.readFileSync(path.join(root, production), "utf8");
    assert(!text.includes("katago-small-v302"), `${production} must not reference V3.0.2 model artifacts`);
    assert(!text.includes("onnxruntime"), `${production} must not load ONNX Runtime`);
  }

  console.log("test-v302-model-export: ok");
})();
