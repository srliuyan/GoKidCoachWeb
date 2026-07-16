# GoKidCoach V3.0.1 KataGo Conversion Assessment

Status: feasibility assessment only. No conversion was executed in this task.

## Source Format

KataGo public networks are distributed as compressed model weight files, commonly `.bin.gz`, for the native KataGo engine. The official engine supports native GPU/CPU backends such as OpenCL, CUDA, TensorRT, and Eigen. These binaries and backends do not run directly inside iPad Safari.

## ONNX Export Feasibility

Exporting a KataGo network to ONNX appears technically possible in principle, but is not validated yet.

Required work:

- inspect the exact selected network header and architecture;
- confirm feature-plane count, global inputs, policy head, value head, score head, and ownership head;
- locate or build a loader that can construct the equivalent inference graph;
- export a smaller inference-only graph;
- validate output equivalence against native KataGo for fixed positions;
- verify ONNX Runtime Web operator coverage for the exported graph;
- verify WebGPU and WASM execution providers on Safari.

## Known Conversion Risks

- Modern KataGo models are large and may exceed iPad memory or first-load budget.
- Native KataGo includes rule, komi, symmetry, ownership, score, and global feature handling that must be represented exactly.
- Some model outputs are useful for analysis but unnecessary for bounded gameplay. Ownership can be omitted only if the selected runtime logic does not depend on it.
- FP16 and quantization may reduce memory, but must be validated against native output.
- No successful browser ONNX conversion is claimed by this audit.

## Smaller Graph Target

The first prototype should prefer:

- board size: 19x19;
- policy output: 362 logits, including pass;
- value output: scalar win/value estimate;
- optional score output if available;
- ownership omitted unless required by the selected model contract;
- single batch inference;
- deterministic feature schema;
- one loaded model and one active inference session.

## Recommendation

Do not attempt a full browser KataGo port first. The credible next step is to choose one small public network, export or convert only the inference graph, and validate a small fixed-position output comparison against native KataGo before any MCTS integration.
