# GoKidCoach V3.1.0 Student Model Design

Status: Stage A pipeline and tiny training smoke.

## Architecture Comparison

| Candidate | Blocks | Channels | Parameters | FP32 | FP16 | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A `res6c64` | 6 | 64 | 735,587 | 2.94 MB | 1.47 MB | selected baseline |
| B `res8c64` | 8 | 64 | 883,299 | 3.53 MB | 1.77 MB | more trunk capacity |
| C `res6c96` | 6 | 96 | 1,304,291 | 5.22 MB | 2.61 MB | stronger ceiling, higher activation cost |

All candidates use browser-friendly ONNX operators: `Conv`, `Relu`, `Add`, `Gemm`, `Flatten`, and `Concat`. Softmax and legal masking are handled outside the graph.

## Selected Baseline

`res6c64` is selected for the first browser-local student because it is small, static-shape, and has the lowest iPad memory risk. It is intended to improve candidate generation and leaf evaluation, not to reproduce KataGo strength.

## Teacher Labels

Stage A uses cached KataGo analysis-mode output from the V2 external benchmark. If raw root policy is available, it is converted to a valid probability target; negative or non-normalized policy arrays are treated as logits and passed through softmax. Otherwise, normalized root visit counts are used as search-policy distillation.

The V2 source positions contain coarse tags rather than exact tactical labels. Stage A therefore records deterministic coarse families: explicit endgame/opening/whole-board tags are preserved, and broad tactical-high-risk positions are assigned to stable hash buckets for capture-or-atari, cut, connection, counterattack, escape, and weak-group coverage. These labels are for balancing and reporting only; they are not fabricated engine traces.

## Dataset Stages

- Stage A: 1,000 positions, smoke pipeline.
- Stage B: 20,000 positions, architecture comparison.
- Stage C: 100,000-300,000 positions, first real student.

Stage C is not started in V3.1.0.

## Browser Constraints

The selected graph exports to one fixed-shape ONNX file. FP32 is validated first; FP16 is deferred until after equivalence and browser WebGPU tests.
