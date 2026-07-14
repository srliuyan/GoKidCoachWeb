# Changelog

## V1.6.3-rc1 Release Candidate - 2026-07-14

- Froze release-candidate metadata at productVersion `1.6.3-rc1`, engineVersion `coherent-stress-hardened-v1`, buildId `gokidcoach-1.6.3-rc1-coherent-stress-hardened-v1-20260714`.
- Integrated the V1.6 tactical final-selector guard, V1.6.1 endgame selector corrections, V1.6.2 sente/gote confidence correction and V1.6.3 test/report separation.
- Preserved benchmark quality: exactMatchRate `0.149`, goodOrBetterRate `0.216`, endgameGoodOrBetterRate `0.108`, averageScoreLossFromBest `9.513055`, rejectedMoveRate `0`.
- Verified clean test mode: two full normal test loops produced zero tracked-file hash changes and zero canonical report hash changes.
- Added V1.6.3 full-regression behavior, final-selector and release-artifact audits.
- No deployment.

## V1.5.1 Safe Legacy Cleanup - 2026-07-13

- Promoted release metadata to productVersion `1.5.1`, engineVersion `candidate-coverage-v1`, buildId `gokidcoach-1.5.1-candidate-coverage-v1-20260713`.
- Added cleanup dependency, unused-code, service-worker asset and behavior-lock audits.
- Removed duplicate fallback BUILD_INFO literals from `sw.js`, `product-support.js` and `app.js`.
- Kept difficulty mappings, candidate ranking, scoring weights, ContextFusion and local-reading limits unchanged.
- Added `test-cleanup-integrity.js` to verify cached assets, BUILD_INFO source, behavior locks, export integrity, build consistency and long-game stability.
- Retained historical evaluation reports and emergency fallback paths where dependency evidence did not prove safe deletion.
- No deployment.

## V1.0 Final Engine Safety Fix - 2026-07-13

- Added offline raw urgent-source analysis support in `training/evaluate_policy.py`.
- Generated `raw-urgent-source-audit.json` and `raw-urgent-source-report.json`.
- Tested bounded raw urgent-source profiles without applying them to browser runtime.
- Confirmed no profile passed all V1.0 acceptance gates.
- Kept browser runtime on verified baseline metrics.
- Added V1.0 release guardrail tests for captures, rescues, necessary connections, legal move safety, opening coherence, yose-vs-dame behavior, and difficulty coherence.
- Froze engine scoring for V1.0 product completion.
- Added diagnostic shallow tactical verification APIs and tests.
- Activated bounded shallow tactical verification as a runtime safety layer for verified urgent moves and immediate refutations.
- Evaluated shallow verification profiles; no profile passed V1.0 gates, so browser runtime selection remains on the frozen baseline.
- Added V1.0 product-support layer for difficulty modes, IndexedDB snapshots, SGF round-trip support and local diagnostics.
- Added child color selection, continue/clear save actions, debug summary export and visible version text in parent view.
- Updated PWA cache to `gokidcoach-web-v43-local-reading-dev` and kept evaluation JSON excluded from runtime cache.
- Added product release tests.

Final baseline:

- exactMatchRate: 0.149
- goodOrBetterRate: 0.216
- endgameGoodOrBetterRate: 0.108
- averageScoreLossFromBest: 9.513055
- conflictingSourceFrequency: 0.200
- rejectedMoveRate: 0.0
