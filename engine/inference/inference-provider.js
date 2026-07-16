"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachInferenceProvider = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const NOT_CONFIGURED = "NOT_CONFIGURED";

  class InferenceProvider {
    async initialize() {
      return { ok: false, code: NOT_CONFIGURED, message: "Inference provider is an interface placeholder" };
    }

    async run() {
      return { ok: false, code: NOT_CONFIGURED, message: "No model session is configured" };
    }

    cancel() {
      return { ok: true, cancelled: true };
    }

    getCapabilities() {
      return { configured: false, executionProvider: "none" };
    }

    getDiagnostics() {
      return { configured: false, lastError: null };
    }

    dispose() {}
  }

  function validateInferenceProvider(provider) {
    return Boolean(provider
      && typeof provider.initialize === "function"
      && typeof provider.run === "function"
      && typeof provider.cancel === "function"
      && typeof provider.getCapabilities === "function"
      && typeof provider.getDiagnostics === "function"
      && typeof provider.dispose === "function");
  }

  return { InferenceProvider, validateInferenceProvider, NOT_CONFIGURED };
});
