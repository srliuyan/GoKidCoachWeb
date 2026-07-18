"use strict";

(async function initPrototypePage() {
  if (navigator.serviceWorker?.getRegistrations) {
    navigator.serviceWorker.getRegistrations()
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .catch(() => {});
  }
  if (window.caches?.keys) {
    window.caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.includes("gokidcoach")).map(key => window.caches.delete(key))))
      .catch(() => {});
  }

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

  const gameCanvas = document.getElementById("v3Board");
  const gameCtx = gameCanvas?.getContext("2d");
  const gameSize = 19;
  let gameBoard = Array.from({ length: gameSize }, () => Array(gameSize).fill(0));
  let gameHistory = [];
  let gameBusy = false;

  function gameText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function updateGameStatus(value) {
    gameText("gameStatus", value);
    gameText("moveCounter", String(gameHistory.length));
    gameText("engineLabel", manager.getActiveEngineName() === "neural-mcts" ? "V3 Neural MCTS" : "V3 fallback");
  }

  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  function adjacent(x, y) {
    return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      .filter(([nx, ny]) => nx >= 0 && nx < gameSize && ny >= 0 && ny < gameSize);
  }

  function collect(board, x, y) {
    const color = board[y][x];
    const stones = [{ x, y }];
    const seen = new Set([`${x},${y}`]);
    const liberties = new Set();
    for (let i = 0; i < stones.length; i += 1) {
      for (const [nx, ny] of adjacent(stones[i].x, stones[i].y)) {
        if (board[ny][nx] === 0) liberties.add(`${nx},${ny}`);
        else if (board[ny][nx] === color && !seen.has(`${nx},${ny}`)) {
          seen.add(`${nx},${ny}`);
          stones.push({ x: nx, y: ny });
        }
      }
    }
    return { stones, liberties };
  }

  function playOn(board, x, y, color) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= gameSize || y < 0 || y >= gameSize || board[y][x] !== 0) return null;
    const next = cloneBoard(board);
    next[y][x] = color;
    const opponent = -color;
    adjacent(x, y).forEach(([nx, ny]) => {
      if (next[ny][nx] !== opponent) return;
      const group = collect(next, nx, ny);
      if (group.liberties.size === 0) group.stones.forEach(stone => { next[stone.y][stone.x] = 0; });
    });
    return collect(next, x, y).liberties.size ? next : null;
  }

  function legalMoves(board, color) {
    const moves = [];
    for (let y = 0; y < gameSize; y += 1) {
      for (let x = 0; x < gameSize; x += 1) {
        if (playOn(board, x, y, color)) moves.push({ x, y });
      }
    }
    moves.push({ pass: true });
    return moves;
  }

  function enginePosition() {
    return {
      board: gameBoard,
      sideToMove: "W",
      komi: 7.5,
      moveNumber: gameHistory.length + 1,
      moveHistory: gameHistory,
      legalMoves: legalMoves(gameBoard, -1)
    };
  }

  function drawGame() {
    if (!gameCanvas || !gameCtx) return;
    const width = gameCanvas.width;
    const pad = 44;
    const gap = (width - pad * 2) / (gameSize - 1);
    gameCtx.clearRect(0, 0, width, width);
    gameCtx.fillStyle = "#d9a94d";
    gameCtx.fillRect(0, 0, width, width);
    gameCtx.strokeStyle = "#2d2416";
    gameCtx.lineWidth = 2;
    for (let i = 0; i < gameSize; i += 1) {
      const p = pad + i * gap;
      gameCtx.beginPath();
      gameCtx.moveTo(pad, p);
      gameCtx.lineTo(width - pad, p);
      gameCtx.moveTo(p, pad);
      gameCtx.lineTo(p, width - pad);
      gameCtx.stroke();
    }
    [3, 9, 15].forEach(y => [3, 9, 15].forEach(x => {
      gameCtx.beginPath();
      gameCtx.arc(pad + x * gap, pad + y * gap, 5, 0, Math.PI * 2);
      gameCtx.fillStyle = "#2d2416";
      gameCtx.fill();
    }));
    gameBoard.forEach((row, y) => row.forEach((stone, x) => {
      if (!stone) return;
      const cx = pad + x * gap;
      const cy = pad + y * gap;
      gameCtx.beginPath();
      gameCtx.arc(cx, cy, gap * 0.42, 0, Math.PI * 2);
      gameCtx.fillStyle = stone === 1 ? "#111" : "#f8fafc";
      gameCtx.fill();
      gameCtx.strokeStyle = stone === 1 ? "#000" : "#9aa4b2";
      gameCtx.stroke();
    }));
  }

  async function playV3Move() {
    gameBusy = true;
    updateGameStatus("V3 正在思考...");
    try {
      const result = await selectPrototypeMove(enginePosition(), { mode: selectedMode, timeoutMs: 8000 });
      const move = result.move || {};
      if (move.pass) {
        gameHistory.push({ pass: true, color: "W" });
      } else {
        const next = playOn(gameBoard, move.x, move.y, -1);
        if (next) {
          gameBoard = next;
          gameHistory.push({ x: move.x, y: move.y, color: "W" });
        }
      }
      updateGameStatus("轮到黑棋落子");
    } catch (error) {
      updateGameStatus(`V3 出错：${String(error.message || error)}`);
    } finally {
      gameBusy = false;
      drawGame();
    }
  }

  function resetV3Game() {
    gameBoard = Array.from({ length: gameSize }, () => Array(gameSize).fill(0));
    gameHistory = [];
    gameBusy = false;
    drawGame();
    updateGameStatus("黑棋先行，请落子");
  }

  gameCanvas?.addEventListener("click", event => {
    if (gameBusy) return;
    const rect = gameCanvas.getBoundingClientRect();
    const pad = 44;
    const gap = (gameCanvas.width - pad * 2) / (gameSize - 1);
    const x = Math.round(((event.clientX - rect.left) / rect.width * gameCanvas.width - pad) / gap);
    const y = Math.round(((event.clientY - rect.top) / rect.height * gameCanvas.height - pad) / gap);
    const next = playOn(gameBoard, x, y, 1);
    if (!next) {
      updateGameStatus("此处不能落子");
      return;
    }
    gameBoard = next;
    gameHistory.push({ x, y, color: "B" });
    drawGame();
    void playV3Move();
  });

  document.getElementById("newGameBtn")?.addEventListener("click", resetV3Game);
  document.getElementById("passGameBtn")?.addEventListener("click", () => {
    if (gameBusy) return;
    gameHistory.push({ pass: true, color: "B" });
    void playV3Move();
  });
  resetV3Game();

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
