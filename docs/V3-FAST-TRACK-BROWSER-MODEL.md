# GoKidCoach V3 Fast Track Browser Model

This note records the first usable browser student model candidate. It does not change production runtime behavior.

## Model

- Architecture: `res6c64`
- Parameters: `735587`
- Feature schema: `gokidcoach-v310-12plane-current-player`
- Policy target: KataGo root visit distribution, temperature `1.0`
- Heads: policy logits, value logit, normalized score
- Pass index: `361`

## Dataset

- Generated samples: `58000`
- Train / validation / holdout: `47208 / 5384 / 5408`
- Duplicate count: `0`
- Invalid count: `0`
- Average teacher visits: `76.08`

Phase distribution:

- opening 1-20: `6952`
- early middlegame 21-60: `14560`
- middlegame 61-120: `10544`
- late middlegame 121-200: `12064`
- endgame 201+: `13880`

Tactical family distribution:

- capture_or_atari: `4528`
- connection: `4336`
- counterattack: `4360`
- cut: `3992`
- escape: `3048`
- large_framework: `6112`
- large_endgame: `14832`
- ordinary: `9800`
- weak_group: `6992`

## Training Result

- Device: CUDA
- Best epoch: `2`
- Policy loss: `5.8976 -> 4.8074`
- Value loss: `0.7047 -> 0.4609`
- Score loss: `0.1941 -> 0.1336`

Holdout:

- Top1: `0.0039`
- Top3: `0.0163`
- Top10: `0.0658`
- Value MAE: `0.4399`
- Score MAE: `31.3432`
- Legal move rate after masking: `1.0`

## ONNX Artifacts

Generated artifacts are ignored and must not be committed yet.

- FP32 ONNX: `training/v31/generated/fast-track/student-res6c64-fp32.onnx`
- FP32 size: `2952968` bytes
- FP16 ONNX: `training/v31/generated/fast-track/student-res6c64-fp16-direct.onnx`
- FP16 size: `1479424` bytes
- Operators: `Add`, `Concat`, `Constant`, `Conv`, `Flatten`, `Gemm`, `Relu`, `Squeeze`
- ONNX checker: passed
- ONNX Runtime CPU: passed
- PyTorch/ONNX Top1/Top3/Top10 equivalence: `1.0 / 1.0 / 1.0`

Estimated iPad memory target for first browser integration: one model session, one active inference, roughly `60-120 MB` incremental working set before Safari measurement.

## Legacy Module Removal Map

- OpeningBook: retain temporarily for fallback.
- Pattern/Shape/Fuseki/Tactical/Joseki/Endgame libraries: retain temporarily for fallback and regression comparison.
- ContextFusion: retain temporarily for fallback.
- PositionEvaluator: retain temporarily for fallback and safety comparison.
- MidgameStability: retain temporarily for fallback.
- MoveQualityController: retain temporarily for fallback.
- CompanionEngine: retain temporarily until the neural mode replaces adaptive move selection.
- old multi-level difficulty UI: delete later when the two-mode UI is implemented.
- ability-profile UI: delete later when the simplified child product UI is implemented.
- V2 experimental evaluation code: retain as development-only benchmark tooling.

## Next Step

Integrate browser inference for this ONNX model behind the V3 engine boundary, then add lightweight bounded MCTS. Production should continue to default to the legacy engine until iPad Safari/PWA tests pass.
