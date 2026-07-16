"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachNeuralMctsPrototypeEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const prototypeVersion = "3.0.0-architecture-scaffold";

  function detectStaticCapabilities(scope = globalThis) {
    const navigatorLike = scope.navigator || {};
    return {
      engine: "neural-mcts-prototype",
      prototypeVersion,
      architectureOnly: true,
      neuralModelLoaded: false,
      mctsImplemented: false,
      webgpuSupported: Boolean(navigatorLike.gpu),
      webAssemblySupported: typeof scope.WebAssembly === "object",
      workerSupported: typeof scope.Worker === "function",
      indexedDbSupported: typeof scope.indexedDB !== "undefined",
      cacheStorageSupported: Boolean(scope.caches),
      serviceWorkerSupported: Boolean(navigatorLike.serviceWorker),
      sharedArrayBufferSupported: typeof scope.SharedArrayBuffer === "function",
      crossOriginIsolated: Boolean(scope.crossOriginIsolated),
      hardwareConcurrency: navigatorLike.hardwareConcurrency || null,
      deviceMemory: navigatorLike.deviceMemory || null,
      serverDependency: false,
      paidApiDependency: false,
      kataGoRuntimeDependency: false
    };
  }

  class NeuralMctsPrototypeEngine {
    constructor(options = {}) {
      this.name = "neural-mcts-prototype";
      this.workerUrl = options.workerUrl || "engine/neural-mcts-worker.js";
      this.workerFactory = options.workerFactory || null;
      this.worker = null;
      this.initialized = false;
      this.cancelled = false;
      this.lastError = null;
      this.requestSeq = 0;
      this.activeRequestId = null;
      this.capabilities = detectStaticCapabilities(options.scope || globalThis);
    }

    async initialize(options = {}) {
      this.initialized = true;
      this.cancelled = false;
      this.initializeOptions = { ...options };
      if (options.createWorker === true && this.capabilities.workerSupported) {
        this.worker = this.workerFactory ? this.workerFactory(this.workerUrl) : new Worker(this.workerUrl);
      }
      return this.getCapabilities();
    }

    async selectMove() {
      this.cancelled = false;
      this.requestSeq += 1;
      this.activeRequestId = this.requestSeq;
      const error = new Error("Neural MCTS prototype is architecture-only; no model or search is implemented");
      this.lastError = error;
      throw error;
    }

    cancelSearch() {
      this.cancelled = true;
      this.activeRequestId = null;
      if (this.worker && typeof this.worker.postMessage === "function") {
        this.worker.postMessage({ type: "cancel" });
      }
      return { cancelled: true, engine: this.name };
    }

    getCapabilities() {
      return { ...this.capabilities, initialized: this.initialized };
    }

    getDiagnostics() {
      return {
        engine: this.name,
        prototypeVersion,
        initialized: this.initialized,
        architectureOnly: true,
        neuralModelLoaded: false,
        mctsImplemented: false,
        cancelled: this.cancelled,
        activeRequestId: this.activeRequestId,
        lastError: this.lastError ? String(this.lastError.message || this.lastError) : null,
        capabilities: this.getCapabilities()
      };
    }

    dispose() {
      if (this.worker && typeof this.worker.terminate === "function") this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.activeRequestId = null;
    }
  }

  return { NeuralMctsPrototypeEngine, detectStaticCapabilities, prototypeVersion };
});
