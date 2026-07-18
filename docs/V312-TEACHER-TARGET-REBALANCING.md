# GoKidCoach V3.1.2 Teacher Target Quality and Dataset Rebalancing

V3.1.2 kept the browser student architecture fixed at `res6c64` and tested whether better teacher targets and a more balanced 20,000-position dataset improve the V3.1.1 supervised baseline before scaling data or integrating browser inference.

## Frozen Baseline

- Baseline commit: `5f6b67feb5970a3beddc9a659f9ecf2be2570651`
- Architecture: `res6c64`
- Dataset: 20,000 positions
- Policy target: `search_visit_policy`
- Holdout top1/top3/top5/top10: `0.0042 / 0.0088 / 0.0151 / 0.0541`
- Holdout policy KL: `4.4365`
- Holdout value MAE: `0.4279`
- Holdout score MAE/p90: `32.8429 / 70.1779`
- Legal move rate: `1.0`

## Teacher Quality Audit

The V3.1.2 generator records teacher visits, root move count, visit-share concentration, policy entropy, nonzero policy moves, score/winrate uncertainty, target type, pass probability flags, and confidence weights for every sample.

Problems found in the revised selected pool:

- `lowVisit`: 4,720 samples
- `fewExploredMoves`: 200 samples
- `sharpTarget`: 512 samples
- `flatTarget`: 0 samples
- `excessivePass`: 0 samples
- Average teacher visits: `86.7648`
- Average root move count: `6.4804`

The available cached teacher data still contains many quick-profile positions, so V3.1.2 improves accounting and weighting but does not create genuinely deeper teacher labels.

## Rebalancing

Original V3.1.1 phase distribution:

- opening: 1,509
- early middlegame: 5,994
- middlegame: 5,617
- late middlegame: 6,026
- endgame: 854

Revised V3.1.2 phase distribution:

- opening: 2,912
- early middlegame: 4,056
- middlegame: 5,000
- late middlegame: 5,032
- endgame: 3,000

Original V3.1.1 tactical distribution:

- capture_or_atari: 2,476
- connection: 2,412
- counterattack: 2,562
- cut: 2,460
- escape: 2,532
- large_framework: 925
- ordinary: 2,562
- weak_group: 2,561
- large_endgame: 1,510

Revised V3.1.2 tactical distribution:

- capture_or_atari: 1,808
- connection: 1,776
- counterattack: 1,720
- cut: 1,600
- escape: 1,688
- large_framework: 2,608
- ordinary: 1,600
- weak_group: 3,864
- large_endgame: 3,336

## Target Strategies

All variants used the same architecture, split method, seed, optimizer, learning-rate schedule, batch size, and loss weights.

- Variant A: root visits, temperature `1.0`, no confidence weights
- Variant B: root visits, temperature `1.3`, no confidence weights
- Variant C: root visits, temperature `1.3`, confidence weights enabled
- Variant D: root visits, temperature `0.8`, no confidence weights

Raw-policy blending was not selected because the available raw policy field was not verified as a stable full teacher-policy target for this gate.

## Results

Validation top1/top3/top5/top10:

- A: `0.0039 / 0.0118 / 0.0135 / 0.0456`
- B: `0.0028 / 0.0113 / 0.0146 / 0.0473`
- C: `0.0017 / 0.0107 / 0.0152 / 0.0445`
- D: `0.0051 / 0.0118 / 0.0248 / 0.0456`

Holdout top1/top3/top5/top10:

- A: `0.0031 / 0.0067 / 0.0093 / 0.0418`
- B: `0.0031 / 0.0067 / 0.0093 / 0.0449`
- C: `0.0031 / 0.0062 / 0.0072 / 0.0439`
- D: `0.0031 / 0.0077 / 0.0170 / 0.0444`

Holdout KL / value MAE / score MAE / score p90:

- A: `4.4241 / 0.4340 / 31.6588 / 66.3370`
- B: `4.2534 / 0.4340 / 31.6724 / 66.3300`
- C: `4.2594 / 0.4340 / 31.6202 / 66.6685`
- D: `4.6076 / 0.4340 / 31.6469 / 66.4187`

## Gate Result

V3.1.2 gate failed.

The revised targets improved policy KL for B/C and score MAE versus V3.1.1, but holdout top3 and top10 did not improve over the V3.1.1 baseline. The result does not justify scaling data or browser integration yet.

Selected diagnostic winner: Variant B, because it had the best holdout policy KL and the best holdout top10 among V3.1.2 variants. It is not an accepted replacement for V3.1.1.

## Next Step

Before increasing dataset size, improve teacher-label quality with selectively deeper KataGo reanalysis for low-visit, weak-group, escape, counterattack, late-middlegame, and endgame positions. The current cached quick labels remain too sparse for reliable top-k learning.
