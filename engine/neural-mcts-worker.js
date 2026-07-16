"use strict";

let cancelled = false;

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === "cancel") {
    cancelled = true;
    self.postMessage({ type: "cancelled", requestId: message.requestId || null });
    return;
  }
  if (message.type === "initialize") {
    cancelled = false;
    self.postMessage({
      type: "initialized",
      requestId: message.requestId || null,
      architectureOnly: true,
      neuralModelLoaded: false,
      mctsImplemented: false
    });
    return;
  }
  self.postMessage({
    type: "error",
    requestId: message.requestId || null,
    stale: cancelled,
    error: "Neural MCTS worker scaffold only; model inference and search are not implemented"
  });
};
