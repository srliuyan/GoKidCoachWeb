# GoKidCoach V3.0.1 Browser-Local Technology Audit

Status: research only. No runtime dependency or model is added.

## Highest Constraints

- Static GitHub Pages deployment.
- iPad Safari/PWA runtime.
- Free user operation.
- No paid API.
- No required private server or cloud inference.
- Existing legacy engine remains default.

## Route Audit

| Route | Feasibility | iPad Safari | GitHub Pages | Server/payment | Model path | Main blocker | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Official KataGo source compiled to WASM | Low to medium | Unproven | Possible in theory | None | Native `.bin.gz` | Native backend architecture, memory, threading, SAB/header constraints | Reject as first step |
| B. KataGo model converted to ONNX | Medium | Needs validation | Compatible | None | Small public KataGo net | Conversion and output validation not done | Strong candidate |
| C. KataGo to other browser format | Medium | Depends runtime | Compatible | None | TFJS/custom graph | More custom conversion work | Secondary |
| D. Existing browser Go WASM/WebGPU engine | Low | Unknown | Possibly | Depends project | Project-specific | No maintained browser KataGo port found in audit | Do not rely on it |
| E. Open Go policy/value net | Medium | Depends format | Compatible | None | KataGo/Minigo/Leela | License and conversion clarity vary | Candidate pool |
| F. ONNX Runtime Web WebGPU | High as runtime | Must test on real iPad | Compatible | None | ONNX | Operator/model compatibility | Primary runtime candidate |
| G. TensorFlow.js WebGPU | Medium | Must test on real iPad | Compatible | None | TFJS graph | Model conversion uncertainty | Alternative runtime |
| H. WebNN | Low now | Availability uncertain | Compatible | None | WebNN graph | Safari/operator coverage uncertainty | Not primary |
| I. Pure WASM CPU fallback | High as fallback | Likely | Compatible | None | ONNX WASM/custom | Performance | Fallback only |
| J. WebGPU inference + TS/WASM MCTS | High architecture fit | Must test on real iPad | Compatible | None | Small ONNX model | Requires bounded memory/search design | Recommended architecture |

## Browser KataGo Port Result

No maintained browser-local KataGo implementation suitable for direct use in iPad Safari was identified. Official KataGo should be treated as an offline reference and model source, not as a direct browser dependency.

## Runtime Comparison

| Runtime | Strengths | Risks | V3.0.1 role |
| --- | --- | --- | --- |
| ONNX Runtime Web WebGPU | Maintained, standard graph format, avoids custom shaders, static compatible | WebGPU availability and operator support must be measured on iPad | Primary |
| ONNX Runtime Web WASM | Static fallback, simpler compatibility | Slower, may not support enough visits | Fallback |
| TensorFlow.js WebGPU | Mature browser ML ecosystem | Go model conversion path less direct | Alternative |
| Custom WebGPU compute | Full control | High implementation and validation cost | Avoid initially |
| WASM-only custom inference | Predictable static delivery | Slow and custom model loader burden | Emergency fallback only |

## Resource Budget

Initial targets:

- compressed model: preferred <= 25 MB;
- runtime model memory: preferred <= 150 MB;
- total page working set: preferred <= 350 MB;
- one loaded model;
- one active inference session;
- no parallel MCTS searches;
- versioned static cache;
- no unbounded transposition table.

These are engineering targets, not proven Safari limits.
