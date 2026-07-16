"use strict";

(function attach(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GoKidCoachNeuralModelContract = factory();
})(typeof globalThis !== "undefined" ? globalThis : window, function factory() {
  const supportedProviders = ["onnx-webgpu", "onnx-wasm", "legacy"];
  const requiredLicenseFields = ["name", "url", "redistribution"];
  const requiredTensorFields = ["name", "shape", "dtype"];

  function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
  }

  function validateTensor(tensor, label) {
    const errors = [];
    if (!tensor || typeof tensor !== "object") return [`${label} tensor must be an object`];
    for (const field of requiredTensorFields) {
      if (tensor[field] === undefined || tensor[field] === null || tensor[field] === "") errors.push(`${label}.${field} is required`);
    }
    if (!Array.isArray(tensor.shape) || tensor.shape.length === 0 || !tensor.shape.every(isPositiveInteger)) {
      errors.push(`${label}.shape must be a non-empty positive integer array`);
    }
    if (!["float32", "float16", "int32", "int64", "bool"].includes(tensor.dtype)) {
      errors.push(`${label}.dtype is unsupported`);
    }
    return errors;
  }

  function validateLicense(license) {
    const errors = [];
    if (!license || typeof license !== "object") return ["license metadata is required"];
    for (const field of requiredLicenseFields) {
      if (!license[field]) errors.push(`license.${field} is required`);
    }
    if (license.status === "blocked" || license.redistribution === "unknown") errors.push("license redistribution must be explicitly permitted");
    return errors;
  }

  function validateModelManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object") return { valid: false, errors: ["manifest must be an object"] };
    if (!manifest.id) errors.push("id is required");
    if (!manifest.version) errors.push("version is required");
    if (!manifest.sha256 || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) errors.push("sha256 must be a 64-character hex digest");
    if (manifest.boardSize !== 19) errors.push("boardSize must be 19 for this prototype contract");
    errors.push(...validateLicense(manifest.license));
    const inputs = Array.isArray(manifest.inputs) ? manifest.inputs : [];
    const outputs = Array.isArray(manifest.outputs) ? manifest.outputs : [];
    if (!inputs.length) errors.push("at least one input tensor is required");
    if (!outputs.some(output => output.semantic === "policy")) errors.push("policy output tensor is required");
    if (!outputs.some(output => output.semantic === "value")) errors.push("value output tensor is required");
    inputs.forEach((tensor, index) => errors.push(...validateTensor(tensor, `inputs[${index}]`)));
    outputs.forEach((tensor, index) => errors.push(...validateTensor(tensor, `outputs[${index}]`)));
    inputs.forEach((tensor, index) => {
      if (Array.isArray(tensor.shape)) {
        const lastTwo = tensor.shape.slice(-2);
        if (lastTwo[0] !== 19 || lastTwo[1] !== 19) errors.push(`inputs[${index}].shape must end with [19,19]`);
      }
    });
    outputs.forEach((tensor, index) => {
      if (tensor.semantic === "policy" && Array.isArray(tensor.shape) && !tensor.shape.includes(362)) {
        errors.push(`outputs[${index}].shape must include 362 policy logits`);
      }
      if (tensor.semantic === "value" && Array.isArray(tensor.shape) && tensor.shape[tensor.shape.length - 1] !== 1) {
        errors.push(`outputs[${index}].shape must end with scalar value dimension 1`);
      }
    });
    if (!Array.isArray(manifest.executionProviders) || !manifest.executionProviders.length) {
      errors.push("executionProviders must be a non-empty array");
    } else {
      for (const provider of manifest.executionProviders) {
        if (!supportedProviders.includes(provider)) errors.push(`unsupported execution provider: ${provider}`);
      }
    }
    if (manifest.passIndex !== 361) errors.push("passIndex must be 361 for 19x19 policy output");
    if (manifest.policySize !== 362) errors.push("policySize must be 362 for 19x19 plus pass");
    return { valid: errors.length === 0, errors };
  }

  const modelLifecycle = Object.freeze({
    initialize: "load manifest, verify hash, create provider session",
    run: "encode features, run provider, apply legal mask outside the raw model graph",
    cancel: "cancel active provider work where supported",
    dispose: "release provider session, buffers, and cached transient tensors"
  });

  return {
    supportedProviders,
    modelLifecycle,
    validateModelManifest,
    validateTensor,
    validateLicense
  };
});
