"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachNeuralMctsPrototypeEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const prototypeVersion = "3-fast-track-browser-inference";
  const DEFAULT_MODEL_MANIFEST = "models/student-res6c64-fp16.dev.json";
  const DEFAULT_ORT_SCRIPT = "vendor/onnxruntime-web/1.27.0/ort.wasm.min.js";
  const DEFAULT_ORT_MJS = "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.mjs";
  const DEFAULT_ORT_WASM = "vendor/onnxruntime-web/1.27.0/ort-wasm-simd-threaded.wasm";
  const DEFAULT_MODES = {
    adaptive: { visits: 96, timeMs: 1800, maxTimeMs: 3000, nodeLimit: 512, maxChildrenPerNode: 10 },
    max: { visits: 256, timeMs: 3500, maxTimeMs: 5000, nodeLimit: 1024, maxChildrenPerNode: 16 }
  };

  function detectStaticCapabilities(scope = globalThis) {
    const navigatorLike = scope.navigator || {};
    return {
      engine: "neural-mcts-prototype",
      prototypeVersion,
      architectureOnly: false,
      neuralModelLoaded: false,
      mctsImplemented: true,
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

  function withTimer(promise, timeoutMs, label) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      promise.then(
        value => {
          clearTimeout(timer);
          resolve(value);
        },
        error => {
          clearTimeout(timer);
          reject(error);
        }
      );
    });
  }

  async function loadJson(path, scope = globalThis) {
    if (typeof scope.fetch === "function") {
      const response = await scope.fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Failed to load model manifest: ${response.status}`);
      return response.json();
    }
    throw new Error("fetch is unavailable for model manifest loading");
  }

  function resolveUrl(path, scope = globalThis, base = null) {
    if (!path || typeof URL !== "function") return path;
    try {
      return new URL(path, base || scope.location?.href || undefined).href;
    } catch {
      return path;
    }
  }

  class NeuralMctsPrototypeEngine {
    constructor(options = {}) {
      this.name = "neural-mcts";
      this.workerUrl = options.workerUrl || "engine/neural-mcts-worker.js";
      this.workerFactory = options.workerFactory || null;
      this.worker = null;
      this.scope = options.scope || globalThis;
      this.initialized = false;
      this.cancelled = false;
      this.lastError = null;
      this.requestSeq = 0;
      this.activeRequestId = null;
      this.pending = new Map();
      this.staleResponseCount = 0;
      this.modelManifestPath = options.modelManifestPath || DEFAULT_MODEL_MANIFEST;
      this.currentModelManifestPath = null;
      this.phaseModelManifestPaths = options.phaseModelManifestPaths || {};
      this.modelManifest = options.modelManifest || null;
      this.provider = options.provider || "webgpu";
      this.ortScriptUrl = options.ortScriptUrl || DEFAULT_ORT_SCRIPT;
      this.ortMjsPath = options.ortMjsPath || DEFAULT_ORT_MJS;
      this.ortWasmPath = options.ortWasmPath || DEFAULT_ORT_WASM;
      this.numThreads = options.numThreads || 1;
      this.capabilities = detectStaticCapabilities(this.scope);
      this.lastResult = null;
      this.mockSession = options.mockSession || null;
      this.lastInitializeOptions = null;
    }

    makeWorker() {
      if (this.workerFactory) return this.workerFactory(this.workerUrl);
      if (typeof this.scope.Worker !== "function") throw new Error("Web Worker is unavailable");
      return new this.scope.Worker(this.workerUrl);
    }

    postAndWait(message, timeoutMs = 5000) {
      const requestId = message.requestId || ++this.requestSeq;
      const payload = { ...message, requestId };
      return withTimer(new Promise((resolve, reject) => {
        this.pending.set(requestId, { resolve, reject });
        this.worker.postMessage(payload);
      }), timeoutMs, `${message.type || "worker request"} ${requestId}`);
    }

    handleWorkerMessage(event) {
      const response = event.data || event;
      const requestId = response.requestId;
      const pending = this.pending.get(requestId);
      if (!pending) {
        this.staleResponseCount += 1;
        return;
      }
      this.pending.delete(requestId);
      if (response.ok === false || response.type === "error") pending.reject(new Error(response.message || response.code || "worker request failed"));
      else pending.resolve(response);
    }

    handleWorkerError(error) {
      this.lastError = error;
      for (const pending of this.pending.values()) pending.reject(error instanceof Error ? error : new Error(String(error)));
      this.pending.clear();
    }

    async initialize(options = {}) {
      this.lastInitializeOptions = { ...options, modelManifest: null };
      this.phaseModelManifestPaths = options.phaseModelManifestPaths || this.phaseModelManifestPaths || {};
      this.provider = options.provider || this.provider;
      const modelManifestPath = options.modelManifestPath || this.modelManifestPath;
      this.modelManifestPath = modelManifestPath;
      this.currentModelManifestPath = modelManifestPath;
      const modelManifestUrl = resolveUrl(modelManifestPath, this.scope);
      this.ortScriptUrl = resolveUrl(options.ortScriptUrl || this.ortScriptUrl, this.scope);
      this.ortMjsPath = resolveUrl(options.ortMjsPath || this.ortMjsPath, this.scope);
      this.ortWasmPath = resolveUrl(options.ortWasmPath || this.ortWasmPath, this.scope);
      this.numThreads = Number.isFinite(Number(options.numThreads)) ? Number(options.numThreads) : this.numThreads;
      this.modelManifest = options.modelManifest || this.modelManifest || await loadJson(modelManifestUrl, this.scope);
      if (this.modelManifest?.modelPath) {
        this.modelManifest = {
          ...this.modelManifest,
          modelPath: resolveUrl(this.modelManifest.modelPath, this.scope)
        };
      }
      this.worker = this.makeWorker();
      if (typeof this.worker.addEventListener === "function") {
        this.worker.addEventListener("message", event => this.handleWorkerMessage(event));
        this.worker.addEventListener("error", event => this.handleWorkerError(event.error || event.message || event));
      } else {
        this.worker.onmessage = event => this.handleWorkerMessage(event);
        this.worker.onerror = error => this.handleWorkerError(error);
      }
      const response = await this.postAndWait({
        type: "initialize",
        manifest: this.modelManifest,
        provider: this.provider,
        ortScriptUrl: this.ortScriptUrl,
        ortMjsPath: this.ortMjsPath,
        ortWasmPath: this.ortWasmPath,
        numThreads: this.numThreads,
        mockSession: this.mockSession
      }, options.timeoutMs || 10000);
      if (response.ok === false) throw new Error(response.message || response.code || "neural initialization failed");
      this.initialized = true;
      this.capabilities.neuralModelLoaded = true;
      this.capabilities.activeProvider = response.provider || this.provider;
      return this.getCapabilities();
    }

    modeBudget(mode, overrides = {}) {
      const key = mode === "max" || mode === "MAX_STRENGTH_FIXED" || mode === "当前最高棋力" ? "max" : "adaptive";
      return { ...DEFAULT_MODES[key], ...overrides, mode: key };
    }

    phaseModelPathFor(position, options = {}) {
      const phasePaths = options.phaseModelManifestPaths || this.phaseModelManifestPaths || {};
      const moveNumber = Number(position?.moveNumber || 0);
      if (moveNumber <= 20 && (phasePaths.opening || phasePaths.openingEarly)) return phasePaths.opening || phasePaths.openingEarly;
      if (moveNumber <= 60 && phasePaths.early) return phasePaths.early;
      if (moveNumber <= 120 && phasePaths.middlegame) return phasePaths.middlegame;
      if (moveNumber >= 201 && phasePaths.endgame) return phasePaths.endgame;
      return options.modelManifestPath || this.modelManifestPath;
    }

    async ensureModelForPosition(position, options = {}) {
      const desiredPath = this.phaseModelPathFor(position, options);
      if (!desiredPath || desiredPath === this.currentModelManifestPath) return;
      if (this.activeRequestId) this.cancelSearch();
      const initOptions = {
        ...(this.lastInitializeOptions || {}),
        modelManifestPath: desiredPath,
        phaseModelManifestPaths: this.phaseModelManifestPaths,
        provider: this.provider,
        timeoutMs: options.modelSwitchTimeoutMs || options.timeoutMs || 30000
      };
      this.dispose();
      this.modelManifest = null;
      await this.initialize(initOptions);
    }

    async selectMove(position, options = {}) {
      const desiredModelPath = this.phaseModelPathFor(position, options);
      if (desiredModelPath && desiredModelPath !== this.currentModelManifestPath) {
        await this.ensureModelForPosition(position, options);
      }
      if (!this.initialized || !this.worker) throw new Error("Neural engine is not initialized");
      if (this.activeRequestId) this.cancelSearch();
      this.cancelled = false;
      const requestId = ++this.requestSeq;
      this.activeRequestId = requestId;
      const budget = this.modeBudget(options.mode || options.difficultyMode, options.budget || {});
      const response = await this.postAndWait({
        type: "search",
        position,
        options: {
          ...options,
          mode: budget.mode,
          budget,
          visitLimit: options.visitLimit || budget.visits,
          timeLimitMs: options.timeLimitMs || budget.timeMs,
          nodeLimit: options.nodeLimit || budget.nodeLimit,
          maxChildrenPerNode: options.maxChildrenPerNode || budget.maxChildrenPerNode
        },
        requestId
      }, Math.min(budget.maxTimeMs + 1000, (options.timeoutMs || budget.maxTimeMs + 1000)));
      if (this.activeRequestId !== requestId || response.stale) {
        this.staleResponseCount += 1;
        throw new Error("stale neural response rejected");
      }
      this.activeRequestId = null;
      this.lastResult = response;
      return {
        ...(response.move || { pass: true }),
        engine: this.name,
        provider: response.provider,
        visits: response.visits,
        value: response.value,
        score: response.score,
        policyTop: response.policyTop,
        rawLogitTop: response.rawLogitTop,
        candidates: response.candidates
      };
    }

    cancelSearch() {
      this.cancelled = true;
      const requestId = this.activeRequestId;
      this.activeRequestId = null;
      if (requestId && this.pending.has(requestId)) {
        const pending = this.pending.get(requestId);
        this.pending.delete(requestId);
        pending.reject(new Error("neural search cancelled"));
      }
      if (this.worker && typeof this.worker.postMessage === "function") this.worker.postMessage({ type: "cancel", requestId });
      return { cancelled: true, engine: this.name, requestId };
    }

    getCapabilities() {
      return {
        ...this.capabilities,
        initialized: this.initialized,
        modelManifestId: this.modelManifest?.id || null,
        currentModelManifestPath: this.currentModelManifestPath,
        phaseModelManifestPaths: this.phaseModelManifestPaths,
        modelFormat: this.modelManifest?.modelFormat || null,
        defaultModelManifest: DEFAULT_MODEL_MANIFEST,
        modes: ["自适应对弈", "当前最高棋力"],
        legacyFallbackRequired: !this.initialized
      };
    }

    getDiagnostics() {
      return {
        engine: this.name,
        prototypeVersion,
        initialized: this.initialized,
        architectureOnly: false,
        neuralModelLoaded: this.initialized,
        mctsImplemented: true,
        cancelled: this.cancelled,
        activeRequestId: this.activeRequestId,
        staleResponseCount: this.staleResponseCount,
        pendingRequestCount: this.pending.size,
        provider: this.capabilities.activeProvider || this.provider,
        ortScriptConfigured: Boolean(this.ortScriptUrl),
        ortScriptUrl: this.ortScriptUrl || null,
        ortMjsPath: this.ortMjsPath || null,
        ortWasmPath: this.ortWasmPath || null,
        numThreads: this.numThreads,
        modelManifestId: this.modelManifest?.id || null,
        currentModelManifestPath: this.currentModelManifestPath,
        phaseModelManifestPaths: this.phaseModelManifestPaths,
        lastResult: this.lastResult ? {
          move: this.lastResult.move,
          visits: this.lastResult.visits,
          nodeCount: this.lastResult.nodeCount,
          elapsedMs: this.lastResult.elapsedMs,
          legalMoveCount: this.lastResult.legalMoveCount,
          policyTop: this.lastResult.policyTop,
          rawLogitTop: this.lastResult.rawLogitTop,
          candidates: this.lastResult.candidates
        } : null,
        lastError: this.lastError ? String(this.lastError.message || this.lastError) : null,
        capabilities: this.getCapabilities()
      };
    }

    dispose() {
      for (const pending of this.pending.values()) pending.reject(new Error("neural engine disposed"));
      this.pending.clear();
      if (this.worker && typeof this.worker.terminate === "function") this.worker.terminate();
      this.worker = null;
      this.initialized = false;
      this.activeRequestId = null;
    }
  }

  return { NeuralMctsPrototypeEngine, detectStaticCapabilities, prototypeVersion, DEFAULT_MODEL_MANIFEST, DEFAULT_ORT_SCRIPT, DEFAULT_ORT_MJS, DEFAULT_ORT_WASM, DEFAULT_MODES };
});
