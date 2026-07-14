const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const stress = require("./evaluation/run-v16-bad-move-stress.js");
const endgame = require("./evaluation/run-v161-endgame-audit.js");
const senteGote = require("./evaluation/run-v162-sente-gote-audit.js");

const root = __dirname;

function git(args) {
  try {
    return childProcess.execFileSync("git", args, { cwd: root, encoding: "utf8" });
  } catch (error) {
    if (typeof error.stdout === "string" && error.stdout.length) return error.stdout;
    throw error;
  }
}

function trackedFiles() {
  try {
    return git(["ls-files", "-z"]).split("\0").filter(Boolean);
  } catch (error) {
    void error;
    return [
      "app.js",
      "build-info.js",
      "index.html",
      "manifest.webmanifest",
      "test-cleanup-integrity.js",
      "test-long-game-performance.js",
      "test-opening-coherence.js",
      "test-v15-profile-runner.js",
      "test-v151-profile-runner.js",
      "test-v16-corrections.js",
      "test-v161-corrections.js",
      "test-v162-corrections.js"
    ];
  }
}

function trackedHashes() {
  const result = {};
  for (const file of trackedFiles()) {
    const full = path.join(root, file);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) continue;
    result[file] = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  }
  return result;
}

function assertHashesUnchanged(before, label) {
  assert.deepStrictEqual(trackedHashes(), before, `${label} changed tracked files`);
}

function deterministicHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value, (key, item) => /generatedAt|latency|Latency|timeMs|TimeMs/.test(key) ? "<volatile>" : item))
    .digest("hex");
}

function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort();
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gokidcoach-v163-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testCheckModeDoesNotChangeTrackedFiles() {
  const before = trackedHashes();
  stress.run({ seed: 20260713, positions: 800 });
  endgame.run({ seed: 20260713, positions: 300 });
  senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  assertHashesUnchanged(before, "runner check mode");
}

function testReportModeWritesOnlyExpectedFiles() {
  withTempDir(dir => {
    stress.run({ seed: 20260713, positions: 800, writeReports: true, outputDir: dir });
    assert.deepStrictEqual(filesUnder(dir), [
      "v16-bad-move-cases.json",
      "v16-before-after-cases.json",
      "v16-calibrated-bad-move-cases.json",
      "v16-calibrated-category-summary.json",
      "v16-calibrated-pipeline-trace.json",
      "v16-calibrated-stress-results.json",
      "v16-category-summary.json",
      "v16-correction-report.json",
      "v16-detector-calibration-sample.json",
      "v16-detector-calibration-sample.txt",
      "v16-endgame-stress.json",
      "v16-gate-result.json",
      "v16-repetitive-local-play.json",
      "v16-selection-pipeline-trace.json",
      "v16-stress-results.json"
    ]);
  });
  withTempDir(dir => {
    endgame.run({ seed: 20260713, positions: 300, writeReports: true, outputDir: dir });
    assert.deepStrictEqual(filesUnder(dir), [
      "v161-before-after-cases.json",
      "v161-correction-report.json",
      "v161-endgame-bad-move-cases.json",
      "v161-endgame-calibration-sample.json",
      "v161-endgame-calibration-sample.txt",
      "v161-endgame-category-summary.json",
      "v161-endgame-pipeline-trace.json",
      "v161-final-selector-audit.json",
      "v161-gate-result.json",
      "v161-tactical-override-trace.json"
    ]);
  });
  withTempDir(dir => {
    senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true, writeReports: true, outputDir: dir });
    assert.deepStrictEqual(filesUnder(dir), [
      "v162-before-after-cases.json",
      "v162-correction-report.json",
      "v162-final-selector-audit.json",
      "v162-gate-result.json",
      "v162-sente-gote-trace.json"
    ]);
  });
}

function testDeterministicHashesRepeat() {
  const a = stress.run({ seed: 20260713, positions: 800 });
  const b = stress.run({ seed: 20260713, positions: 800 });
  assert.strictEqual(deterministicHash(a.summary), deterministicHash(b.summary));
  const c = endgame.run({ seed: 20260713, positions: 300 });
  const d = endgame.run({ seed: 20260713, positions: 300 });
  assert.strictEqual(deterministicHash(c.summary), deterministicHash(d.summary));
  const e = senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  const f = senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  assert.strictEqual(deterministicHash(e.profiles), deterministicHash(f.profiles));
}

function testReportManifestCoversCurrentReports() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "report-manifest.json"), "utf8"));
  const audit = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "v163-report-writer-audit.json"), "utf8"));
  const manifestPaths = new Set(manifest.reports.map(item => item.path));
  for (const required of [
    "evaluation/v16-calibrated-category-summary.json",
    "evaluation/v161-endgame-category-summary.json",
    "evaluation/v162-correction-report.json",
    "evaluation/long-game-performance-report.json",
    "evaluation/build-consistency-audit.json",
    "evaluation/export-integrity-report.json",
    "evaluation/benchmark-report.json"
  ]) {
    assert(manifestPaths.has(required), required);
  }
  assert(audit.writers.every(writer => writer.classification));
}

function testCiUsesCheckModeAndDeploymentExcludesEvaluation() {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-pages.yml"), "utf8");
  assert(workflow.includes("--check"));
  assert(!workflow.includes("cp -R evaluation"));
}

function testFullLoopDoesNotChangeTrackedFiles() {
  if (process.env.GOKIDCOACH_ARTIFACT_INTEGRITY_CHILD === "1") return;
  const before = trackedHashes();
  const command = "for f in test-*.js; do GOKIDCOACH_ARTIFACT_INTEGRITY_CHILD=1 node \"$f\" || exit 1; done";
  childProcess.execFileSync("bash", ["-lc", command], {
    cwd: root,
    env: { ...process.env, GOKIDCOACH_ARTIFACT_INTEGRITY_CHILD: "1" },
    stdio: "ignore"
  });
  assertHashesUnchanged(before, "normal full test loop");
}

function run() {
  if (process.env.GOKIDCOACH_ARTIFACT_INTEGRITY_CHILD === "1") {
    console.log("test-test-artifact-integrity: child skip");
    return;
  }
  testCheckModeDoesNotChangeTrackedFiles();
  testReportModeWritesOnlyExpectedFiles();
  testDeterministicHashesRepeat();
  testReportManifestCoversCurrentReports();
  testCiUsesCheckModeAndDeploymentExcludesEvaluation();
  testFullLoopDoesNotChangeTrackedFiles();
  console.log("test-test-artifact-integrity: ok");
}

run();
