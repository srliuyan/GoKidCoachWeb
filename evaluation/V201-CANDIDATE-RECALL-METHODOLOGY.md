# GoKidCoach V2.0.1 Candidate Recall Methodology

V2.0.1 uses the frozen V2.0.0 external KataGo benchmark as an offline judge. KataGo is not bundled, called, trained from, or embedded in the browser runtime.

The first objective is candidate recall, not deeper search. MAX mode keeps the existing top-10 reading cap, depth 3, conditional reply-5 policy, and continuation limits. Lower modes do not receive V2.0.1 candidate injections.

## Baseline

The immutable compact baseline is `evaluation/baselines/v200-external-baseline-summary.json`. It records only aggregate metrics, source hashes, KataGo/model/config hashes, unstable exclusion counts, phase summaries, and anonymized unstable IDs. Private SGFs, debug exports, full position payloads, JSONL caches, and KataGo outputs remain ignored.

## Split

`evaluation/run-v201-candidate-recall-audit.js` assigns positions deterministically to development or holdout by hashing the position ID. Generator thresholds must not be tuned from holdout-only failures.

## Candidate Families

Missed KataGo best moves are classified into explainable families such as urgent group defense, counterattack, cut, connection, escape, invasion, reduction, whole-board direction, and endgame. Equivalent nearby moves are reported separately and are not treated as hard candidate failures.

## Oracle Audit

The audit includes an offline-only oracle diagnosis that asks whether a missed KataGo move would be recoverable if it entered the candidate set. The script does not fabricate reading or final-selector traces that are unavailable in the frozen benchmark. Any move-quality metric for a newly selected move is reported only when that move is explicitly present in existing KataGo moveInfos.

## Runtime Scope

Runtime candidate additions are guarded by `MAX_STRENGTH_FIXED`. The patch does not change lower-mode behavior, difficulty mappings, scoring weights, reading depth, reply limits, finalSelectorGuard, or browser dependencies.
