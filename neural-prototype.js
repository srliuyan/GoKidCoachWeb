"use strict";

(async function initPrototypePage() {
  const managerModule = window.GoKidCoachEngineManager;
  const neuralModule = window.GoKidCoachNeuralMctsPrototypeEngine;
  const manager = new managerModule.EngineManager({ timeoutMs: 750 });
  const capabilities = neuralModule.detectStaticCapabilities(window);
  await manager.initialize({ preferNeural: false });

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function diagnostics() {
    return {
      prototypeVersion: neuralModule.prototypeVersion,
      architectureInitialized: true,
      modelIncluded: false,
      mctsImplemented: false,
      webgpuInferenceImplemented: false,
      serverDependency: false,
      paidApiDependency: false,
      productionNavigationChanged: false,
      capabilities,
      manager: manager.getDiagnostics()
    };
  }

  text("architectureStatus", "yes");
  text("webgpuStatus", capabilities.webgpuSupported ? "yes" : "no");
  text("wasmStatus", capabilities.webAssemblySupported ? "yes" : "no");
  text("workerStatus", capabilities.workerSupported ? "yes" : "no");
  text("activeEngine", manager.getActiveEngineName());
  text("fallbackStatus", manager.getDiagnostics().fallbackReason || "none");
  text("diagnosticsOutput", JSON.stringify(diagnostics(), null, 2));

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
