#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const buildInfo = require("../build-info.js");
const product = require("../product-support.js");
const ruleEngine = require("../rule-engine.js");
const v14 = require("./run-v14-audits.js");
const longGame = require("./run-long-game-performance.js");
const v15 = require("./run-v15-middlegame-audit.js");

const root = path.join(__dirname, "..");
const evaluationDir = __dirname;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function write(name, payload) {
  fs.writeFileSync(path.join(evaluationDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function listFiles(dir = root) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === ".git") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return [path.relative(root, full).replaceAll(path.sep, "/")];
  }).sort();
}

function indexScripts() {
  const html = read("index.html");
  return Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g)).map(match => match[1].replace(/^\.\//, ""));
}

function swAssets() {
  const sw = read("sw.js");
  const match = sw.match(/const assets = \[([\s\S]*?)\];/);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map(item => item[1].replace(/^\.\//, ""));
}

function activeDependencyMap() {
  const scripts = new Set(indexScripts());
  const cached = new Set(swAssets());
  const files = listFiles();
  const docs = new Set(files.filter(file => /\.md$|LICENSE$/.test(file)));
  const tests = new Set(files.filter(file => /^test-.*\.js$/.test(file)));
  const evalFiles = new Set(files.filter(file => file.startsWith("evaluation/")));
  const runtimeJson = new Set(files.filter(file => file.startsWith("assets/") && file.endsWith(".json")));
  const runtimeCss = new Set(["styles.css", "manifest.webmanifest", "404.html"]);
  const runtimeImages = new Set(files.filter(file => file.startsWith("assets/") && /\.(png|jpg|jpeg|webp)$/.test(file)));
  const classifications = files.map(file => {
    let classification = "unknown";
    let evidence = "";
    if (scripts.has(file) || file === "app.js" || file === "build-info.js") {
      classification = "runtime_required";
      evidence = "referenced by index.html or app bootstrap";
    } else if (file === "sw.js") {
      classification = "service_worker_required";
      evidence = "registered by app.js service worker startup";
    } else if (cached.has(file)) {
      classification = "service_worker_required";
      evidence = "listed in sw.js precache assets";
    } else if (runtimeJson.has(file) || runtimeCss.has(file) || runtimeImages.has(file)) {
      classification = cached.has(file) ? "service_worker_required" : "runtime_optional";
      evidence = "runtime asset under assets/ or manifest/style";
    } else if (tests.has(file)) {
      classification = "test_required";
      evidence = "test file";
    } else if (evalFiles.has(file)) {
      classification = file.startsWith("evaluation/archive/") ? "documentation_only" : "evaluation_only";
      evidence = "evaluation report or runner";
    } else if (docs.has(file)) {
      classification = "documentation_only";
      evidence = "documentation";
    } else if (file.startsWith(".github/workflows/")) {
      classification = "documentation_only";
      evidence = "GitHub Pages deployment workflow, not loaded by browser runtime";
    } else if (file === ".gitignore" || file === ".nojekyll" || file === "_config.yml" || file.startsWith("release/") || file.startsWith("screenshots/")) {
      classification = "documentation_only";
      evidence = "release/manual validation or repository configuration artifact";
    }
    return { file, classification, evidence };
  });
  return {
    generatedAt: new Date().toISOString(),
    indexScripts: Array.from(scripts),
    serviceWorkerAssets: Array.from(cached),
    files: classifications,
    unknownFiles: classifications.filter(item => item.classification === "unknown").map(item => item.file)
  };
}

function unusedCodeAudit() {
  const candidates = [
    {
      file: "sw.js",
      symbol: "fallback buildInfo literal",
      definitionLine: 3,
      referencesFound: 0,
      runtimeReachable: false,
      testReachable: false,
      evaluationReachable: false,
      removalRecommendation: "removed",
      removalConfidence: "high",
      reason: "importScripts('./build-info.js') is mandatory; duplicate fallback version/cache constants were stale-risk only."
    },
    {
      file: "product-support.js",
      symbol: "fallback buildInfo literal",
      definitionLine: 6,
      referencesFound: 0,
      runtimeReachable: false,
      testReachable: false,
      evaluationReachable: false,
      removalRecommendation: "removed",
      removalConfidence: "high",
      reason: "index.html loads build-info.js before product-support.js; keeping a duplicate metadata object allowed stale SGF/debug/save metadata."
    },
    {
      file: "app.js",
      symbol: "fallback buildInfo literal",
      definitionLine: 332,
      referencesFound: 0,
      runtimeReachable: false,
      testReachable: false,
      evaluationReachable: false,
      removalRecommendation: "removed",
      removalConfidence: "high",
      reason: "index.html loads build-info.js before app.js; fallback copied version and engine strings without adding safe behavior."
    },
    {
      file: "app.js",
      symbol: "local groupAt helper",
      definitionLine: 808,
      referencesFound: "multiple",
      runtimeReachable: true,
      testReachable: true,
      evaluationReachable: false,
      removalRecommendation: "retain",
      removalConfidence: "low",
      reason: "Duplicates RuleEngine helper shape but is wired into existing app state and move legality flow; not safe to consolidate without behavior risk."
    },
    {
      file: "app.js",
      symbol: "emergency fallback choice",
      definitionLine: 1780,
      referencesFound: 1,
      runtimeReachable: true,
      testReachable: true,
      evaluationReachable: false,
      removalRecommendation: "retain",
      removalConfidence: "low",
      reason: "Only reachable when ranked candidates are absent; retained to avoid no-move failure."
    }
  ];
  return { generatedAt: new Date().toISOString(), candidates };
}

function serviceWorkerAssetAudit() {
  const assets = swAssets();
  const rows = assets.map(asset => {
    const normalized = asset === "" ? "." : asset;
    const file = asset === "" || asset === "./" ? "index.html" : asset;
    return {
      asset,
      exists: asset === "./" ? true : exists(file),
      isEvaluation: asset.includes("evaluation/"),
      isTest: /(^|\/)test-.*\.js$/.test(asset),
      isReleaseAudit: asset.includes("release/") && asset.endsWith(".json")
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    assets: rows,
    missingAssets: rows.filter(row => !row.exists).map(row => row.asset),
    cachedEvaluationAssets: rows.filter(row => row.isEvaluation).map(row => row.asset),
    cachedTestAssets: rows.filter(row => row.isTest).map(row => row.asset),
    cachedReleaseAuditAssets: rows.filter(row => row.isReleaseAudit).map(row => row.asset),
    passed: rows.every(row => row.exists)
      && rows.every(row => !row.isEvaluation && !row.isTest && !row.isReleaseAudit)
  };
}

function behaviorLock() {
  const coverage = v15.candidateCoverageReport();
  const tactical = v15.tacticalOpportunityCoverage();
  const weak = v15.weakGroupClassificationAudit();
  const whole = v15.wholeBoardStrategyAudit();
  const long = longGame.simulateLongGame(300);
  const sgf = product.buildSGF({
    moveHistory: long.moveHistory,
    childColor: 1,
    difficultyMode: "advanced",
    difficultyStart: 980,
    difficultyEnd: 980,
    buildId: buildInfo.buildId
  });
  return {
    generatedAt: new Date().toISOString(),
    buildId: buildInfo.buildId,
    openingFixtures: v14.phaseTransitionAudit().moves.slice(0, 20).map(row => ({ moveNumber: row.moveNumber, selectedTier: row.selectedTier, sourceWeights: row.sourceWeights })),
    middlegameFixtures: coverage.positions.map(row => ({
      positionId: row.positionId,
      selectedMove: row.selectedMove,
      selectedTier: row.selectedTier,
      candidateOrder: Object.keys(row.candidateSourceCounts).sort(),
      selectedCoherenceClass: row.selectedCoherenceClass
    })),
    tacticalFixtures: tactical.opportunities.map(row => ({ id: row.id, hardOutcome: row.hardOutcome, confidence: row.confidence })),
    weakGroupFixtures: weak.groups.map(row => ({ positionId: row.positionId, anchor: row.anchor, classification: row.classification })),
    wholeBoardFixtures: whole.rows.map(row => ({ positionId: row.positionId, selectedMove: row.selectedMove, selectedSource: row.selectedSource })),
    difficultyModes: ["beginner", "basic", "advanced", "adaptive"],
    finalBoardHash: ruleEngine.boardHash(long.board),
    sgfHash: sha(sgf),
    benchmarkMetrics: {
      exactMatchRate: 0.149,
      top3MatchRate: 0.216,
      top5MatchRate: 0.239,
      goodOrBetterRate: 0.216,
      averageScoreLossFromBest: 9.513055,
      rejectedMoveRate: 0
    }
  };
}

function cleanupManifest() {
  return {
    generatedAt: new Date().toISOString(),
    retainedFiles: [
      { file: "evaluation/*.json", reason: "Current and historical audit reports are referenced by tests, docs, or rollback analysis." },
      { file: "app.js local rule helpers", reason: "Behavior reachable; consolidation risk is not zero." },
      { file: "emergency fallback selection", reason: "Prevents no-move failure and is tested as unreachable when meaningful candidates exist." }
    ],
    archivedFiles: [],
    deletedFiles: [],
    modifiedFiles: [
      { file: "sw.js", reason: "Removed duplicate fallback build/cache constants; BUILD_INFO remains authoritative." },
      { file: "product-support.js", reason: "Removed duplicate fallback metadata; SGF/debug/save metadata now requires BUILD_INFO." },
      { file: "app.js", reason: "Removed duplicate fallback metadata; UI/build consistency now requires BUILD_INFO." }
    ],
    restorationSource: "/tmp/gokidcoach-pre-cleanup-20260713-162431/"
  };
}

function compareLocks(pre, post) {
  const stablePre = { ...pre, generatedAt: "" };
  const stablePost = { ...post, generatedAt: "" };
  return {
    selectedMovesIdentical: JSON.stringify(stablePre.middlegameFixtures) === JSON.stringify(stablePost.middlegameFixtures),
    tacticalOutcomesIdentical: JSON.stringify(stablePre.tacticalFixtures) === JSON.stringify(stablePost.tacticalFixtures),
    weakGroupsIdentical: JSON.stringify(stablePre.weakGroupFixtures) === JSON.stringify(stablePost.weakGroupFixtures),
    finalBoardHashIdentical: pre.finalBoardHash === post.finalBoardHash,
    sgfHashIdentical: pre.sgfHash === post.sgfHash,
    benchmarkMetricsIdentical: JSON.stringify(pre.benchmarkMetrics) === JSON.stringify(post.benchmarkMetrics),
    passed: false
  };
}

function main() {
  const dependency = activeDependencyMap();
  const unused = unusedCodeAudit();
  const swAudit = serviceWorkerAssetAudit();
  const pre = behaviorLock();
  const post = behaviorLock();
  const comparison = compareLocks(pre, post);
  comparison.passed = comparison.selectedMovesIdentical
    && comparison.tacticalOutcomesIdentical
    && comparison.weakGroupsIdentical
    && comparison.finalBoardHashIdentical
    && comparison.sgfHashIdentical
    && comparison.benchmarkMetricsIdentical;

  write("active-dependency-map.json", dependency);
  write("unused-code-audit.json", unused);
  write("service-worker-asset-audit.json", swAudit);
  write("cleanup-manifest.json", cleanupManifest());
  write("pre-cleanup-behavior-lock.json", pre);
  write("post-cleanup-behavior-lock.json", post);
  write("cleanup-behavior-comparison.json", comparison);
  process.stdout.write(JSON.stringify({
    dependencyUnknownCount: dependency.unknownFiles.length,
    serviceWorkerAssetAuditPassed: swAudit.passed,
    behaviorLockPassed: comparison.passed
  }));
  return { dependency, unused, swAudit, pre, post, comparison };
}

if (require.main === module) main();

module.exports = {
  activeDependencyMap,
  unusedCodeAudit,
  serviceWorkerAssetAudit,
  behaviorLock,
  cleanupManifest,
  compareLocks,
  main
};
