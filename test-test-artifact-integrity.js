const assert = require("assert");
const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const stress = require("./evaluation/run-v16-bad-move-stress.js");
const endgame = require("./evaluation/run-v161-endgame-audit.js");
const senteGote = require("./evaluation/run-v162-sente-gote-audit.js");
const maxStrength = require("./evaluation/run-v170-max-strength-audit.js");
const top10Reading = require("./evaluation/run-v171-top10-reading-audit.js");
const breadthAudit = require("./evaluation/run-v172-candidate-breadth-audit.js");
const candidateExpansion = require("./evaluation/run-v172-candidate-expansion.js");
const wholeBoardAbAudit = require("./evaluation/run-v173-whole-board-ab-audit.js");
const opponentReplyAudit = require("./evaluation/run-v174-opponent-reply-audit.js");
const reply5Correction = require("./evaluation/run-v174-reply5-correction.js");

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

function withQuietConsole(fn) {
  const originalLog = console.log;
  try {
    console.log = () => {};
    return fn();
  } finally {
    console.log = originalLog;
  }
}

function testCheckModeDoesNotChangeTrackedFiles() {
  const before = trackedHashes();
  withQuietConsole(() => {
    stress.run({ seed: 20260713, positions: 800 });
    endgame.run({ seed: 20260713, positions: 300 });
    senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
  });
  assertHashesUnchanged(before, "runner check mode");
}

function testReportModeWritesOnlyExpectedFiles() {
  withTempDir(dir => {
    withQuietConsole(() => stress.run({ seed: 20260713, positions: 800, writeReports: true, outputDir: dir }));
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
    withQuietConsole(() => endgame.run({ seed: 20260713, positions: 300, writeReports: true, outputDir: dir }));
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
    withQuietConsole(() => senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true, writeReports: true, outputDir: dir }));
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
  withQuietConsole(() => {
    const a = stress.run({ seed: 20260713, positions: 800 });
    const b = stress.run({ seed: 20260713, positions: 800 });
    assert.strictEqual(deterministicHash(a.summary), deterministicHash(b.summary));
    const c = endgame.run({ seed: 20260713, positions: 300 });
    const d = endgame.run({ seed: 20260713, positions: 300 });
    assert.strictEqual(deterministicHash(c.summary), deterministicHash(d.summary));
    const e = senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
    const f = senteGote.run({ seed: 20260713, positions: 300, runtimeIntegrated: true });
    assert.strictEqual(deterministicHash(e.profiles), deterministicHash(f.profiles));
    const g = maxStrength.run({ seed: 20260713, selfPlayGames: 100 });
    const h = maxStrength.run({ seed: 20260713, selfPlayGames: 100 });
    assert.strictEqual(deterministicHash(g.summary), deterministicHash(h.summary));
    const i = top10Reading.run({ seed: 20260713, selfPlayGames: 100 });
    const j = top10Reading.run({ seed: 20260713, selfPlayGames: 100 });
    assert.strictEqual(deterministicHash(i.summary), deterministicHash(j.summary));
    const k = breadthAudit.run({ seed: 20260714 });
    const l = breadthAudit.run({ seed: 20260714 });
    assert.strictEqual(deterministicHash(k.summary), deterministicHash(l.summary));
    const m = candidateExpansion.run();
    const n = candidateExpansion.run();
    assert.strictEqual(deterministicHash(m.summary), deterministicHash(n.summary));
    const o = wholeBoardAbAudit.run();
    const p = wholeBoardAbAudit.run();
    assert.strictEqual(deterministicHash(o.summary), deterministicHash(p.summary));
    const q = opponentReplyAudit.run();
    const r = opponentReplyAudit.run();
    assert.strictEqual(deterministicHash(q.summary), deterministicHash(r.summary));
    const s = reply5Correction.run();
    const t = reply5Correction.run();
    assert.strictEqual(deterministicHash(s.summary), deterministicHash(t.summary));
  });
}

function testReportManifestCoversCurrentReports() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "report-manifest.json"), "utf8"));
  const audit = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "v163-report-writer-audit.json"), "utf8"));
  const manifestPaths = new Set(manifest.reports.map(item => item.path));
  for (const required of [
    "evaluation/v16-calibrated-category-summary.json",
    "evaluation/v161-endgame-category-summary.json",
    "evaluation/v162-correction-report.json",
    "evaluation/v170-max-strength-summary.json",
    "evaluation/v170-gate-result.json",
    "evaluation/v171-top10-reading-summary.json",
    "evaluation/v171-gate-result.json",
    "evaluation/v172-candidate-source-summary.json",
    "evaluation/v172-gate-result.json",
    "evaluation/v172-opportunity-consolidation.json",
    "evaluation/v172-candidate-expansion-summary.json",
    "evaluation/v173-whole-board-ab-audit.json",
    "evaluation/v173-whole-board-phase-summary.json",
    "evaluation/v173-whole-board-gate-result.json",
    "evaluation/v174-opponent-reply-audit.json",
    "evaluation/v174-reply-category-summary.json",
    "evaluation/v174-critical-reply-cases.json",
    "evaluation/v174-reply4-vs-reply5.json",
    "evaluation/v174-reply5-vs-reply6.json",
    "evaluation/v174-gate-result.json",
    "evaluation/v174-reply5-correction-report.json",
    "evaluation/v174-reply5-profile-comparison.json",
    "evaluation/v174-reply5-before-after.json",
    "evaluation/v174-reply5-gate-result.json",
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
  const testFiles = fs.readdirSync(root)
    .filter(file => /^test-.*\.js$/.test(file))
    .sort();
  for (const file of testFiles) {
    const child = childProcess.spawnSync(process.execPath, [file], {
      cwd: root,
      env: { ...process.env, GOKIDCOACH_ARTIFACT_INTEGRITY_CHILD: "1" },
      stdio: "pipe",
      timeout: 300000,
      killSignal: "SIGTERM"
    });
    if (child.error && child.error.code === "ETIMEDOUT") {
      throw new Error(`${file} timed out during artifact-integrity full-loop check`);
    }
    assert.ifError(child.error);
    assert.strictEqual(child.signal, null, `${file} terminated by ${child.signal}`);
    assert.strictEqual(child.status, 0, `${file} exited ${child.status}`);
  }
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
