(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GoKidCoachProductSupport = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const appVersion = "1.0.0-rc1";
  const engineVersion = "baseline-v3.6-frozen";
  const dbName = "gokidcoach-v1";
  const dbVersion = 1;
  const currentGameStore = "currentGames";
  const diagnosticsStore = "diagnostics";
  const debugStore = "debugExports";

  const releaseConfig = {
    targetChildWinRateMin: 0.35,
    targetChildWinRateMax: 0.45,
    minimumCompletedGamesBeforeAdjustment: 3,
    preferredWindowGamesMin: 5,
    preferredWindowGamesMax: 10,
    maximumAdjustmentPerGame: 18,
    maximumAdjustmentDuringGame: 4
  };

  const difficultyModes = {
    beginner: { key: "beginner", label: "入门陪练", level: 640, targetRank: 2.7, description: "只在有意义的合法候选中放松选择。" },
    basic: { key: "basic", label: "基础陪练", level: 760, targetRank: 2.1, description: "通常选择好棋，允许少量可接受变化。" },
    advanced: { key: "advanced", label: "进阶陪练", level: 880, targetRank: 1.4, description: "接近冻结引擎的强候选选择。" },
    adaptive: { key: "adaptive", label: "自适应陪练", level: 880, targetRank: 1.8, description: "根据完成的真实对局缓慢调整。" }
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeDifficultyMode(value) {
    if (difficultyModes[value]) return value;
    const numeric = Number(value);
    if (numeric <= 680) return "beginner";
    if (numeric <= 820) return "basic";
    if (numeric <= 930) return "advanced";
    return "adaptive";
  }

  function difficultyModeConfig(value) {
    return difficultyModes[normalizeDifficultyMode(value)];
  }

  function adaptiveStatus(history, currentLevel) {
    const games = Array.isArray(history) ? history.filter(item => item && item.completed !== false).slice(0, releaseConfig.preferredWindowGamesMax) : [];
    if (games.length < releaseConfig.minimumCompletedGamesBeforeAdjustment) return "正在适应";
    const window = games.slice(0, Math.max(releaseConfig.preferredWindowGamesMin, Math.min(games.length, releaseConfig.preferredWindowGamesMax)));
    const wins = window.filter(item => item.childWon || item.result === "childWin" || item.result === "孩子胜").length;
    const rate = wins / Math.max(1, window.length);
    if (rate < releaseConfig.targetChildWinRateMin) return "将略微降低";
    if (rate > releaseConfig.targetChildWinRateMax) return "将略微提高";
    void currentLevel;
    return "难度稳定";
  }

  function boundedAdaptiveAdjustment(history, fallbackAdjustment = 0) {
    const status = adaptiveStatus(history);
    const fallback = clamp(Number(fallbackAdjustment) || 0, -releaseConfig.maximumAdjustmentPerGame, releaseConfig.maximumAdjustmentPerGame);
    if (status === "将略微降低") return Math.min(fallback, -6);
    if (status === "将略微提高") return Math.max(fallback, 6);
    if (status === "正在适应") return clamp(fallback, -6, 6);
    return clamp(fallback, -8, 8);
  }

  function openDb() {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise(resolve => {
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(currentGameStore)) db.createObjectStore(currentGameStore, { keyPath: "id" });
        if (!db.objectStoreNames.contains(diagnosticsStore)) db.createObjectStore(diagnosticsStore, { keyPath: "gameId" });
        if (!db.objectStoreNames.contains(debugStore)) db.createObjectStore(debugStore, { keyPath: "gameId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  async function idbPut(storeName, value) {
    const db = await openDb();
    if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  }

  async function idbGet(storeName, key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise(resolve => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  async function idbDelete(storeName, key) {
    const db = await openDb();
    if (!db) return false;
    return new Promise(resolve => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    });
  }

  function validateSnapshot(snapshot) {
    return snapshot
      && snapshot.size === 19
      && Array.isArray(snapshot.board)
      && snapshot.board.length === 19
      && snapshot.board.every(row => Array.isArray(row) && row.length === 19)
      && Array.isArray(snapshot.moveHistory);
  }

  async function saveCurrentGame(snapshot) {
    if (!validateSnapshot(snapshot)) return false;
    return idbPut(currentGameStore, {
      ...snapshot,
      appVersion,
      engineVersion,
      savedAt: Date.now()
    });
  }

  async function loadCurrentGame(id) {
    const snapshot = await idbGet(currentGameStore, id);
    return validateSnapshot(snapshot) ? snapshot : null;
  }

  async function clearCurrentGame(id) {
    return idbDelete(currentGameStore, id);
  }

  function escapeSgf(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
  }

  function sgfCoord(value) {
    return "abcdefghijklmnopqrstuvwxyz"[value] || "";
  }

  function buildSGF({
    size = 19,
    komi = 7,
    moveHistory = [],
    childName = "Child",
    childColor = 1,
    resultText = "?",
    difficultyMode = "adaptive",
    difficultyStart = 880,
    difficultyEnd = 880,
    date = new Date()
  }) {
    const blackName = childColor === 1 ? childName : "AI";
    const whiteName = childColor === 2 ? childName : "AI";
    const moves = moveHistory.map(item => {
      const color = item.color === 1 ? "B" : "W";
      if (item.pass) return `;${color}[]`;
      return `;${color}[${sgfCoord(item.x)}${sgfCoord(item.y)}]`;
    }).join("");
    const comment = [
      `difficultyMode=${difficultyMode}`,
      `difficultyStart=${difficultyStart}`,
      `difficultyEnd=${difficultyEnd}`,
      `appVersion=${appVersion}`,
      `engineVersion=${engineVersion}`
    ].join("; ");
    return `(;GM[1]FF[4]CA[UTF-8]AP[GoKidCoachWeb:${appVersion}]SZ[${size}]KM[${komi}]DT[${date.toISOString().slice(0, 10)}]PB[${escapeSgf(blackName)}]PW[${escapeSgf(whiteName)}]RE[${escapeSgf(resultText)}]C[${escapeSgf(comment)}]${moves})`;
  }

  function parseSgfMoves(sgf) {
    const moves = [];
    const regex = /;([BW])\[([a-z]{0,2})\]/g;
    let match;
    while ((match = regex.exec(sgf))) {
      const color = match[1] === "B" ? 1 : 2;
      const value = match[2];
      if (!value) moves.push({ color, pass: true, captures: 0 });
      else moves.push({ color, x: value.charCodeAt(0) - 97, y: value.charCodeAt(1) - 97, pass: false, captures: 0 });
    }
    return moves;
  }

  function replaySgf(sgf, simulateMove) {
    const moves = parseSgfMoves(sgf);
    const board = Array.from({ length: 19 }, () => Array(19).fill(0));
    const hashes = [];
    for (const move of moves) {
      if (move.pass) continue;
      const result = simulateMove(board, { x: move.x, y: move.y }, move.color, hashes);
      if (!result || !result.legal) return { legal: false, move, moves };
      for (let y = 0; y < 19; y += 1) {
        for (let x = 0; x < 19; x += 1) board[y][x] = result.board[y][x];
      }
      hashes.push(result.nextHash || "");
    }
    return { legal: true, board, moves };
  }

  function gameId() {
    return `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function diagnosticSummary(input) {
    const aiThinkTimes = Array.isArray(input.aiThinkTimes) ? input.aiThinkTimes.slice().sort((a, b) => a - b) : [];
    const average = aiThinkTimes.length ? aiThinkTimes.reduce((sum, value) => sum + value, 0) / aiThinkTimes.length : 0;
    const p95 = aiThinkTimes.length ? aiThinkTimes[Math.min(aiThinkTimes.length - 1, Math.floor(aiThinkTimes.length * 0.95))] : 0;
    return {
      gameId: input.gameId || gameId(),
      appVersion,
      engineVersion,
      date: input.date || new Date().toISOString(),
      childColor: input.childColor || "black",
      result: input.result || "unknown",
      completed: Boolean(input.completed),
      abandoned: Boolean(input.abandoned),
      moveCount: Number(input.moveCount) || 0,
      difficultyMode: input.difficultyMode || "adaptive",
      difficultyStart: Number(input.difficultyStart) || 0,
      difficultyEnd: Number(input.difficultyEnd) || 0,
      averageAiThinkTimeMs: Math.round(average),
      p95AiThinkTimeMs: Math.round(p95),
      maximumAiThinkTimeMs: Math.round(aiThinkTimes[aiThinkTimes.length - 1] || 0),
      restoreCount: Number(input.restoreCount) || 0,
      childIllegalAttemptCount: Number(input.childIllegalAttemptCount) || 0,
      aiRejectedCandidateCount: Number(input.aiRejectedCandidateCount) || 0,
      appCrashRecoveryFlag: Boolean(input.appCrashRecoveryFlag)
    };
  }

  async function saveDiagnostic(summary) {
    return idbPut(diagnosticsStore, summary);
  }

  async function saveDebugExport(payload) {
    return idbPut(debugStore, payload);
  }

  return {
    appVersion,
    engineVersion,
    releaseConfig,
    difficultyModes,
    normalizeDifficultyMode,
    difficultyModeConfig,
    adaptiveStatus,
    boundedAdaptiveAdjustment,
    openDb,
    saveCurrentGame,
    loadCurrentGame,
    clearCurrentGame,
    buildSGF,
    parseSgfMoves,
    replaySgf,
    diagnosticSummary,
    saveDiagnostic,
    saveDebugExport
  };
}));
