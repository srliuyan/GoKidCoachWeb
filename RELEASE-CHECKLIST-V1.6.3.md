# GoKidCoach V1.6.3 Release Checklist

- Branch: `dev/v1.6-bad-move-stress`
- Product version: `1.6.3`
- Engine version: `coherent-stress-hardened-v1`
- Build id: `gokidcoach-1.6.3-coherent-stress-hardened-v1-20260714-final`
- Deployment target: GitHub Pages

## Required Gates

- Full normal test loop twice: passed
- Tracked-file changes from normal tests: 0
- Canonical report changes from normal tests: 0
- `node --check GoKidCoachWeb/*.js`: passed
- `python3 -m py_compile training/evaluate_policy.py`: passed
- 1000-position benchmark check: passed, baseline unchanged
- 907-position V1.6 stress check: passed
- 300-position V1.6.1 endgame audit: passed
- V1.6.2 sente/gote audit: passed
- 300-move performance: passed
- Build consistency: passed
- Export integrity: passed
- Phase transition: passed
- Final selector integrity: passed
- Release artifact audit: passed

## Included Corrections

- V1.6 verified urgent/profitable tactical final guard
- V1.6.1 endgame tactical precedence, low-value second-line and large-yose fixes
- V1.6.2 sente/gote detector-confidence correction
- V1.6.3 test/report separation and clean validation workflow

## Release Decision

V1.6.3 is safe to publish from the validated release-candidate state. Final deployment requires successful branch/tag push, main update, GitHub Pages deployment and production verification.
