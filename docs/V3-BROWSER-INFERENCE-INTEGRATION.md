# V3 Browser Inference Integration

This checkpoint wires the V3 engine boundary to a browser-local neural path without committing model binaries.

## Development Model

- Manifest: `models/student-res6c64-fp16.dev.json`
- Preferred model artifact: `training/v31/generated/fast-track/student-res6c64-fp16-direct.onnx`
- Format: ONNX FP16
- SHA-256: `fdc4e2f352d908cacc531ce1aa59c50f126e7b08e477c85c6f771a7cb832086e`
- Board size: `19`
- Spatial input: `[1, 12, 19, 19]`
- Global input: `[1, 4]`
- Pass index: `361`

The ONNX file remains ignored. It must be copied into a committed static model path only after the user approves committing model artifacts.

## Runtime Path

`EngineManager` now tries `NeuralMctsPrototypeEngine` first unless `preferNeural:false` is specified.

The neural path is:

1. encode GameCore-like position into the V3.1 feature schema;
2. send inference/search request to `engine/neural-mcts-worker.js`;
3. run ONNX Runtime Web session when `ort` is available;
4. apply legal move mask;
5. normalize policy;
6. run bounded root PUCT search;
7. return a legal move;
8. fall back to `LegacyEngineAdapter` when initialization, worker, inference, timeout, or stale-response checks fail.

The neural path does not call the old hand-built move-selection modules.

## Current Limitation

The repository does not yet include `onnxruntime-web` static JavaScript/WASM files. Browser WebGPU/WASM loading therefore returns `NOT_CONFIGURED` until those files are added as static assets.

Node tests use a mock ONNX session to verify feature encoding, legal masking, MCTS, cancellation, stale-response rejection, routing, and fallback without committing model binaries.

## Modes

- `自适应对弈`: lower bounded budget, default `48` visits, target `2000ms`, hard cap `3000ms`.
- `当前最高棋力`: higher bounded budget, default `96` visits, target `4000ms`, hard cap `5000ms`.

The adaptive mode does not intentionally choose bad moves. It may choose only near-equivalent moves based on the current value proxy.
