# GoKidCoach V3.1.1 First Learnable Student

Status: offline teacher-student training gate. No browser integration, MCTS, production UI change, or deployment.

## Dataset

V3.1.1 uses cached KataGo analysis as an offline teacher and distills search-visit policy targets. The 20,000-row dataset is produced from deterministic position/profile rows plus board symmetries. Splits are assigned by `basePositionId`, so profiles and symmetries of the same base position stay in the same train, validation, or holdout split.

Generated artifacts remain under ignored paths:

- `training/v31/generated/`
- `training/v31/checkpoints/`
- `training/v31/private/`

## Root Cause of V3.1.0 Top-0 Policy Metrics

The V3.1.0 smoke run used only 1,000 positions and preferred cached raw policy arrays. Most cached raw policy arrays were very smooth after normalization, so the supervised target did not give a strong top-move signal in a tiny training run. Coordinate mapping, pass index 361, legal mask indexing, and policy top move decoding were checked and did not explain the zero top1/top3 result.

V3.1.1 uses `search_visit_policy` targets derived from KataGo root visits. This produces a sharper teacher target and demonstrates measurable policy learning.

## Model

The accepted baseline remains `res6c64`:

- 6 residual blocks
- 64 channels
- 735,587 parameters
- FP32 ONNX size about 2.95 MB
- browser-friendly ONNX operators only

A controlled `res8c64` comparison was run. It improved top-k rates but had worse validation KL/value/score behavior in this short run, so it is not selected as the baseline checkpoint.

## Gate Result

The V3.1.1 baseline demonstrates real teacher-policy learning:

- policy loss decreased from 5.8924 to 4.8658
- validation top1/top3/top5/top10: 0.0011 / 0.0085 / 0.0124 / 0.0468
- holdout top1/top3/top5/top10: 0.0042 / 0.0088 / 0.0151 / 0.0541
- legal move rate after masking: 1.0
- ONNX export and PyTorch/ONNX equivalence passed

The model is still weak. V3.1.1 proves learnability, not playing strength.
