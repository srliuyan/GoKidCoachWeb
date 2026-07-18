"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./ai-engine-interface.js"),
      require("./legacy-engine-adapter.js"),
      require("./neural-mcts-prototype-engine.js")
    );
  } else {
    root.GoKidCoachEngineManager = factory(
      root.GoKidCoachAIEngineInterface,
      root.GoKidCoachLegacyEngineAdapter,
      root.GoKidCoachNeuralMctsPrototypeEngine
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function factory(interfaceModule, legacyModule, neuralModule) {
  const validateAIEngine = interfaceModule.validateAIEngine;
  const LegacyEngineAdapter = legacyModule.LegacyEngineAdapter;
  const NeuralMctsPrototypeEngine = neuralModule.NeuralMctsPrototypeEngine;

  function withTimeout(promise, timeoutMs, label) {
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

  function isPass(move) {
    return !move || move.pass === true || move.index === 361;
  }

  function moveIndex(move, boardSize = 19) {
    if (isPass(move)) return boardSize * boardSize;
    if (Number.isInteger(move?.index)) return move.index;
    const x = Number(move?.x);
    const y = Number(move?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    return y * boardSize + x;
  }

  function legalListContains(position, move) {
    if (!Array.isArray(position?.legalMoves) || !position.legalMoves.length) return true;
    const boardSize = Number(position.boardSize || 19);
    const selected = moveIndex(move, boardSize);
    return position.legalMoves.some(legal => moveIndex(legal, boardSize) === selected);
  }

  function isAllowedMove(position, move, options = {}) {
    if (!move) return false;
    const validator = typeof options.validateMove === "function"
      ? options.validateMove
      : typeof options.isLegalMove === "function"
        ? options.isLegalMove
        : null;
    if (validator) {
      const result = validator(move, position, options);
      if (result === false || result?.legal === false) return false;
    }
    return legalListContains(position, move);
  }

  class EngineManager {
    constructor(options = {}) {
      this.legacyEngine = options.legacyEngine || new LegacyEngineAdapter(options.legacyOptions || {});
      this.neuralEngineFactory = options.neuralEngineFactory || (() => new NeuralMctsPrototypeEngine(options.neuralOptions || {}));
      this.activeEngine = this.legacyEngine;
      this.fallbackReason = "default_legacy";
      this.timeoutMs = options.timeoutMs || 1000;
      this.activeRequest = null;
      this.requestSeq = 0;
      this.staleResponseCount = 0;
      this.lastError = null;
      this.initialized = false;
      if (!validateAIEngine(this.legacyEngine)) throw new Error("Legacy engine does not implement AIEngine");
    }

    async initialize(options = {}) {
      await this.legacyEngine.initialize(options.legacy || {});
      this.activeEngine = this.legacyEngine;
      this.fallbackReason = "default_legacy";
      if (options.preferNeural !== false) {
        try {
          const neural = this.neuralEngineFactory();
          if (!validateAIEngine(neural)) throw new Error("Neural engine does not implement AIEngine");
          await withTimeout(neural.initialize(options.neural || {}), options.timeoutMs || this.timeoutMs, "neural initialization");
          this.activeEngine = neural;
          this.fallbackReason = null;
        } catch (error) {
          this.lastError = error;
          this.activeEngine = this.legacyEngine;
          this.fallbackReason = "neural_initialization_failed";
        }
      }
      this.initialized = true;
      return this.getCapabilities();
    }

    async selectMove(position, options = {}) {
      if (this.activeRequest) {
        this.activeRequest.cancelled = true;
        this.activeEngine.cancelSearch();
      }
      this.requestSeq += 1;
      const request = { id: this.requestSeq, cancelled: false };
      this.activeRequest = request;
      const timeoutMs = options.timeoutMs || this.timeoutMs;
      try {
        const move = await withTimeout(this.activeEngine.selectMove(position, options), timeoutMs, "selectMove");
        if (this.activeRequest !== request || request.cancelled) {
          this.staleResponseCount += 1;
          const fallback = await this.legacyEngine.selectMove(position, { ...options, fallbackReason: "stale_response_rejected" });
          if (!isAllowedMove(position, fallback, options)) throw new Error("legacy fallback selected an illegal move after stale response");
          return fallback;
        }
        if (!isAllowedMove(position, move, options)) throw new Error("active engine selected an illegal move");
        this.activeRequest = null;
        return move;
      } catch (error) {
        this.lastError = error;
        this.fallbackReason = /timed out/.test(String(error.message || error)) ? "request_timeout" : "active_engine_failed";
        this.activeEngine = this.legacyEngine;
        this.activeRequest = null;
        const fallback = await this.legacyEngine.selectMove(position, { ...options, fallbackReason: this.fallbackReason });
        if (!isAllowedMove(position, fallback, options)) throw new Error("legacy fallback selected an illegal move");
        return fallback;
      }
    }

    cancelSearch() {
      if (this.activeRequest) this.activeRequest.cancelled = true;
      return this.activeEngine.cancelSearch();
    }

    getActiveEngineName() {
      return this.activeEngine?.name || "unknown";
    }

    getCapabilities() {
      return {
        initialized: this.initialized,
        activeEngine: this.getActiveEngineName(),
        fallbackReason: this.fallbackReason,
        legacy: this.legacyEngine.getCapabilities(),
        active: this.activeEngine.getCapabilities()
      };
    }

    getDiagnostics() {
      return {
        initialized: this.initialized,
        activeEngine: this.getActiveEngineName(),
        fallbackReason: this.fallbackReason,
        staleResponseCount: this.staleResponseCount,
        activeRequest: this.activeRequest ? { id: this.activeRequest.id, cancelled: this.activeRequest.cancelled } : null,
        lastError: this.lastError ? String(this.lastError.message || this.lastError) : null,
        legacy: this.legacyEngine.getDiagnostics(),
        active: this.activeEngine.getDiagnostics()
      };
    }

    dispose() {
      if (this.activeEngine && this.activeEngine !== this.legacyEngine) this.activeEngine.dispose();
      this.legacyEngine.dispose();
      this.activeRequest = null;
      this.initialized = false;
    }
  }

  return { EngineManager, withTimeout };
});
