"use strict";

(function attach(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GoKidCoachNeuralMctsWorkerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : self, function factory(root) {
  const BOARD_SIZE = 19;
  const PASS_INDEX = BOARD_SIZE * BOARD_SIZE;
  const POLICY_SIZE = PASS_INDEX + 1;
  const INPUT_PLANES = 12;
  const GLOBAL_FEATURES = 4;
  const DEFAULT_MODES = {
    adaptive: { visits: 48, timeMs: 2000, maxTimeMs: 3000, nodeLimit: 256 },
    max: { visits: 96, timeMs: 4000, maxTimeMs: 5000, nodeLimit: 512 }
  };

  function isPass(move) {
    return !move || move.pass === true || move.index === PASS_INDEX;
  }

  function moveToIndex(move) {
    if (isPass(move)) return PASS_INDEX;
    if (Number.isInteger(move.index)) return move.index;
    const x = Number(move.x);
    const y = Number(move.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= BOARD_SIZE || y >= BOARD_SIZE) return null;
    return y * BOARD_SIZE + x;
  }

  function indexToMove(index) {
    if (index === PASS_INDEX) return { pass: true, index: PASS_INDEX };
    const y = Math.floor(index / BOARD_SIZE);
    const x = index % BOARD_SIZE;
    return { x, y, index };
  }

  function boardValue(value) {
    if (value === 1 || value === "B" || value === "black") return 1;
    if (value === -1 || value === 2 || value === "W" || value === "white") return -1;
    return 0;
  }

  function boardAt(board, x, y) {
    if (!Array.isArray(board) || !Array.isArray(board[y])) return 0;
    return boardValue(board[y][x]);
  }

  function sideValue(sideToMove) {
    return sideToMove === "W" || sideToMove === -1 || sideToMove === 2 ? -1 : 1;
  }

  function makeLegalMoves(position) {
    if (Array.isArray(position?.legalMoves) && position.legalMoves.length) {
      return position.legalMoves
        .map(move => {
          const index = moveToIndex(move);
          return index === null ? null : indexToMove(index);
        })
        .filter(Boolean);
    }
    const board = position?.board || [];
    const moves = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (boardAt(board, x, y) === 0) moves.push({ x, y, index: y * BOARD_SIZE + x });
      }
    }
    moves.push({ pass: true, index: PASS_INDEX });
    return moves;
  }

  function legalMask(position) {
    const mask = new Float32Array(POLICY_SIZE);
    for (const move of makeLegalMoves(position)) {
      const index = moveToIndex(move);
      if (index !== null && index >= 0 && index < POLICY_SIZE) mask[index] = 1;
    }
    return mask;
  }

  function encodeFeatures(position) {
    const spatial = new Float32Array(INPUT_PLANES * BOARD_SIZE * BOARD_SIZE);
    const globals = new Float32Array(GLOBAL_FEATURES);
    const board = position?.board || [];
    const current = sideValue(position?.sideToMove);
    const history = Array.isArray(position?.moveHistory) ? position.moveHistory.slice(-4) : [];

    function setPlane(plane, x, y, value) {
      spatial[plane * BOARD_SIZE * BOARD_SIZE + y * BOARD_SIZE + x] = value;
    }

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const value = boardAt(board, x, y);
        if (value === current) setPlane(0, x, y, 1);
        else if (value === -current) setPlane(1, x, y, 1);
        else setPlane(2, x, y, 1);
      }
    }

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (boardAt(board, x, y) === 0) continue;
        let emptyNeighbors = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < BOARD_SIZE && ny < BOARD_SIZE && boardAt(board, nx, ny) === 0) emptyNeighbors += 1;
        }
        if (emptyNeighbors <= 1) setPlane(3, x, y, 1);
        else if (emptyNeighbors === 2) setPlane(4, x, y, 1);
        else setPlane(5, x, y, 1);
      }
    }

    const ko = position?.koState || position?.ko || null;
    if (ko && Number.isInteger(ko.x) && Number.isInteger(ko.y) && ko.x >= 0 && ko.y >= 0) setPlane(6, ko.x, ko.y, 1);

    history.forEach((move, offset) => {
      if (!isPass(move) && Number.isInteger(move.x) && Number.isInteger(move.y)) setPlane(7 + offset, move.x, move.y, 1);
    });

    const komi = Number.isFinite(Number(position?.komi)) ? Number(position.komi) : 7.5;
    const moveNumber = Number.isFinite(Number(position?.moveNumber)) ? Number(position.moveNumber) : 0;
    globals[0] = (komi - 7.5) / 10;
    globals[1] = Math.min(Math.max(moveNumber, 0), 300) / 300;
    globals[2] = 1;
    globals[3] = history.length && isPass(history[history.length - 1]) ? 1 : 0;
    return { spatial, globalFeatures: globals, legalMask: legalMask(position) };
  }

  function softmaxMasked(logits, mask) {
    const out = new Float32Array(POLICY_SIZE);
    let max = -Infinity;
    for (let i = 0; i < POLICY_SIZE; i += 1) {
      if (mask[i] > 0 && logits[i] > max) max = logits[i];
    }
    if (!Number.isFinite(max)) {
      out[PASS_INDEX] = 1;
      return out;
    }
    let sum = 0;
    for (let i = 0; i < POLICY_SIZE; i += 1) {
      if (mask[i] > 0) {
        const value = Math.exp(Math.max(-80, Math.min(80, logits[i] - max)));
        out[i] = value;
        sum += value;
      }
    }
    if (sum <= 0) {
      out[PASS_INDEX] = 1;
      return out;
    }
    for (let i = 0; i < POLICY_SIZE; i += 1) out[i] /= sum;
    return out;
  }

  function toArray(value, expectedLength) {
    if (!value) return new Float32Array(expectedLength);
    if (Array.isArray(value)) return Float32Array.from(value.slice(0, expectedLength));
    if (ArrayBuffer.isView(value)) return new Float32Array(value.buffer, value.byteOffset, Math.min(value.length, expectedLength));
    return new Float32Array(expectedLength);
  }

  function outputByName(outputs, names, key, fallbackIndex) {
    const name = names?.[key];
    if (name && outputs && outputs[name]) return outputs[name].data || outputs[name];
    if (Array.isArray(outputs)) return outputs[fallbackIndex]?.data || outputs[fallbackIndex];
    const values = outputs ? Object.values(outputs) : [];
    return values[fallbackIndex]?.data || values[fallbackIndex];
  }

  function normalizeInferenceOutputs(outputs, manifest, mask) {
    const names = manifest?.outputTensorNames || {};
    const logits = toArray(outputByName(outputs, names, "policy", 0), POLICY_SIZE);
    const valueRaw = toArray(outputByName(outputs, names, "value", 1), 1);
    const scoreRaw = toArray(outputByName(outputs, names, "score", 2), 1);
    return {
      policy: softmaxMasked(logits, mask),
      value: 1 / (1 + Math.exp(-Number(valueRaw[0] || 0))),
      score: Number(scoreRaw[0] || 0)
    };
  }

  function chooseNearEquivalent(children) {
    const sorted = children.slice().sort((a, b) => b.visits - a.visits || b.q - a.q || b.prior - a.prior || a.index - b.index);
    const best = sorted[0];
    if (!best) return null;
    const near = sorted.filter(child => Math.abs(child.q - best.q) <= 0.01 || Math.abs((child.q - best.q) * 50) <= 0.5);
    near.sort((a, b) => b.visits - a.visits || b.prior - a.prior || a.index - b.index);
    return near[0] || best;
  }

  function runRootMcts(position, inference, options = {}) {
    const legalMoves = makeLegalMoves(position);
    if (!legalMoves.length || position?.terminal === true || position?.consecutivePasses >= 2) {
      return { move: { pass: true, index: PASS_INDEX }, visits: 0, elapsedMs: 0, candidates: [], terminal: true };
    }
    const mode = options.mode === "max" || options.difficultyMode === "max" || options.difficultyMode === "MAX_STRENGTH_FIXED" ? "max" : "adaptive";
    const budget = { ...DEFAULT_MODES[mode], ...(options.budget || {}) };
    const visitLimit = Math.max(1, Math.min(Number(options.visitLimit || budget.visits), Number(options.nodeLimit || budget.nodeLimit)));
    const timeLimit = Math.max(1, Math.min(Number(options.timeLimitMs || budget.timeMs), Number(budget.maxTimeMs)));
    const cpuct = Number.isFinite(Number(options.cpuct)) ? Number(options.cpuct) : 1.25;
    const start = Date.now();
    const children = legalMoves.map(move => {
      const index = moveToIndex(move);
      return { index, move: indexToMove(index), prior: inference.policy[index] || 0, visits: 0, valueSum: 0, q: 0 };
    }).filter(child => child.index !== null);
    if (!children.length) return { move: { pass: true, index: PASS_INDEX }, visits: 0, elapsedMs: Date.now() - start, candidates: [] };

    for (let visit = 0; visit < visitLimit && Date.now() - start < timeLimit; visit += 1) {
      const total = 1 + children.reduce((sum, child) => sum + child.visits, 0);
      let selected = children[0];
      let bestScore = -Infinity;
      for (const child of children) {
        const u = cpuct * child.prior * Math.sqrt(total) / (1 + child.visits);
        const score = child.q + u;
        if (score > bestScore || (score === bestScore && child.index < selected.index)) {
          bestScore = score;
          selected = child;
        }
      }
      selected.visits += 1;
      selected.valueSum += inference.value;
      selected.q = selected.valueSum / selected.visits;
    }

    const selected = mode === "adaptive" ? chooseNearEquivalent(children) : children.slice().sort((a, b) => b.visits - a.visits || b.q - a.q || b.prior - a.prior || a.index - b.index)[0];
    return {
      move: selected ? selected.move : { pass: true, index: PASS_INDEX },
      visits: children.reduce((sum, child) => sum + child.visits, 0),
      elapsedMs: Date.now() - start,
      candidates: children.sort((a, b) => b.visits - a.visits || b.prior - a.prior).slice(0, 10).map(child => ({
        index: child.index,
        move: child.move,
        visits: child.visits,
        prior: child.prior,
        q: child.q
      })),
      value: inference.value,
      score: inference.score,
      mode
    };
  }

  class WorkerState {
    constructor(scope = root) {
      this.scope = scope;
      this.session = null;
      this.manifest = null;
      this.provider = null;
      this.initialized = false;
      this.cancelled = false;
      this.activeRequestId = null;
      this.mockSession = null;
    }

    async initialize(message) {
      this.manifest = message.manifest || null;
      this.provider = message.provider || "wasm";
      this.cancelled = false;
      this.mockSession = message.mockSession || null;
      if (this.mockSession) {
        this.session = this.mockSession;
        this.initialized = true;
        return { ok: true, provider: "mock" };
      }
      const ort = this.scope.ort;
      if (!ort && message.ortScriptUrl && typeof this.scope.importScripts === "function") {
        this.scope.importScripts(message.ortScriptUrl);
      }
      const runtime = this.scope.ort;
      if (!runtime?.InferenceSession) {
        return { ok: false, code: "NOT_CONFIGURED", message: "ONNX Runtime Web is not loaded" };
      }
      const executionProviders = this.provider === "webgpu" ? ["webgpu", "wasm"] : ["wasm"];
      this.session = await runtime.InferenceSession.create(this.manifest.modelPath, { executionProviders });
      this.initialized = true;
      return { ok: true, provider: this.provider, executionProviders };
    }

    cancel(requestId = null) {
      this.cancelled = true;
      if (!requestId || requestId === this.activeRequestId) this.activeRequestId = null;
      return { ok: true, cancelled: true, requestId };
    }

    async infer(position) {
      const encoded = encodeFeatures(position);
      const names = this.manifest?.inputTensorNames || { spatial: "spatial", global: "global_features" };
      let outputs;
      if (this.session?.run) {
        const runtime = this.scope.ort;
        const spatial = runtime?.Tensor ? new runtime.Tensor("float32", encoded.spatial, [1, 12, 19, 19]) : encoded.spatial;
        const globalFeatures = runtime?.Tensor ? new runtime.Tensor("float32", encoded.globalFeatures, [1, 4]) : encoded.globalFeatures;
        outputs = await this.session.run({ [names.spatial]: spatial, [names.global]: globalFeatures });
      } else {
        throw new Error("No inference session exists");
      }
      return { encoded, inference: normalizeInferenceOutputs(outputs, this.manifest, encoded.legalMask) };
    }

    async search(message) {
      if (!this.initialized || !this.session) return { ok: false, code: "NOT_CONFIGURED", message: "Model session is not initialized" };
      this.cancelled = false;
      this.activeRequestId = message.requestId || null;
      const startedAt = Date.now();
      const { encoded, inference } = await this.infer(message.position || {});
      if (this.cancelled || this.activeRequestId !== (message.requestId || null)) {
        return { ok: false, code: "CANCELLED", stale: true, requestId: message.requestId || null };
      }
      const search = runRootMcts(message.position || {}, inference, message.options || {});
      return {
        ok: true,
        requestId: message.requestId || null,
        move: search.move,
        policy: Array.from(inference.policy),
        value: inference.value,
        score: inference.score,
        visits: search.visits,
        elapsedMs: Date.now() - startedAt,
        searchElapsedMs: search.elapsedMs,
        candidates: search.candidates,
        legalMoveCount: encoded.legalMask.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0),
        provider: this.provider
      };
    }
  }

  const defaultState = new WorkerState(root);

  async function handleMessage(message, state = defaultState) {
    if (message.type === "initialize") return { type: "initialized", requestId: message.requestId || null, ...(await state.initialize(message)) };
    if (message.type === "cancel") return { type: "cancelled", ...(state.cancel(message.requestId || null)) };
    if (message.type === "search") return { type: "result", ...(await state.search(message)) };
    return { type: "error", requestId: message.requestId || null, ok: false, code: "UNKNOWN_MESSAGE" };
  }

  if (typeof root.self !== "undefined" && root.self === root && typeof root.addEventListener === "function") {
    root.addEventListener("message", event => {
      handleMessage(event.data || {}).then(
        response => root.postMessage(response),
        error => root.postMessage({ type: "error", requestId: event.data?.requestId || null, ok: false, message: String(error.message || error) })
      );
    });
  }

  return {
    BOARD_SIZE,
    PASS_INDEX,
    POLICY_SIZE,
    encodeFeatures,
    legalMask,
    moveToIndex,
    indexToMove,
    softmaxMasked,
    normalizeInferenceOutputs,
    runRootMcts,
    WorkerState,
    handleMessage,
    DEFAULT_MODES
  };
});
