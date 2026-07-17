const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const py = path.join(root, "training", "v31", "private", "venv", "bin", "python");
const python = fs.existsSync(py) ? py : "python3";

function run(args, options = {}) {
  const result = childProcess.spawnSync(python, args, { cwd: root, encoding: "utf8", timeout: options.timeout || 120000 });
  assert.strictEqual(result.status, 0, `${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result.stdout;
}

function testConfigAndSchema() {
  const cfg = JSON.parse(fs.readFileSync(path.join(root, "training/v31/student_config.json"), "utf8"));
  assert.strictEqual(cfg.selectedArchitecture, "res6c64");
  assert.deepStrictEqual(cfg.featureSchema.spatialShape, [12, 19, 19]);
  assert.deepStrictEqual(cfg.featureSchema.globalShape, [4]);
  assert.strictEqual(cfg.featureSchema.passIndex, 361);
  assert(fs.readFileSync(path.join(root, "docs/V310-STUDENT-FEATURE-SCHEMA.md"), "utf8").includes("[batch, 12, 19, 19]"));
}

function testTeacherDataSmoke() {
  const outDir = "training/v31/generated/test-stage-a";
  const splitManifest = "training/v31/generated/test-split-manifest.json";
  run([
    "training/v31/generate_teacher_data.py",
    "--count", "64",
    "--policy-source", "visits",
    "--temperature", "1.3",
    "--balance-mode", "phase_targets",
    "--score-scale", "40",
    "--output-dir", outDir,
    "--split-manifest", splitManifest,
  ], { timeout: 120000 });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, outDir, "manifest.json"), "utf8"));
  assert.strictEqual(manifest.positionsGenerated, 64);
  assert.strictEqual(manifest.invalidCount, 0);
  assert.strictEqual(manifest.policyTargetTypeDistribution.search_visit_policy, 64);
  assert.strictEqual(manifest.passIndex, 361);
  assert.strictEqual(manifest.policyTemperature, 1.3);
  assert.strictEqual(manifest.balanceMode, "phase_targets");
  assert.strictEqual(manifest.scoreScale, 40);
  assert(manifest.averageConfidenceWeight > 0);
  assert("averagePolicyEntropy" in manifest);
  assert("qualityFlags" in manifest);
  assert(manifest.shards[0].sizeBytes > 0);
}

function testModelForwardAndExportSmoke() {
  const outDir = "training/v31/generated/test-stage-a";
  const checkpoint = "training/v31/checkpoints/test-tiny-student.pt";
  const metrics = "training/v31/generated/test-train-metrics.json";
  run(["training/v31/train_student.py", "--shard", `${outDir}/teacher-0000.npz`, "--checkpoint", checkpoint, "--metrics", metrics, "--epochs", "1", "--limit", "24", "--batch-size", "8"], { timeout: 120000 });
  const train = JSON.parse(fs.readFileSync(path.join(root, metrics), "utf8"));
  assert(train.firstLoss.total > 0);
  assert(train.lastLoss.total > 0);
  run(["training/v31/train_student.py", "--shard", `${outDir}/teacher-0000.npz`, "--checkpoint", checkpoint, "--metrics", metrics, "--resume", checkpoint, "--epochs", "1", "--limit", "24", "--batch-size", "8"], { timeout: 120000 });
  run(["training/v31/evaluate_student.py", "--shard", `${outDir}/teacher-0000.npz`, "--checkpoint", checkpoint, "--split", "train", "--limit", "16", "--out", "training/v31/generated/test-eval.json"], { timeout: 120000 });
  const evalReport = JSON.parse(fs.readFileSync(path.join(root, "training/v31/generated/test-eval.json"), "utf8"));
  assert("policyTop5" in evalReport);
  assert("policyCrossEntropy" in evalReport);
  assert("valueBrier" in evalReport);
  assert("valueEce" in evalReport);
  assert.strictEqual(evalReport.legalMoveRate, 1);
  const onnxOut = "training/v31/generated/test-student.onnx";
  const report = "training/v31/generated/test-onnx-report.json";
  run(["training/v31/export_student_onnx.py", "--checkpoint", checkpoint, "--output", onnxOut, "--report", report], { timeout: 120000 });
  const exportReport = JSON.parse(fs.readFileSync(path.join(root, report), "utf8"));
  assert.strictEqual(exportReport.checker, "passed");
  assert.strictEqual(exportReport.onnxRuntimeCpu, "passed");
  assert(exportReport.differences.every((d) => d.maxAbs <= 1e-4));
}

function testTeacherSampleVerificationSmoke() {
  const outDir = "training/v31/generated/test-stage-a";
  const report = "training/v31/generated/test-sample-verify.json";
  run(["training/v31/verify_teacher_samples.py", "--shard", `${outDir}/teacher-0000.npz`, "--count", "16", "--out", report], { timeout: 120000 });
  const verification = JSON.parse(fs.readFileSync(path.join(root, report), "utf8"));
  assert.strictEqual(verification.passed, true);
  assert.strictEqual(verification.passIndex, 361);
  assert.deepStrictEqual(verification.failures, []);
  assert(verification.checks.includes("legal_mask_contains_teacher_top"));
}

function testNoTrackedGeneratedDataOrProductionChanges() {
  const git = childProcess.spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(git.status, 0, git.stderr || git.error?.message);
  const tracked = git.stdout.split(/\n/).filter(Boolean);
  assert(!tracked.some((file) => file.startsWith("training/v31/generated/")));
  assert(!tracked.some((file) => file.startsWith("training/v31/checkpoints/")));
  assert(!tracked.some((file) => /\.(onnx|pt|pth|npz)$/i.test(file)));
  for (const file of ["app.js", "index.html", "sw.js"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    assert(!text.includes("training/v31"));
    assert(!text.includes("onnxruntime"));
  }
}

testConfigAndSchema();
testTeacherDataSmoke();
testModelForwardAndExportSmoke();
testTeacherSampleVerificationSmoke();
testNoTrackedGeneratedDataOrProductionChanges();
console.log("test-v310-student-pipeline: ok");
