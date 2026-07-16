"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./inference-provider.js"));
  else root.GoKidCoachOnnxWebGpuProvider = factory(root.GoKidCoachInferenceProvider);
})(typeof globalThis !== "undefined" ? globalThis : window, function factory(baseModule) {
  class OnnxWebGpuProvider extends baseModule.InferenceProvider {
    constructor(options = {}) {
      super();
      this.options = { ...options };
      this.initialized = false;
      this.lastError = null;
    }

    async initialize(modelManifest) {
      this.manifestId = modelManifest?.id || null;
      this.lastError = "ONNX Runtime Web WebGPU package is not configured in this audit task";
      return { ok: false, code: baseModule.NOT_CONFIGURED, message: this.lastError };
    }

    async run() {
      return { ok: false, code: baseModule.NOT_CONFIGURED, message: "No ONNX WebGPU session exists" };
    }

    getCapabilities() {
      return {
        configured: false,
        executionProvider: "onnx-webgpu",
        requiresPackage: "onnxruntime-web/webgpu",
        staticHostingCompatible: true,
        downloadsModelsAutomatically: false
      };
    }

    getDiagnostics() {
      return { configured: false, manifestId: this.manifestId || null, lastError: this.lastError };
    }
  }

  return { OnnxWebGpuProvider };
});
