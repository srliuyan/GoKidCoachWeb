"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachAIEngineInterface = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const requiredMethods = [
    "initialize",
    "selectMove",
    "cancelSearch",
    "getCapabilities",
    "getDiagnostics",
    "dispose"
  ];

  class AIEngine {
    async initialize() {
      throw new Error("AIEngine.initialize must be implemented by an adapter");
    }

    async selectMove() {
      throw new Error("AIEngine.selectMove must be implemented by an adapter");
    }

    cancelSearch() {
      throw new Error("AIEngine.cancelSearch must be implemented by an adapter");
    }

    getCapabilities() {
      throw new Error("AIEngine.getCapabilities must be implemented by an adapter");
    }

    getDiagnostics() {
      throw new Error("AIEngine.getDiagnostics must be implemented by an adapter");
    }

    dispose() {
      throw new Error("AIEngine.dispose must be implemented by an adapter");
    }
  }

  function validateAIEngine(candidate) {
    return Boolean(candidate && requiredMethods.every(method => typeof candidate[method] === "function"));
  }

  return { AIEngine, requiredMethods, validateAIEngine };
});
