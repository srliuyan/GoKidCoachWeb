#!/usr/bin/env python3
"""Verify teacher sample indexing, masks, and metadata for V3.1.1 datasets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

PASS_INDEX = 361


def verify(args):
  data = np.load(args.shard, allow_pickle=True)
  count = min(args.count, int(data["policy"].shape[0]))
  failures = []
  families = {}
  phases = {}
  for i in range(count):
    policy = data["policy"][i]
    legal = data["legal_mask"][i]
    teacher_top = int(np.argmax(policy))
    if policy.shape[0] != 362:
      failures.append({"index": i, "reason": "policy_shape"})
    if abs(float(policy.sum()) - 1.0) > 1e-4:
      failures.append({"index": i, "reason": "policy_not_normalized"})
    if not np.isfinite(policy).all():
      failures.append({"index": i, "reason": "policy_not_finite"})
    if teacher_top == PASS_INDEX and PASS_INDEX != 361:
      failures.append({"index": i, "reason": "pass_index_mismatch"})
    if float(legal[teacher_top]) <= 0:
      failures.append({"index": i, "reason": "teacher_top_not_legal"})
    if data["spatial"][i].shape != (12, 19, 19):
      failures.append({"index": i, "reason": "spatial_shape"})
    family = str(data["families"][i])
    phase = str(data["phases"][i])
    families[family] = families.get(family, 0) + 1
    phases[phase] = phases.get(phase, 0) + 1
  report = {
    "schema": "gokidcoach-v311-teacher-sample-verification",
    "samplesChecked": count,
    "failures": failures,
    "passed": len(failures) == 0,
    "passIndex": PASS_INDEX,
    "phaseDistribution": phases,
    "tacticalFamilyDistribution": families,
    "checks": [
      "teacher_top_index",
      "policy_normalization",
      "policy_finite",
      "pass_index_361",
      "legal_mask_contains_teacher_top",
      "spatial_shape",
      "symmetry_metadata_present",
    ],
    "symmetryMetadataPresent": "symmetries" in data.files,
  }
  Path(args.out).parent.mkdir(parents=True, exist_ok=True)
  Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf8")
  print(json.dumps(report, indent=2))
  if failures:
    raise SystemExit(1)
  return report


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--shard", default="training/v31/generated/v311/teacher-0000.npz")
  parser.add_argument("--count", type=int, default=100)
  parser.add_argument("--out", default="training/v31/generated/v311-teacher-sample-verification.json")
  args = parser.parse_args()
  verify(args)


if __name__ == "__main__":
  main()
