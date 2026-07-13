# V1.0 Release Checklist

Build under test:

- productVersion: `1.0.0-rc1`
- engineVersion: `baseline-v3.6-frozen`
- serviceWorkerCache: `gokidcoach-web-v39-rc1`

## Automated

- [x] Engine scoring remains frozen.
- [x] Shallow tactical verification remains inactive in `app.js`.
- [x] `node GoKidCoachWeb/test-product-release.js` passes.
- [x] All `GoKidCoachWeb/test-*.js` pass.
- [x] `node --check GoKidCoachWeb/*.js` passes.
- [x] SGF export round-trip test passes.
- [x] Service worker cache is versioned.
- [x] Evaluation JSON files are not precached.

## Product Flow

- [x] Start a new 19x19 game.
- [x] Choose child color.
- [x] Child move, AI response and turn alternation.
- [x] Captures, occupied-point rejection, suicide prevention and ko handling use existing RuleEngine/runtime rules.
- [x] Pass and two-pass end confirmation.
- [x] Save after move, continue last game and clear save.
- [x] SGF export and debug summary export.
- [x] Four difficulty modes persist.

## Manual Before Release

- [ ] Install from iPad Safari to home screen.
- [ ] Reopen installed PWA offline after first load.
- [ ] Complete one real 19x19 game on iPad.
- [ ] Rotate portrait/landscape and verify board touch accuracy.
- [ ] Confirm no accidental page scrolling while playing.
- [ ] Confirm parent panel version text is visible.

## Release Decision

V1.0 can ship when all automated checks pass and the manual iPad checks above are completed.
