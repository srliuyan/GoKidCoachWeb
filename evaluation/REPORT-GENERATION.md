# Evaluation Report Generation

Normal validation uses check mode and must not rewrite canonical reports:

```sh
node evaluation/run-v16-bad-move-stress.js --check --seed 20260713 --positions 907
node evaluation/run-v161-endgame-audit.js --check --seed 20260713 --positions 300
node evaluation/run-v162-sente-gote-audit.js --check --seed 20260713 --positions 300 --runtime-integrated
node evaluation/run-long-game-performance.js --check
node evaluation/run-v14-audits.js --check
node evaluation/run-v15-middlegame-audit.js --check
node evaluation/run-cleanup-audit.js --check
node evaluation/run-opening-coherence-audit.js --check
```

Report refresh is explicit:

```sh
node evaluation/run-v16-bad-move-stress.js --write-reports --seed 20260713 --positions 907
node evaluation/run-v161-endgame-audit.js --write-reports --seed 20260713 --positions 300
node evaluation/run-v162-sente-gote-audit.js --write-reports --seed 20260713 --positions 300 --runtime-integrated
node evaluation/run-long-game-performance.js --write-reports
node evaluation/run-v14-audits.js --write-reports
node evaluation/run-v15-middlegame-audit.js --write-reports
node evaluation/run-cleanup-audit.js --write-reports
node evaluation/run-opening-coherence-audit.js --write-reports
```

Use `--output-dir <dir>` to write reports into a temporary directory for reproducibility checks.
