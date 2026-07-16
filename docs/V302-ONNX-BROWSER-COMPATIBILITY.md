# GoKidCoach V3.0.2 ONNX Browser Compatibility

Status: blocked because no ONNX graph was produced. V3.0.3 confirmed the blocker is the lack of an official PyTorch loader for the selected legacy KataGo `.txt.gz` model, not browser packaging.

## Expected Graph Characteristics

A faithful export of `g170e-b10c128-s1141046784-d204142634` would likely require these operator families:

- convolution;
- batch or fixed normalization arithmetic;
- activation functions;
- residual additions;
- global pooling or reduce operations;
- matrix multiplication for global/pass branches;
- reshape/transpose operations;
- policy, value, score, and ownership output heads.

## WebGPU Compatibility

Plausible but unproven. ONNX Runtime Web WebGPU generally supports common neural-network operators, but this model cannot be declared compatible until a real ONNX graph exists and every exported operator is checked against the browser execution provider.

Current status: blocked.

## WASM Compatibility

Plausible but unproven. ONNX Runtime Web WASM is a reasonable fallback for common operators, but no load or inference test can be run without a real ONNX graph.

Current status: blocked.

## Static Hosting Implications

The selected source model is small enough for the initial static-file budget:

- compressed source: 14.47 MB;
- uncompressed source: 36.48 MB.

The final ONNX size is unknown. A faithful FP32 ONNX graph may be larger than the compressed KataGo source text. Future browser packaging must use one static model file or explicit ONNX external-data files with stable MIME behavior on GitHub Pages.

## Size-Reduction Options

| Option | Expected size reduction | Compatibility risk | Accuracy risk | Status |
| --- | ---: | --- | --- | --- |
| ONNX graph optimization | Low to medium | Low | Low | Evaluate after FP32 baseline |
| Constant folding | Low | Low | Low | Evaluate after FP32 baseline |
| FP16 conversion | Medium | Medium on WebGPU/WASM | Medium | Only after FP32 equivalence passes |
| Weight compression | Medium | Low to medium | Low | Browser decompression path required |
| Dynamic quantization | Medium | Medium | Medium | Not before FP32 baseline |
| Static quantization | High | Medium to high | High | Not before representative calibration |
| Ownership-head removal | Low to medium | Low | Low for move selection | Only after native equivalence for retained heads |
| Score-head removal | Low | Low | Medium for future scoring | Avoid initially |
| External data splitting | No true reduction | Medium | None | Use only if model size forces it |

## Browser Route Verdict

The browser-local route remains technically possible, but V3.0.2 does not prove it. The next step must be a real exporter and native-vs-ONNX numerical equivalence, not browser inference code.
