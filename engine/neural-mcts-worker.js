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
    adaptive: { visits: 96, timeMs: 1800, maxTimeMs: 3000, nodeLimit: 512, maxChildrenPerNode: 10 },
    max: { visits: 256, timeMs: 3500, maxTimeMs: 5000, nodeLimit: 1024, maxChildrenPerNode: 16 }
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

  function cloneBoard(board) {
    return Array.from({ length: BOARD_SIZE }, (_, y) => (
      Array.from({ length: BOARD_SIZE }, (_, x) => boardAt(board, x, y))
    ));
  }

  function sideValue(sideToMove) {
    return sideToMove === "W" || sideToMove === -1 || sideToMove === 2 ? -1 : 1;
  }

  function sideName(value) {
    return value === -1 ? "W" : "B";
  }

  function neighbors(x, y) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter(point => point.x >= 0 && point.y >= 0 && point.x < BOARD_SIZE && point.y < BOARD_SIZE);
  }

  function groupAt(board, x, y) {
    const color = boardAt(board, x, y);
    if (!color) return { color: 0, stones: [], liberties: [] };
    const queue = [{ x, y }];
    const seen = new Set();
    const libertyKeys = new Set();
    const stones = [];
    while (queue.length) {
      const point = queue.pop();
      const key = `${point.x},${point.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stones.push(point);
      for (const next of neighbors(point.x, point.y)) {
        const value = boardAt(board, next.x, next.y);
        if (value === 0) libertyKeys.add(`${next.x},${next.y}`);
        else if (value === color && !seen.has(`${next.x},${next.y}`)) queue.push(next);
      }
    }
    return {
      color,
      stones,
      liberties: Array.from(libertyKeys, key => {
        const [lx, ly] = key.split(",").map(Number);
        return { x: lx, y: ly };
      })
    };
  }

  function boardHash(board) {
    let out = "";
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) out += String(boardAt(board, x, y) + 1);
    }
    return out;
  }

  function koMatches(ko, move) {
    return ko && !isPass(move) && ko.x === move.x && ko.y === move.y;
  }

  function playMove(position, move) {
    const color = sideValue(position?.sideToMove);
    const nextColor = -color;
    const history = Array.isArray(position?.moveHistory) ? position.moveHistory : [];
    const moveNumber = Number.isFinite(Number(position?.moveNumber)) ? Number(position.moveNumber) : history.length;
    if (isPass(move)) {
      return {
        ...position,
        board: cloneBoard(position?.board || []),
        sideToMove: sideName(nextColor),
        moveNumber: moveNumber + 1,
        moveHistory: history.concat({ pass: true, color: sideName(color) }),
        legalMoves: null,
        consecutivePasses: Number(position?.consecutivePasses || 0) + 1,
        ko: null,
        koState: null
      };
    }
    const index = moveToIndex(move);
    if (index === null) return null;
    const point = indexToMove(index);
    if (boardAt(position?.board || [], point.x, point.y) !== 0 || koMatches(position?.koState || position?.ko, point)) return null;

    const board = cloneBoard(position?.board || []);
    board[point.y][point.x] = color;
    const captured = [];
    for (const next of neighbors(point.x, point.y)) {
      if (boardAt(board, next.x, next.y) !== nextColor) continue;
      const opponent = groupAt(board, next.x, next.y);
      if (opponent.liberties.length === 0) {
        for (const stone of opponent.stones) {
          board[stone.y][stone.x] = 0;
          captured.push(stone);
        }
      }
    }
    const own = groupAt(board, point.x, point.y);
    if (own.liberties.length === 0) return null;
    const ko = captured.length === 1 && own.stones.length === 1 && own.liberties.length === 1
      ? { x: captured[0].x, y: captured[0].y }
      : null;
    return {
      ...position,
      board,
      sideToMove: sideName(nextColor),
      moveNumber: moveNumber + 1,
      moveHistory: history.concat({ x: point.x, y: point.y, color: sideName(color), captures: captured.length }),
      legalMoves: null,
      consecutivePasses: 0,
      ko,
      koState: ko,
      previousBoardHash: boardHash(position?.board || [])
    };
  }

  function transformXY(x, y, symmetry) {
    const n = BOARD_SIZE - 1;
    if (symmetry === 0) return { x, y };
    if (symmetry === 1) return { x: n - y, y: x };
    if (symmetry === 2) return { x: n - x, y: n - y };
    if (symmetry === 3) return { x: y, y: n - x };
    if (symmetry === 4) return { x: n - x, y };
    if (symmetry === 5) return { x, y: n - y };
    if (symmetry === 6) return { x: y, y: x };
    if (symmetry === 7) return { x: n - y, y: n - x };
    return { x, y };
  }

  function inverseSymmetry(symmetry) {
    return [0, 3, 2, 1, 4, 5, 6, 7][symmetry] || 0;
  }

  function transformIndex(index, symmetry) {
    if (index === PASS_INDEX) return PASS_INDEX;
    const point = indexToMove(index);
    const next = transformXY(point.x, point.y, symmetry);
    return next.y * BOARD_SIZE + next.x;
  }

  function transformMove(move, symmetry) {
    const index = moveToIndex(move);
    if (index === null) return move;
    return indexToMove(transformIndex(index, symmetry));
  }

  function transformBoard(board, symmetry) {
    const out = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const point = transformXY(x, y, symmetry);
        out[point.y][point.x] = boardAt(board, x, y);
      }
    }
    return out;
  }

  function transformPosition(position, symmetry) {
    if (!symmetry) return position;
    const mapMove = move => {
      if (isPass(move)) return { ...move };
      const point = transformXY(Number(move.x), Number(move.y), symmetry);
      return { ...move, x: point.x, y: point.y, index: point.y * BOARD_SIZE + point.x };
    };
    const ko = position?.koState || position?.ko || null;
    const transformedKo = ko && Number.isInteger(ko.x) && Number.isInteger(ko.y) ? transformXY(ko.x, ko.y, symmetry) : null;
    return {
      ...position,
      board: transformBoard(position?.board || [], symmetry),
      moveHistory: Array.isArray(position?.moveHistory) ? position.moveHistory.map(mapMove) : [],
      legalMoves: Array.isArray(position?.legalMoves) ? position.legalMoves.map(move => transformMove(move, symmetry)) : position?.legalMoves,
      ko: transformedKo,
      koState: transformedKo
    };
  }

  function policyTopFromPolicy(policy) {
    return Array.from(policy)
      .map((value, index) => ({ index, probability: Number(value) }))
      .filter(item => item.probability > 0)
      .sort((a, b) => b.probability - a.probability || a.index - b.index)
      .slice(0, 20);
  }

  function remapPolicy(policy, symmetry) {
    if (!symmetry) return policy;
    const out = new Float32Array(POLICY_SIZE);
    const inverse = inverseSymmetry(symmetry);
    out[PASS_INDEX] = policy[PASS_INDEX] || 0;
    for (let index = 0; index < PASS_INDEX; index += 1) {
      out[transformIndex(index, inverse)] += policy[index] || 0;
    }
    return out;
  }

  function generatedLegalMoves(position) {
    const board = position?.board || [];
    const moves = [];
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (boardAt(board, x, y) !== 0) continue;
        const next = playMove(position, { x, y, index: y * BOARD_SIZE + x });
        if (next) moves.push({ x, y, index: y * BOARD_SIZE + x });
      }
    }
    moves.push({ pass: true, index: PASS_INDEX });
    return moves;
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
    return generatedLegalMoves(position);
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

  function float16BitsToFloat32(bits) {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x03ff;
    if (exponent === 0) return sign * (fraction / 1024) * (2 ** -14);
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * (1 + fraction / 1024) * (2 ** (exponent - 15));
  }

  function decodeFloat16Array(value, expectedLength) {
    const source = ArrayBuffer.isView(value)
      ? new Uint16Array(value.buffer, value.byteOffset, Math.min(value.length, expectedLength))
      : Uint16Array.from(Array.isArray(value) ? value.slice(0, expectedLength) : []);
    const out = new Float32Array(expectedLength);
    for (let i = 0; i < Math.min(source.length, expectedLength); i += 1) out[i] = float16BitsToFloat32(source[i]);
    return out;
  }

  function toArray(value, expectedLength, dtype = "float32") {
    if (!value) return new Float32Array(expectedLength);
    if (dtype === "float16") return decodeFloat16Array(value, expectedLength);
    if (Array.isArray(value)) return Float32Array.from(value.slice(0, expectedLength));
    if (ArrayBuffer.isView(value)) return Float32Array.from(value.slice(0, expectedLength));
    return new Float32Array(expectedLength);
  }

  function float32ToFloat16Bits(values) {
    const out = new Uint16Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      const value = Number(values[i]);
      if (!Number.isFinite(value)) {
        out[i] = value < 0 ? 0xfc00 : 0x7c00;
        continue;
      }
      if (value === 0) {
        out[i] = 1 / value === -Infinity ? 0x8000 : 0;
        continue;
      }
      const sign = value < 0 ? 0x8000 : 0;
      const abs = Math.abs(value);
      if (abs >= 65504) {
        out[i] = sign | 0x7bff;
        continue;
      }
      if (abs < 0.000000059604645) {
        out[i] = sign;
        continue;
      }
      let exponent = Math.floor(Math.log2(abs));
      let mantissa = abs / (2 ** exponent) - 1;
      let halfExponent = exponent + 15;
      if (halfExponent <= 0) {
        out[i] = sign | Math.round(abs / 0.000000059604645);
        continue;
      }
      let halfMantissa = Math.round(mantissa * 1024);
      if (halfMantissa === 1024) {
        halfMantissa = 0;
        halfExponent += 1;
      }
      out[i] = sign | (halfExponent << 10) | (halfMantissa & 0x3ff);
    }
    return out;
  }

  function manifestInputDtype(manifest, key) {
    return manifest?.inputTensorDtypes?.[key]
      || (String(manifest?.modelFormat || "").includes("fp16") ? "float16" : "float32");
  }

  function manifestOutputDtype(manifest, key) {
    return manifest?.outputTensorDtypes?.[key]
      || (String(manifest?.modelFormat || "").includes("fp16") ? "float16" : "float32");
  }

  function makeTensor(runtime, dtype, data, shape) {
    if (!runtime?.Tensor) return data;
    if (dtype === "float16") return new runtime.Tensor("float16", float32ToFloat16Bits(data), shape);
    return new runtime.Tensor("float32", data, shape);
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
    const policyOutput = outputByName(outputs, names, "policy", 0);
    if (!policyOutput) throw new Error("Model policy output is missing");
    const logits = toArray(policyOutput, POLICY_SIZE, manifestOutputDtype(manifest, "policy"));
    let finiteLegalLogits = 0;
    for (let i = 0; i < POLICY_SIZE; i += 1) {
      if (mask[i] > 0 && Number.isFinite(Number(logits[i]))) finiteLegalLogits += 1;
    }
    if (!finiteLegalLogits) throw new Error("Model policy output has no finite legal logits");
    const valueRaw = toArray(outputByName(outputs, names, "value", 1), 1, manifestOutputDtype(manifest, "value"));
    const scoreRaw = toArray(outputByName(outputs, names, "score", 2), 1, manifestOutputDtype(manifest, "score"));
    const policy = softmaxMasked(logits, mask);
    const rawLogitTop = Array.from(logits)
      .map((value, index) => ({ index, value: Number(value), legal: mask[index] > 0 }))
      .filter(item => Number.isFinite(item.value))
      .sort((a, b) => b.value - a.value || a.index - b.index)
      .slice(0, 20);
    const policyTop = policyTopFromPolicy(policy);
    return {
      policy,
      rawLogitTop,
      policyTop,
      value: 1 / (1 + Math.exp(-Number(valueRaw[0] || 0))),
      score: Number(scoreRaw[0] || 0)
    };
  }

  function passSuppressionFactor(position, legalMoves, passPrior, bestNonPassPrior) {
    if (!legalMoves.some(move => !isPass(move))) return 1;
    if (position?.terminal === true || position?.consecutivePasses >= 1) return 1;
    const moveNumber = Number.isFinite(Number(position?.moveNumber)) ? Number(position.moveNumber) : 0;
    if (moveNumber < 180) return 0.02;
    if (moveNumber < 240) return 0.08;
    if (passPrior > bestNonPassPrior * 1.75) return 1;
    return 0.25;
  }

  function applyRootPolicySafety(position, children) {
    const pass = children.find(child => child.index === PASS_INDEX);
    const nonPass = children.filter(child => child.index !== PASS_INDEX);
    if (!pass || !nonPass.length) return children;
    const bestNonPassPrior = Math.max(...nonPass.map(child => child.prior));
    const factor = passSuppressionFactor(position, children.map(child => child.move), pass.prior, bestNonPassPrior);
    if (factor >= 1) return children;
    pass.rawPrior = pass.prior;
    pass.prior *= factor;
    const total = children.reduce((sum, child) => sum + Math.max(0, child.prior), 0);
    if (total > 0) {
      for (const child of children) child.prior = Math.max(0, child.prior) / total;
    }
    return children;
  }

  function pointEdge(point) {
    return Math.min(point.x, point.y, BOARD_SIZE - 1 - point.x, BOARD_SIZE - 1 - point.y);
  }

  function distanceToNearestStone(position, point) {
    let best = Infinity;
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        if (boardAt(position?.board || [], x, y) === 0) continue;
        best = Math.min(best, Math.abs(point.x - x) + Math.abs(point.y - y));
      }
    }
    return best;
  }

  function rootStrategicPriorFloor(position, child) {
    if (!child || child.index === PASS_INDEX || child.index === null) return 0;
    const moveNumber = Number.isFinite(Number(position?.moveNumber)) ? Number(position.moveNumber) : 0;
    if (moveNumber > 60) return 0;
    const point = indexToMove(child.index);
    const edge = pointEdge(point);
    const cornerDistance = Math.min(
      point.x + point.y,
      (BOARD_SIZE - 1 - point.x) + point.y,
      point.x + (BOARD_SIZE - 1 - point.y),
      (BOARD_SIZE - 1 - point.x) + (BOARD_SIZE - 1 - point.y)
    );
    const near = distanceToNearestStone(position, point);
    const xLine = Math.min(point.x, BOARD_SIZE - 1 - point.x);
    const yLine = Math.min(point.y, BOARD_SIZE - 1 - point.y);
    const cornerOpeningPoint = cornerDistance <= 7 && edge >= 2 && edge <= 4;
    const sideExtensionPoint = edge >= 2 && edge <= 4 && (point.x === 9 || point.y === 9 || xLine === 3 || yLine === 3);
    const approachOrReductionPoint = edge >= 2 && edge <= 5 && near >= 3 && near <= 8;
    if (moveNumber <= 20) {
      if (cornerOpeningPoint) return 0.085;
      if (sideExtensionPoint) return 0.045;
      return 0;
    }
    if (cornerDistance <= 10 && edge >= 2 && edge <= 5) return 0.18;
    if (sideExtensionPoint) return 0.12;
    if (approachOrReductionPoint) return 0.07;
    if (cornerOpeningPoint || sideExtensionPoint) return 0.05;
    return 0;
  }

  function applyRootStrategicPriorSafety(position, children) {
    const moveNumber = Number.isFinite(Number(position?.moveNumber)) ? Number(position.moveNumber) : 0;
    if (moveNumber > 60 || !children.length) return children;
    for (const child of children) {
      const floor = rootStrategicPriorFloor(position, child);
      if (floor > child.prior) {
        child.rawPrior = child.rawPrior ?? child.prior;
        child.prior = floor;
        child.strategicPriorFloor = floor;
      }
    }
    const total = children.reduce((sum, child) => sum + Math.max(0, child.prior), 0);
    if (total > 0) {
      for (const child of children) child.prior = Math.max(0, child.prior) / total;
    }
    return children;
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
    applyRootPolicySafety(position, children);
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

  function createSearchNode(position, parent = null, move = null, prior = 1) {
    return {
      position,
      parent,
      move,
      index: move ? moveToIndex(move) : null,
      prior,
      visits: 0,
      valueSum: 0,
      children: [],
      expanded: false,
      terminal: Boolean(position?.terminal === true || position?.consecutivePasses >= 2)
    };
  }

  function nodeQ(node) {
    return node.visits ? node.valueSum / node.visits : 0;
  }

  function expandNode(node, inference, remainingNodeSlots = Infinity, maxChildren = Infinity) {
    if (node.expanded || node.terminal) return 0;
    const legalMoves = makeLegalMoves(node.position);
    let children = legalMoves
      .map(move => {
        const index = moveToIndex(move);
        return { move: indexToMove(index), index, prior: index === null ? 0 : inference.policy[index] || 0 };
      })
      .filter(item => item.index !== null);
    if (!node.parent) children = applyRootStrategicPriorSafety(node.position, children);
    children = children
      .sort((a, b) => b.prior - a.prior || a.index - b.index)
      .slice(0, Math.max(0, Math.min(remainingNodeSlots, maxChildren)));
    node.children = children
      .map(item => {
        const next = playMove(node.position, item.move);
        return next ? createSearchNode(next, node, item.move, item.prior) : null;
      })
      .filter(Boolean);
    if (!node.parent) applyRootPolicySafety(node.position, node.children);
    node.expanded = true;
    return node.children.length;
  }

  function selectChild(node, cpuct) {
    const total = Math.max(1, node.children.reduce((sum, child) => sum + child.visits, 0));
    let selected = node.children[0];
    let bestScore = -Infinity;
    for (const child of node.children) {
      const parentPerspectiveQ = child.visits ? -nodeQ(child) : 0;
      const exploration = cpuct * child.prior * Math.sqrt(total) / (1 + child.visits);
      const score = parentPerspectiveQ + exploration;
      if (score > bestScore || (score === bestScore && child.index < selected.index)) {
        bestScore = score;
        selected = child;
      }
    }
    return selected;
  }

  function backup(path, leafValue) {
    let value = Math.max(-1, Math.min(1, leafValue * 2 - 1));
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const node = path[i];
      node.visits += 1;
      node.valueSum += value;
      value = -value;
    }
  }

  function terminalValue(position) {
    if (position?.consecutivePasses >= 2 || position?.terminal === true) return 0;
    return null;
  }

  function chooseSearchMove(root, mode) {
    const sorted = root.children.slice().sort((a, b) => (
      b.visits - a.visits
      || (-nodeQ(b)) - (-nodeQ(a))
      || b.prior - a.prior
      || a.index - b.index
    ));
    if (mode !== "adaptive") return sorted[0] || null;
    const best = sorted[0];
    if (!best) return null;
    const bestValue = -nodeQ(best);
    const near = sorted.filter(child => Math.abs((-nodeQ(child)) - bestValue) <= 0.01 || Math.abs(((-nodeQ(child)) - bestValue) * 50) <= 0.5);
    return near.sort((a, b) => b.visits - a.visits || b.prior - a.prior || a.index - b.index)[0] || best;
  }

  async function runNeuralMcts(position, rootInference, inferPosition, options = {}) {
    const legalMoves = makeLegalMoves(position);
    if (!legalMoves.length || position?.terminal === true || position?.consecutivePasses >= 2) {
      return { move: { pass: true, index: PASS_INDEX }, visits: 0, elapsedMs: 0, candidates: [], terminal: true };
    }
    const mode = options.mode === "max" || options.difficultyMode === "max" || options.difficultyMode === "MAX_STRENGTH_FIXED" ? "max" : "adaptive";
    const budget = { ...DEFAULT_MODES[mode], ...(options.budget || {}) };
    const visitLimit = Math.max(1, Math.min(Number(options.visitLimit || budget.visits), Number(options.nodeLimit || budget.nodeLimit)));
    const nodeLimit = Math.max(1, Number(options.nodeLimit || budget.nodeLimit));
    const maxChildrenPerNode = Math.max(1, Number(options.maxChildrenPerNode || budget.maxChildrenPerNode || 10));
    const timeLimit = Math.max(1, Math.min(Number(options.timeLimitMs || budget.timeMs), Number(budget.maxTimeMs)));
    const cpuct = Number.isFinite(Number(options.cpuct)) ? Number(options.cpuct) : 1.25;
    const startedAt = Date.now();
    const shouldStop = typeof options.shouldStop === "function" ? options.shouldStop : () => false;
    const root = createSearchNode(position);
    let nodeCount = 1 + expandNode(root, rootInference, nodeLimit - 1, maxChildrenPerNode);
    if (!root.children.length) return { move: { pass: true, index: PASS_INDEX }, visits: 0, elapsedMs: Date.now() - startedAt, candidates: [] };

    for (let visit = 0; visit < visitLimit && Date.now() - startedAt < timeLimit && !shouldStop(); visit += 1) {
      const path = [root];
      let node = root;
      while (node.expanded && node.children.length && !node.terminal) {
        node = selectChild(node, cpuct);
        path.push(node);
      }
      const terminal = terminalValue(node.position);
      if (terminal !== null) {
        backup(path, terminal);
        continue;
      }
      const { inference } = await inferPosition(node.position);
      if (shouldStop()) break;
      if (nodeCount < nodeLimit) nodeCount += expandNode(node, inference, nodeLimit - nodeCount, maxChildrenPerNode);
      backup(path, inference.value);
    }

    const selected = chooseSearchMove(root, mode);
    const ranked = root.children.slice().sort((a, b) => b.visits - a.visits || (-nodeQ(b)) - (-nodeQ(a)) || b.prior - a.prior || a.index - b.index);
    return {
      move: selected ? selected.move : { pass: true, index: PASS_INDEX },
      visits: root.visits,
      elapsedMs: Date.now() - startedAt,
      candidates: ranked.slice(0, 10).map(child => ({
        index: child.index,
        move: child.move,
        visits: child.visits,
        prior: child.prior,
        q: -nodeQ(child)
      })),
      value: root.visits ? nodeQ(root) : rootInference.value,
      score: rootInference.score,
      nodeCount,
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
        try {
          this.scope.importScripts(message.ortScriptUrl);
        } catch (error) {
          return {
            ok: false,
            code: "ORT_SCRIPT_LOAD_FAILED",
            message: `Failed to load ONNX Runtime Web script: ${String(error.message || error)}`
          };
        }
      }
      const runtime = this.scope.ort;
      if (!runtime?.InferenceSession) {
        return { ok: false, code: "NOT_CONFIGURED", message: "ONNX Runtime Web is not loaded" };
      }
      if (runtime.env?.wasm) {
        runtime.env.wasm.numThreads = Number.isFinite(Number(message.numThreads)) ? Math.max(1, Number(message.numThreads)) : 1;
        if (message.ortWasmPath || message.ortMjsPath) {
          runtime.env.wasm.wasmPaths = {
            ...(message.ortMjsPath ? { mjs: message.ortMjsPath } : {}),
            ...(message.ortWasmPath ? { wasm: message.ortWasmPath } : {})
          };
        }
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

    async inferSingle(position) {
      const encoded = encodeFeatures(position);
      const names = this.manifest?.inputTensorNames || { spatial: "spatial", global: "global_features" };
      let outputs;
      if (this.session?.run) {
        const runtime = this.scope.ort;
        const spatial = makeTensor(runtime, manifestInputDtype(this.manifest, "spatial"), encoded.spatial, [1, 12, 19, 19]);
        const globalFeatures = makeTensor(runtime, manifestInputDtype(this.manifest, "global"), encoded.globalFeatures, [1, 4]);
        outputs = await this.session.run({ [names.spatial]: spatial, [names.global]: globalFeatures });
      } else {
        throw new Error("No inference session exists");
      }
      return { encoded, inference: normalizeInferenceOutputs(outputs, this.manifest, encoded.legalMask) };
    }

    async infer(position, options = {}) {
      if (!options.symmetryAveraging) return this.inferSingle(position);
      const encoded = encodeFeatures(position);
      const policy = new Float32Array(POLICY_SIZE);
      let value = 0;
      let score = 0;
      for (let symmetry = 0; symmetry < 8; symmetry += 1) {
        const transformed = transformPosition(position, symmetry);
        const result = await this.inferSingle(transformed);
        const remapped = remapPolicy(result.inference.policy, symmetry);
        for (let i = 0; i < POLICY_SIZE; i += 1) policy[i] += remapped[i] / 8;
        value += result.inference.value / 8;
        score += result.inference.score / 8;
      }
      for (let i = 0; i < POLICY_SIZE; i += 1) if (encoded.legalMask[i] <= 0) policy[i] = 0;
      const normalized = softmaxMasked(policy, encoded.legalMask);
      return {
        encoded,
        inference: {
          policy: normalized,
          rawLogitTop: policyTopFromPolicy(normalized).map(item => ({ index: item.index, value: item.probability, legal: true })),
          policyTop: policyTopFromPolicy(normalized),
          value,
          score,
          symmetryAveraged: true
        }
      };
    }

    async search(message) {
      if (!this.initialized || !this.session) return { ok: false, code: "NOT_CONFIGURED", message: "Model session is not initialized" };
      this.cancelled = false;
      this.activeRequestId = message.requestId || null;
      const startedAt = Date.now();
      const { encoded, inference } = await this.infer(message.position || {}, { symmetryAveraging: Boolean(message.options?.rootSymmetryAveraging) });
      if (this.cancelled || this.activeRequestId !== (message.requestId || null)) {
        return { ok: false, code: "CANCELLED", stale: true, requestId: message.requestId || null };
      }
      const search = await runNeuralMcts(message.position || {}, inference, position => this.infer(position), {
        ...(message.options || {}),
        shouldStop: () => this.cancelled || this.activeRequestId !== (message.requestId || null)
      });
      return {
        ok: true,
        requestId: message.requestId || null,
        move: search.move,
        policy: Array.from(inference.policy),
        rawLogitTop: inference.rawLogitTop,
        policyTop: inference.policyTop,
        value: inference.value,
        score: inference.score,
        visits: search.visits,
        nodeCount: search.nodeCount || 0,
        elapsedMs: Date.now() - startedAt,
        searchElapsedMs: search.elapsedMs,
        candidates: search.candidates,
        legalMoveCount: encoded.legalMask.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0),
        legalMoveSource: Array.isArray(message.position?.legalMoves) && message.position.legalMoves.length ? "provided" : "board_empty_points_fallback",
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
    playMove,
    moveToIndex,
    indexToMove,
    softmaxMasked,
    normalizeInferenceOutputs,
    applyRootStrategicPriorSafety,
    runRootMcts,
    runNeuralMcts,
    WorkerState,
    handleMessage,
    DEFAULT_MODES
  };
});
