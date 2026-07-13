# GoKidCoach V1.0 Known Engine Limitations

The V1.0 engine is frozen on the verified baseline runtime. The following limitations are known and accepted for the first playable release.

## Urgent Source Generation

The final audit found 573 urgent override cases. Root-cause distribution:

- necessary connection evidence missing: 231
- confidence incorrectly reduces urgent evidence: 162
- territory proxy dominates: 78
- rescue evidence missing: 60
- edge/emptiness proxy dominates: 39
- duplicate non-urgent evidence: 3

The dominant verified defect is missing necessary-connection evidence before ContextFusion. Tested raw-source profiles did not pass all V1.0 gates, so no runtime correction was applied.

## Shallow Verification

A bounded shallow tactical verifier is active for obvious captures, atari rescues, necessary connections and immediate refutations. It is limited to a small candidate set and direct opponent replies. It is not a full search engine, so longer ladders, multi-step semeai and whole-board timing can still be wrong.

## Endgame Value

The engine can still overvalue some neutral or redundant endgame moves because positionScore and endgameScore may reward local emptiness, edge proximity, or duplicated territory evidence. Broad suppression reduced dame errors in diagnostics but damaged urgent tactical handling, so it is not part of V1.0.

## Tactical Safety

Immediate captures, atari rescues, and necessary connections are recognized by existing runtime helpers and guardrail tests, but benchmark diagnostics still show source-generation misses in some positions. V1.0 prioritizes stable playable behavior over speculative tactical tuning.

## Difficulty

Difficulty selection remains deterministic and lightweight. Lower difficulty must continue selecting coherent legal candidates, but it is not expected to perfectly imitate a human child at every level.

## Release Policy

Do not reopen engine scoring for isolated unusual moves. Reopen only for repeated, reproducible serious issues observed in real child games.

## V1.0 Product Notes

- Endgame good-or-better remains 0.108 and is not a V1.0 release blocker.
- Physical iPad Safari installation, offline reopening and rotation/touch accuracy still require manual device checks.
- Runtime assets are large because the opening book and victory image are precached; this is acceptable for first release but should be watched on older iPads.

## Cleanup Retained Items

- Emergency fallback selection remains present, but tests require it to be unreachable when meaningful candidates exist.
- Some local app rule helpers remain separate from RuleEngine helpers because consolidation could change legacy app-state behavior.
- Historical evaluation reports remain in `evaluation/` for regression audits and are excluded from service-worker runtime caching.
- Local reading remains bounded and does not attempt long ladders, complex semeai, full-board search, MCTS or neural evaluation.
