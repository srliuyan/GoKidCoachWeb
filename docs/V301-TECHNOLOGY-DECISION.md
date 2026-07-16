# GoKidCoach V3.0.1 Technology Decision

Status: decision record for the next prototype step. No implementation is activated.

## Scoring

Scores are 1-5, where 5 is best.

| Route | Feasibility | iPad | GitHub Pages | Free | License clarity | Model availability | Expected strength | Model size | Complexity | Maintenance risk | Fallback quality | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| KataGo source to WASM | 2 | 2 | 3 | 5 | 4 | 5 | 5 | 2 | 1 | 2 | 2 | 33 |
| KataGo model to ONNX | 3 | 3 | 5 | 5 | 4 | 5 | 4 | 3 | 3 | 4 | 4 | 43 |
| KataGo to custom browser graph | 3 | 3 | 5 | 5 | 4 | 5 | 4 | 3 | 2 | 3 | 3 | 40 |
| Existing browser Go engine | 2 | 2 | 4 | 5 | 2 | 2 | 2 | 3 | 3 | 2 | 2 | 29 |
| Open Go net with TFJS | 3 | 3 | 5 | 5 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 37 |
| ONNX Runtime Web WebGPU | 4 | 3 | 5 | 5 | 5 | 4 | 4 | 3 | 4 | 4 | 4 | 45 |
| TensorFlow.js WebGPU | 3 | 3 | 5 | 5 | 5 | 3 | 3 | 3 | 3 | 4 | 3 | 40 |
| WebNN | 2 | 2 | 5 | 5 | 5 | 2 | 3 | 3 | 3 | 3 | 2 | 35 |
| Pure WASM CPU inference | 4 | 4 | 5 | 5 | 5 | 4 | 2 | 3 | 3 | 4 | 5 | 44 |
| WebGPU neural + bounded TS/WASM MCTS | 4 | 3 | 5 | 5 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 43 |

## Recommended Primary Route

Small public Go policy/value model converted to ONNX, executed by ONNX Runtime Web WebGPU inside a Worker, with bounded TypeScript or WASM MCTS.

This route minimizes custom GPU kernel work and remains compatible with static GitHub Pages hosting. It still requires real iPad validation before production integration.

## Recommended Fallback Route

Use the same ONNX model through ONNX Runtime Web WASM when WebGPU is unavailable or fails. If model initialization fails, fall back to the existing LegacyEngineAdapter.

## Initial Candidate Model

First inspect a small KataGo g170 network, preferably b6c96 or b10c128, because the official KataGo network license gives clearer redistribution terms than older GPL-tied alternatives and the model is more likely to fit iPad memory than current large b28/b40 networks.

The model is not approved for bundling until the exact artifact checksum, license status, size, feature schema, and ONNX conversion validation are recorded.

## Rejected or Deferred Routes

- Full KataGo-to-WASM port: too large and risky for the first browser feasibility step.
- Modern large KataGo b28/b40 networks: likely too large for initial iPad prototype.
- WebNN: insufficient practical Safari confidence for primary route.
- Leela Zero networks: license and maintenance concerns block recommendation until verified.
- Custom WebGPU kernels: unnecessary complexity before ONNX Runtime Web is proven insufficient.

## Unknowns Requiring Later Validation

- Actual iPad Safari WebGPU support and device limits.
- ONNX operator coverage for the selected exported model.
- Native KataGo versus ONNX output agreement.
- Cold-load and warm-inference timing.
- IndexedDB/Cache Storage quota behavior on iPad.
- MCTS responsiveness under Safari page lifecycle interruptions.

## Smallest Next Implementation Step

Download one small candidate model outside Git, record its hash and license, inspect its feature schema, attempt an ONNX inference-only export, and validate outputs against native KataGo on a small fixed position set. Do not integrate MCTS until that validation passes.
