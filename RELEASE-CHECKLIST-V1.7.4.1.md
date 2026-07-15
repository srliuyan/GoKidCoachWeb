# GoKidCoach V1.7.4.1 Release Checklist

- [x] Confirmed local release repo: `GoKidCoachWeb`.
- [x] Confirmed pre-patch HEAD: `ba834f53acd462ba12e40448f7c5969fd999d08f`.
- [x] Confirmed `v1.7.4` peels to `a10578aac118cc4e3ae3f5c110da01b7732f3620`; tag is not moved.
- [x] Created rollback checkpoint branch `rollback/v1.7.4.1-prepatch` at `ba834f53acd462ba12e40448f7c5969fd999d08f`.
- [x] Audited post-`v1.7.4` deployed delta in `evaluation/v1741-release-delta-audit.json`.
- [x] Set productVersion to `1.7.4.1`.
- [x] Kept engineVersion `conditional-reply5-v1`.
- [x] Added visible `👑 职业模式（最高棋力）` option mapped to `MAX_STRENGTH_FIXED`.
- [x] Kept `🤖 自适应陪练` as the default recommended mode.
- [x] Preserved Pages exclusion alignment.
- [x] Documented no new strength algorithms.

Final release, tag and production deployment must occur only after full regression gates pass.
