# GoKidCoach Engine Freeze

## V1.0 Release Engine State

- Final engine version: GoKidCoach V1.0 baseline engine
- Freeze date: 2026-07-13
- Final Git commit: unavailable in this workspace; `git rev-parse --short HEAD` reports this directory is not a Git repository.
- Benchmark seed: 20260710
- Runtime baseline update: no
- Browser runtime scoring changed in final stage: no
- Raw urgent-source correction accepted: no
- Shallow tactical verification accepted: no

## Final Benchmark Metrics

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- conflictingSourceFrequency: 0.200
- rejectedMoveRate: 0.0
- scoringLatencyMs: 17.633251

## Final Engine Decision

The final raw urgent-source analysis found the dominant defect to be missing necessary-connection evidence, but no tested profile passed all V1.0 release gates. The engine remains on the verified baseline runtime.

No V3.5 positionScore gate, V3.6 urgent protection profile, or V1.0 raw urgent-source profile is applied to browser move selection.

The shallow tactical verification layer was implemented as a reusable diagnostic API and evaluated with bounded 1-2 ply profiles. No profile passed all V1.0 gates, so it is not active in browser move selection for the frozen V1.0 engine.

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
