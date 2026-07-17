"use strict";

(async function initPrototypePage() {
  const managerModule = window.GoKidCoachEngineManager;
  const neuralModule = window.GoKidCoachNeuralMctsPrototypeEngine;
  let selectedMode = "adaptive";
  const manager = new managerModule.EngineManager({ timeoutMs: 6500 });
  const capabilities = neuralModule.detectStaticCapabilities(window);

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
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

  try {
    await manager.initialize({
      preferNeural: true,
      neural: {
        provider: capabilities.webgpuSupported ? "webgpu" : "wasm",
        modelManifestPath: "models/student-res6c64-fp16.dev.json",
        timeoutMs: 10000
      },
      timeoutMs: 10000
    });
  } catch {
    await manager.initialize({ preferNeural: false });
  }
  await refresh();

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
      const move = await manager.selectMove(samplePosition(), { mode: selectedMode, timeoutMs: selectedMode === "max" ? 6000 : 4000 });
      await refresh({ smokeMove: move, smokeLatencyMs: Math.round(performance.now() - started) });
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
