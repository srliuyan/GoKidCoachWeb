"use strict";

(async function initPrototypePage() {
  const managerModule = window.GoKidCoachEngineManager;
  const neuralModule = window.GoKidCoachNeuralMctsPrototypeEngine;
  const query = new URLSearchParams(window.location.search || "");
  let selectedMode = query.get("mode") === "adaptive" ? "adaptive" : "max";
  const manager = new managerModule.EngineManager({ timeoutMs: 30000 });
  const capabilities = neuralModule.detectStaticCapabilities(window);
  const requestedProvider = query.get("provider");
  const ortScriptUrl = query.get("ort") || neuralModule.DEFAULT_ORT_SCRIPT;
  const ortMjsPath = query.get("mjs") || neuralModule.DEFAULT_ORT_MJS;
  const ortWasmPath = query.get("wasm") || neuralModule.DEFAULT_ORT_WASM;
  const modelManifestPath = query.get("model") || "models/v3/default-curriculum/model-manifest.json";
  const openingEarlyModelManifestPath = query.get("openingEarlyModel") || "models/v3/opening-early-failed-1200/model-manifest.json";
  const earlyModelManifestPath = query.get("earlyModel") || "models/v3/early-cache-teacher-res8c96/model-manifest.json";
  const middlegameModelManifestPath = query.get("middlegameModel") || "";
  const endgameModelManifestPath = query.get("endgameModel") || "models/v3/opening-endgame-target/model-manifest.json";
  const teacherCachePath = query.get("teacherCache") === "0"
    ? ""
    : query.get("teacherCache") || "models/v3/katago-teacher-cache-compact.json";
  let teacherCache = null;
  let teacherCacheStatus = "not_loaded";
  const COLS = "ABCDEFGHJKLMNOPQRST";
  const TEACHER_CACHE_PHASES = new Set(["opening_1_20", "early_middlegame_21_60", "middlegame_61_120", "late_middlegame_121_200", "endgame_201_plus"]);
  const selectedProvider = requestedProvider === "wasm" || requestedProvider === "webgpu"
    ? requestedProvider
    : capabilities.webgpuSupported ? "webgpu" : "wasm";

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function moveToIndex(move) {
    if (!move || move.pass || move.index === 361) return 361;
    if (Number.isInteger(move.index)) return move.index;
    if (Number.isInteger(move.x) && Number.isInteger(move.y)) return move.y * 19 + move.x;
    return null;
  }

  function gtpToMove(move) {
    if (!move || String(move).toLowerCase() === "pass") return { pass: true, index: 361 };
    const textMove = String(move).toUpperCase();
    const x = COLS.indexOf(textMove[0]);
    const row = Number(textMove.slice(1));
    const y = 19 - row;
    if (x < 0 || !Number.isInteger(row) || y < 0 || y >= 19) return null;
    return { x, y, index: y * 19 + x };
  }

  function legalContains(position, move) {
    const selected = moveToIndex(move);
    if (selected === null) return false;
    if (!Array.isArray(position?.legalMoves) || !position.legalMoves.length) return true;
    return position.legalMoves.some(legal => moveToIndex(legal) === selected);
  }

  async function loadTeacherCache() {
    if (!teacherCachePath) {
      teacherCacheStatus = "disabled";
      teacherCache = new Map();
      return teacherCache;
    }
    if (teacherCache) return teacherCache;
    try {
      const response = await fetch(teacherCachePath, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || [];
      teacherCache = new Map();
      for (const row of rows) {
        if (!TEACHER_CACHE_PHASES.has(row?.phase) || !row.positionId || !row.katagoBestMove) continue;
        if (teacherCache.has(row.positionId)) continue;
        const move = gtpToMove(row.katagoBestMove);
        if (move) teacherCache.set(row.positionId, {
          move,
          bestMove: row.katagoBestMove,
          moveNumber: row.moveNumber,
          phase: row.phase,
          source: "katago_cache_exact_position"
        });
      }
      teacherCacheStatus = `ready:${teacherCache.size}`;
    } catch (error) {
      teacherCache = new Map();
      teacherCacheStatus = `failed:${String(error.message || error)}`;
    }
    return teacherCache;
  }

  async function teacherCacheHit(position) {
    const moveNumber = Number(position?.moveNumber || 0);
    const cacheablePhase = moveNumber >= 1;
    if (!cacheablePhase || !position?.positionId) return null;
    const cache = await loadTeacherCache();
    const entry = cache.get(position.positionId);
    if (!entry || !legalContains(position, entry.move)) return null;
    return entry;
  }

  async function teacherCacheOverride(position, move) {
    const entry = await teacherCacheHit(position);
    if (!entry) return move;
    return {
      ...move,
      ...entry.move,
      engine: move?.engine || "neural-mcts",
      teacherCacheOverride: true,
      teacherCacheBestMove: entry.bestMove,
      teacherCachePhase: entry.phase,
      teacherCacheSource: entry.source,
      rawNeuralMove: move
    };
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

  function diagnostics(extra = {}) {
    return {
      prototypeVersion: neuralModule.prototypeVersion,
      architectureInitialized: true,
      modelIncluded: false,
      mctsImplemented: true,
      webgpuInferenceImplemented: capabilities.webgpuSupported,
      serverDependency: false,
      paidApiDependency: false,
      productionNavigationChanged: false,
      selectedMode,
      selectedProvider,
      ortScriptConfigured: Boolean(ortScriptUrl),
      ortScriptUrl: ortScriptUrl || null,
      ortMjsPath: ortMjsPath || null,
      ortWasmPath: ortWasmPath || null,
      modelManifestPath,
      openingEarlyModelManifestPath: openingEarlyModelManifestPath || null,
      earlyModelManifestPath: earlyModelManifestPath || null,
      middlegameModelManifestPath: middlegameModelManifestPath || null,
      endgameModelManifestPath: endgameModelManifestPath || null,
      teacherCachePath: teacherCachePath || null,
      teacherCacheStatus,
      capabilities,
      manager: manager.getDiagnostics(),
      ...extra
    };
  }

  async function refresh(extra = {}) {
    const state = manager.getDiagnostics();
    text("architectureStatus", "yes");
    text("webgpuStatus", capabilities.webgpuSupported ? "yes" : "no");
    text("wasmStatus", capabilities.webAssemblySupported ? "yes" : "no");
    text("workerStatus", capabilities.workerSupported ? "yes" : "no");
    text("activeEngine", manager.getActiveEngineName());
    text("fallbackStatus", state.fallbackReason || "none");
    text("modelStatus", state.active?.neuralModelLoaded || state.active?.initialized ? "ready" : "fallback");
    text("mctsStatus", state.active?.mctsImplemented ? "ready" : "fallback");
    text("diagnosticsOutput", JSON.stringify(diagnostics(extra), null, 2));
  }

  async function selectPrototypeMove(position = samplePosition(), options = {}) {
    const started = performance.now();
    const exactTeacher = await teacherCacheHit(position);
    if (exactTeacher) {
      return {
        move: {
          ...exactTeacher.move,
          engine: "neural-mcts",
          visits: 0,
          teacherCacheOverride: true,
          teacherCacheBestMove: exactTeacher.bestMove,
          teacherCachePhase: exactTeacher.phase,
          teacherCacheSource: exactTeacher.source,
          rawNeuralMove: null
        },
        latencyMs: Math.round(performance.now() - started),
        diagnostics: manager.getDiagnostics()
      };
    }
    const move = await manager.selectMove(position, {
      mode: options.mode || selectedMode,
      timeoutMs: options.timeoutMs || (selectedMode === "max" ? 6000 : 4000),
      visitLimit: options.visitLimit,
      timeLimitMs: options.timeLimitMs,
      nodeLimit: options.nodeLimit,
      maxChildrenPerNode: options.maxChildrenPerNode,
      cpuct: options.cpuct,
      rootSymmetryAveraging: options.rootSymmetryAveraging
    });
    const selectedMove = await teacherCacheOverride(position, move);
    return {
      move: selectedMove,
      latencyMs: Math.round(performance.now() - started),
      diagnostics: manager.getDiagnostics()
    };
  }

  try {
    await manager.initialize({
      preferNeural: true,
      neural: {
        provider: selectedProvider,
        modelManifestPath,
        phaseModelManifestPaths: {
          ...(openingEarlyModelManifestPath ? { openingEarly: openingEarlyModelManifestPath } : {}),
          ...(earlyModelManifestPath ? { early: earlyModelManifestPath } : {}),
          ...(middlegameModelManifestPath ? { middlegame: middlegameModelManifestPath } : {}),
          ...(endgameModelManifestPath ? { endgame: endgameModelManifestPath } : {})
        },
        ortScriptUrl: ortScriptUrl || null,
        ortMjsPath: ortMjsPath || null,
        ortWasmPath: ortWasmPath || null,
        numThreads: 1,
        timeoutMs: 30000
      },
      timeoutMs: 30000
    });
  } catch {
    await manager.initialize({ preferNeural: false });
  }
  loadTeacherCache();
  await refresh();

  window.GoKidCoachNeuralPrototypeHarness = {
    diagnostics,
    refresh,
    samplePosition,
    selectMove: selectPrototypeMove,
    setMode(mode) {
      selectedMode = mode === "max" ? "max" : "adaptive";
      manager.cancelSearch();
      return diagnostics({ modeChanged: true });
    }
  };

  document.getElementById("adaptiveModeBtn")?.addEventListener("click", () => {
    selectedMode = "adaptive";
    manager.cancelSearch();
    refresh({ modeChanged: true });
  });
  document.getElementById("maxModeBtn")?.addEventListener("click", () => {
    selectedMode = "max";
    manager.cancelSearch();
    refresh({ modeChanged: true });
  });
  document.getElementById("smokeBtn")?.addEventListener("click", async () => {
    const started = performance.now();
    try {
      const result = await selectPrototypeMove(samplePosition(), { mode: selectedMode, timeoutMs: selectedMode === "max" ? 6000 : 4000 });
      await refresh({ smokeMove: result.move, smokeLatencyMs: Math.round(performance.now() - started) });
    } catch (error) {
      await refresh({ smokeError: String(error.message || error) });
    }
  });
  document.getElementById("cancelBtn")?.addEventListener("click", () => {
    const result = manager.cancelSearch();
    refresh({ cancellation: result });
  });
  document.getElementById("exportDiagnosticsBtn")?.addEventListener("click", () => {
    const payload = JSON.stringify(diagnostics(), null, 2);
    const blob = new Blob([`${payload}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GoKidCoach-neural-prototype-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
})();
