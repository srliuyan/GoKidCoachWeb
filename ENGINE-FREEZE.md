# GoKidCoach Engine Freeze

## V1.6.3 Stable Coherent Stress-Hardened Release

- Product version: `1.6.3`
- Engine version: `coherent-stress-hardened-v1`
- Freeze date: 2026-07-14
- Build id: `gokidcoach-1.6.3-coherent-stress-hardened-v1-20260714-final`
- Runtime baseline update: no benchmark baseline update
- Deployment: final GitHub Pages release

V1.6.3 promotes the validated V1.6.3-rc1 code to stable release metadata only. It includes the approved V1.6 verified urgent/profitable tactical final guard, V1.6.1 endgame tactical precedence, low-value second-line and large-yose fixes, V1.6.2 sente/gote detector-confidence correction and V1.6.3 test/report separation. It does not add candidate generation, ranking, scoring, difficulty, reading-depth, database, MCTS, neural, backend or KataGo changes.

Stable release gates passed with:

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- rejectedMoveRate: 0
- calibratedEndgameBadMoveCount: 0
- senteGoteMisclassificationCount: 0
- tacticalOverrideMissedCount: 0
- 300-move performance: passed

## V1.6.3-rc1 Coherent Stress-Hardened Candidate

- Product version: `1.6.3-rc1`
- Engine version: `coherent-stress-hardened-v1`
- Freeze date: 2026-07-14
- Build id: `gokidcoach-1.6.3-rc1-coherent-stress-hardened-v1-20260714`
- Runtime baseline update: no benchmark baseline update
- Deployment: no

V1.6.3-rc1 combines the approved V1.6 tactical final-selector guard, V1.6.1 endgame selector corrections, V1.6.2 sente/gote confidence fix and V1.6.3 test/report separation. It does not add candidate generation, ranking, scoring, difficulty, reading-depth, database, MCTS, neural, backend or KataGo changes.

Release-candidate gates passed with:

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- rejectedMoveRate: 0
- calibratedEndgameBadMoveCount: 0
- senteGoteMisclassificationCount: 0
- tacticalOverrideMissedCount: 0
- 300-move performance: passed

## V1.2 Coherent Core Engine State

- Final engine version: bounded-local-reading-v1
- Freeze date: 2026-07-13
- Final Git commit: unavailable in this workspace; `git rev-parse --short HEAD` reports this directory is not a Git repository.
- Benchmark seed: 20260710
- Runtime baseline update: no
- Browser runtime scoring changed in final stage: yes, coherent candidate filtering and phase-responsibility normalization
- Raw urgent-source correction accepted: no
- Shallow tactical verification accepted: yes, as a bounded safety layer

## Baseline Reference Metrics

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- conflictingSourceFrequency: 0.200
- rejectedMoveRate: 0.0
- scoringLatencyMs: 17.633251

## Final Engine Decision

V1.2 reopens the V1.0 frozen baseline to address real-play weakness: incoherent legal moves, weak difficulty separation, underprotected urgent tactics and low-value endgame selection.

V1.2 applies coherent candidate filtering, bounded shallow tactical verification, stronger difficulty policies, and source-responsibility normalization. It still does not add MCTS, neural networks, KataGo, backend services, or a second engine.

The shallow tactical verification layer is active as a bounded safety layer before difficulty selection. It verifies obvious captures, atari rescues, necessary unsafe-group connections and immediate refutations with a 1-2 ply direct-reply limit. It does not add MCTS, neural networks, full-board deep search or broad score-weight changes.

`product-support.js` is permitted as a product layer for persistence, SGF export, release difficulty labels and diagnostics. It is not an engine module and must not alter scoring, fusion or candidate ranking.

## Shallow Tactical Verification Limits

- normal verified candidates: 12
- absolute maximum candidates: 16
- maximum direct replies per candidate: 5
- maximum depth: AI move plus one opponent reply
- hard design goal: no general recursive search

## Files Frozen For V1.0 Product Completion

These files should be treated as frozen during product completion unless a release-blocking issue is reproduced:

- `GoKidCoachWeb/app.js`
- `GoKidCoachWeb/context-fusion.js`
- `GoKidCoachWeb/position-evaluator.js`
- `GoKidCoachWeb/move-quality-controller.js`
- `GoKidCoachWeb/difficulty-controller.js`
- `GoKidCoachWeb/rule-engine.js`
- `GoKidCoachWeb/tactical-library.js`
- `GoKidCoachWeb/tactical-db.json`
- `GoKidCoachWeb/endgame-db.json`
- `GoKidCoachWeb/pattern-db.json`
- `GoKidCoachWeb/shape-library.json`
- `GoKidCoachWeb/fuseki-db.json`
- `GoKidCoachWeb/joseki-db.json`

## Prohibited Changes During Product Completion

- Do not alter engine scoring weights.
- Do not add a new engine, controller, browser database, backend, cloud API, MCTS, neural network, or KataGo dependency.
- Do not modify RuleEngine legality behavior.
- Do not apply speculative positionScore gating, dame suppression, or tactical-score floors.
- Do not update the benchmark baseline without a separate verified release decision.

## Conditions For Reopening Engine Work

Reopen engine development only if real child games show a repeated serious issue:

- repeated missed captures
- repeated failure to rescue groups in atari
- repeated meaningless moves
- repeated unstable difficulty behavior
- repeatable crash or illegal move

A single unusual move is not sufficient to reopen engine work.

## V1.5.1 Cleanup Checkpoint

- Cleanup checkpoint branch: `v1.5.1-pre-cleanup-20260713-162431`
- File backup: `/tmp/gokidcoach-pre-cleanup-20260713-162431/`
- Functional intent: no playing-behavior change
- Removed active duplicate metadata fallbacks from `sw.js`, `product-support.js` and `app.js`
- BUILD_INFO remains the single active source for product version, engine version, buildId and cache namespace
- Difficulty mappings, scoring weights, local-reading limits and candidate ranking remain unchanged
- Cleanup validation uses `pre-cleanup-behavior-lock.json`, `post-cleanup-behavior-lock.json` and `cleanup-behavior-comparison.json`
