"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachLegacyEngineAdapter = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  function defaultLegacySelectMove(position) {
    const legalMoves = Array.isArray(position?.legalMoves) ? position.legalMoves : [];
    return legalMoves[0] || { pass: true };
  }

  class LegacyEngineAdapter {
    constructor(options = {}) {
      this.name = "legacy";
      this.selectMoveImpl = typeof options.selectMove === "function" ? options.selectMove : defaultLegacySelectMove;
      this.initialized = false;
      this.cancelled = false;
      this.lastError = null;
      this.lastMove = null;
    }

    async initialize(options = {}) {
      this.initialized = true;
      this.cancelled = false;
      this.initialOptions = { ...options };
      return this.getCapabilities();
    }

    async selectMove(position, options = {}) {
      this.cancelled = false;
      try {
        const move = await this.selectMoveImpl(position, options);
        this.lastMove = move || { pass: true };
        return this.lastMove;
      } catch (error) {
        this.lastError = error;
        throw error;
      }
    }

    cancelSearch() {
      this.cancelled = true;
      return { cancelled: true, engine: this.name };
    }

    getCapabilities() {
      return {
        engine: this.name,
        initialized: this.initialized,
        localBrowserOnly: true,
        neuralModel: false,
        mcts: false,
        webgpuRequired: false,
        productionDefault: true
      };
    }

    getDiagnostics() {
      return {
        engine: this.name,
        initialized: this.initialized,
        cancelled: this.cancelled,
        lastMove: this.lastMove,
        lastError: this.lastError ? String(this.lastError.message || this.lastError) : null
      };
    }

    dispose() {
      this.initialized = false;
      this.cancelled = false;
    }
  }

  return { LegacyEngineAdapter, defaultLegacySelectMove };
});
