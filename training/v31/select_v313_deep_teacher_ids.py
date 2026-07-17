#!/usr/bin/env python3
"""Select V3.1.3 position IDs for selective deep KataGo relabeling."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from generate_teacher_data import make_policy, policy_quality, reconstruct_position_from_id, tactical_family


TACTICAL_FAMILIES = {"weak_group", "escape", "counterattack", "connection", "cut", "capture_or_atari"}


def classify(position: dict, result: dict) -> str:
  family = tactical_family(position)
  phase = position.get("phase", "unknown")
  policy, target_type = make_policy(result, "visits")
  quality = policy_quality(result, policy, target_type)
  if quality["sharpTarget"] or quality["fewExploredMoves"]:
    return "v313_critical_1200"
  if family in {"weak_group", "escape"}:
    return "v313_weak_escape_512"
  if family in TACTICAL_FAMILIES or phase in {"late_middlegame_121_200", "endgame_201_plus"}:
    return "v313_strategic_256"
  if quality["lowVisit"]:
    return "v313_ordinary_128"
  return "v313_ordinary_128"


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--positions", default="evaluation/v200-positions.json")
  parser.add_argument("--analysis", default="evaluation/v200-katago-analysis-root.json")
  parser.add_argument("--out-dir", default="training/v31/generated/v313-id-selection")
  args = parser.parse_args()

  positions = json.loads(Path(args.positions).read_text(encoding="utf8"))["positions"]
  analysis = json.loads(Path(args.analysis).read_text(encoding="utf8"))["results"]
  pos_by_id = {p["positionId"]: p for p in positions}
  buckets: dict[str, list[str]] = {}
  family_counts = Counter()
  phase_counts = Counter()
  for result in analysis:
    position = pos_by_id.get(result["positionId"]) or reconstruct_position_from_id(result)
    if not position:
      continue
    profile = classify(position, result)
    buckets.setdefault(profile, []).append(result["positionId"])
    family_counts[tactical_family(position)] += 1
    phase_counts[position.get("phase", "unknown")] += 1

  out_dir = Path(args.out_dir)
  out_dir.mkdir(parents=True, exist_ok=True)
  profile_counts = {}
  for profile, ids in sorted(buckets.items()):
    unique_ids = sorted(set(ids))
    profile_counts[profile] = len(unique_ids)
    (out_dir / f"{profile}-ids.json").write_text(json.dumps({"positionIds": unique_ids}, indent=2), encoding="utf8")

  report = {
    "schema": "gokidcoach-v313-deep-teacher-id-selection",
    "sourceAnalysis": args.analysis,
    "totalUniquePositions": sum(profile_counts.values()),
    "profileCounts": profile_counts,
    "phaseDistribution": dict(phase_counts),
    "tacticalFamilyDistribution": dict(family_counts),
    "policy": {
      "ordinary": "minimum 128 visits",
      "strategic_or_tactical": "minimum 256 visits",
      "weak_group_or_escape": "minimum 512 visits",
      "sharp_or_few_explored": "1200 visits",
    },
  }
  (out_dir / "selection-report.json").write_text(json.dumps(report, indent=2), encoding="utf8")
  print(json.dumps(report, indent=2))
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
