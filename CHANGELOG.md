# Changelog

## V1.0 Final Engine Safety Fix - 2026-07-13

- Added offline raw urgent-source analysis support in `training/evaluate_policy.py`.
- Generated `raw-urgent-source-audit.json` and `raw-urgent-source-report.json`.
- Tested bounded raw urgent-source profiles without applying them to browser runtime.
- Confirmed no profile passed all V1.0 acceptance gates.
- Kept browser runtime on verified baseline metrics.
- Added V1.0 release guardrail tests for captures, rescues, necessary connections, legal move safety, opening coherence, yose-vs-dame behavior, and difficulty coherence.
- Froze engine scoring for V1.0 product completion.
- Added diagnostic shallow tactical verification APIs and tests.
- Evaluated shallow verification profiles; no profile passed V1.0 gates, so browser runtime selection remains on the frozen baseline.
- Added V1.0 product-support layer for difficulty modes, IndexedDB snapshots, SGF round-trip support and local diagnostics.
- Added child color selection, continue/clear save actions, debug summary export and visible version text in parent view.
- Updated PWA cache to `gokidcoach-web-v39-rc1` and kept evaluation JSON excluded from runtime cache.
- Added product release tests.

Final baseline:

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- conflictingSourceFrequency: 0.200
- rejectedMoveRate: 0.0
