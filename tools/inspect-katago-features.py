#!/usr/bin/env python3
"""Inspect deterministic KataGo feature-encoding readiness for V3.0.3."""

import argparse
import hashlib
import json
from pathlib import Path


def fixture_hash_without_hash(fixture):
  data = {k: v for k, v in fixture.items() if k != "fixtureHash"}
  raw = json.dumps(data, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(raw.encode("utf8")).hexdigest()


def main(argv=None):
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--fixtures", required=True, type=Path)
  parser.add_argument("--out", type=Path)
  args = parser.parse_args(argv)

  data = json.loads(args.fixtures.read_text(encoding="utf8"))
  fixtures = data["fixtures"]
  checked = []
  mismatches = []
  for fixture in fixtures:
    computed = fixture_hash_without_hash(fixture)
    if computed != fixture["fixtureHash"]:
      mismatches.append({"id": fixture["id"], "expected": fixture["fixtureHash"], "actual": computed})
    checked.append({
      "id": fixture["id"],
      "boardSize": fixture["boardSize"],
      "sideToMove": fixture["sideToMove"],
      "rules": fixture["rules"],
      "komi": fixture["komi"],
      "passIndex": fixture["boardSize"] * fixture["boardSize"],
      "officialSpatialInputShape": [1, fixture["boardSize"] * fixture["boardSize"], 22],
      "officialGlobalInputShape": [1, 19],
      "featureStatus": "blocked_until_official_loader_runs",
      "tensorHash": None,
      "legalMaskAgreement": "not_checked_without_official_feature_encoder",
    })

  report = {
    "status": "failed" if mismatches else "blocked",
    "reason": "official feature tensors cannot be emitted until the official KataGo v8 feature encoder is executable from the bridge",
    "fixtureCount": len(fixtures),
    "hashMismatches": mismatches,
    "fixtures": checked,
  }
  if args.out:
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf8")
  print(json.dumps(report, indent=2))
  return 1 if mismatches else 0


if __name__ == "__main__":
  raise SystemExit(main())
