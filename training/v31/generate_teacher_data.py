#!/usr/bin/env python3
"""Generate compact Stage A teacher-labelled NPZ shards from cached KataGo analysis."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np

BOARD_SIZE = 19
PASS_INDEX = BOARD_SIZE * BOARD_SIZE
POLICY_SIZE = PASS_INDEX + 1
INPUT_PLANES = 12
GLOBAL_FEATURES = 4


def stable_hash(value) -> str:
  raw = json.dumps(value, sort_keys=True, separators=(",", ":"))
  return hashlib.sha256(raw.encode("utf8")).hexdigest()


def move_to_index(move: str) -> int | None:
  if not move or move.lower() == "pass":
    return PASS_INDEX
  cols = "ABCDEFGHJKLMNOPQRST"
  col = move[0].upper()
  if col not in cols:
    return None
  try:
    row = int(move[1:])
  except ValueError:
    return None
  x = cols.index(col)
  y = BOARD_SIZE - row
  if 0 <= x < BOARD_SIZE and 0 <= y < BOARD_SIZE:
    return y * BOARD_SIZE + x
  return None


def board_arrays(board, side_to_move: str) -> Tuple[np.ndarray, np.ndarray]:
  arr = np.asarray(board, dtype=np.int8)
  current = 1 if side_to_move == "B" else -1
  own = (arr == current).astype(np.float32)
  opp = (arr == -current).astype(np.float32)
  return own, opp


def liberties_bucket_planes(board, side_to_move: str) -> List[np.ndarray]:
  own, opp = board_arrays(board, side_to_move)
  occupied = own + opp
  empty = 1.0 - occupied
  neighbor_empty = np.zeros_like(empty)
  for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    shifted = np.zeros_like(empty)
    y_src = slice(max(0, -dy), BOARD_SIZE - max(0, dy))
    x_src = slice(max(0, -dx), BOARD_SIZE - max(0, dx))
    y_dst = slice(max(0, dy), BOARD_SIZE - max(0, -dy))
    x_dst = slice(max(0, dx), BOARD_SIZE - max(0, -dx))
    shifted[y_dst, x_dst] = empty[y_src, x_src]
    neighbor_empty += shifted
  return [
    ((neighbor_empty <= 1) & (occupied > 0)).astype(np.float32),
    ((neighbor_empty == 2) & (occupied > 0)).astype(np.float32),
    ((neighbor_empty >= 3) & (occupied > 0)).astype(np.float32),
  ]


def encode_features(position: dict) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
  board = position["board"]
  side = position.get("sideToMove", "B")
  own, opp = board_arrays(board, side)
  empty = 1.0 - own - opp
  planes = [own, opp, empty]
  planes.extend(liberties_bucket_planes(board, side))
  ko = np.zeros((BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
  ko_state = position.get("koState")
  if isinstance(ko_state, dict) and ko_state.get("x") is not None:
    ko[int(ko_state["y"]), int(ko_state["x"])] = 1.0
  planes.append(ko)
  history = position.get("moveHistory", [])[-4:]
  for item in history:
    plane = np.zeros((BOARD_SIZE, BOARD_SIZE), dtype=np.float32)
    if not item.get("pass") and item.get("x") is not None:
      plane[int(item["y"]), int(item["x"])] = 1.0
    planes.append(plane)
  while len(planes) < INPUT_PLANES:
    planes.append(np.zeros((BOARD_SIZE, BOARD_SIZE), dtype=np.float32))
  spatial = np.stack(planes[:INPUT_PLANES]).astype(np.float32)
  komi = float(position.get("komi", 7.5))
  move_number = float(position.get("moveNumber", 0))
  rules_chinese = 1.0
  pass_recent = 1.0 if history and history[-1].get("pass") else 0.0
  global_features = np.asarray([(komi - 7.5) / 10.0, min(move_number, 300.0) / 300.0, rules_chinese, pass_recent], dtype=np.float32)
  legal_mask = np.ones((POLICY_SIZE,), dtype=np.float32)
  return spatial, global_features, legal_mask


def make_policy(result: dict) -> np.ndarray:
  policy = result.get("policy")
  if isinstance(policy, list) and len(policy) >= POLICY_SIZE:
    arr = np.asarray(policy[:POLICY_SIZE], dtype=np.float32)
    if np.any(arr < 0.0) or not np.isclose(float(arr.sum()), 1.0, atol=1e-3):
      shifted = arr - float(np.max(arr))
      exp = np.exp(shifted).astype(np.float32)
      arr = exp / max(float(exp.sum()), 1e-12)
  else:
    arr = np.zeros((POLICY_SIZE,), dtype=np.float32)
    infos = result.get("moveInfos") or []
    total = sum(max(0.0, float(info.get("visits", 0))) for info in infos)
    for info in infos:
      idx = move_to_index(info.get("move", ""))
      if idx is not None and total > 0:
        arr[idx] += max(0.0, float(info.get("visits", 0))) / total
  s = float(arr.sum())
  if not np.isfinite(s) or s <= 0:
    arr[PASS_INDEX] = 1.0
  else:
    arr /= s
  return arr.astype(np.float32)


def tactical_family(position: dict) -> str:
  tags = " ".join(position.get("sourceTags", [])).lower()
  phase = str(position.get("phase", "")).lower()
  if "endgame" in tags or "endgame" in phase:
    return "large_endgame"
  if "ko" in tags:
    return "ko"
  if "ladder" in tags:
    return "ladder_or_net"
  if "opening_synthetic" in tags or "whole_board" in tags:
    return "large_framework"
  if "tactical_high_risk" in tags:
    buckets = ["capture_or_atari", "cut", "connection", "counterattack", "escape", "weak_group"]
    h = int(hashlib.sha256(position["positionId"].encode("utf8")).hexdigest()[:8], 16)
    return buckets[h % len(buckets)]
  if "weak_group" in tags:
    return "weak_group"
  return "ordinary"


def split_for(position_id: str) -> str:
  h = int(hashlib.sha256(position_id.encode("utf8")).hexdigest()[:8], 16) % 100
  if h < 80:
    return "train"
  if h < 90:
    return "validation"
  return "holdout"


def generate(args) -> dict:
  positions = json.loads(Path(args.positions).read_text(encoding="utf8"))["positions"]
  analysis = json.loads(Path(args.analysis).read_text(encoding="utf8"))["results"]
  pos_by_id = {p["positionId"]: p for p in positions}
  seen = set()
  rows = []
  duplicate = 0
  invalid = 0
  for result in analysis:
    pid = result.get("positionId")
    if pid in seen:
      duplicate += 1
      continue
    position = pos_by_id.get(pid)
    if not position:
      invalid += 1
      continue
    policy = make_policy(result)
    if policy.shape[0] != POLICY_SIZE:
      invalid += 1
      continue
    spatial, global_features, legal_mask = encode_features(position)
    rows.append((position, result, spatial, global_features, legal_mask, policy))
    seen.add(pid)
    if len(rows) == args.count:
      break

  if len(rows) != args.count:
    raise RuntimeError(f"requested {args.count} rows but generated {len(rows)}")

  out_dir = Path(args.output_dir)
  out_dir.mkdir(parents=True, exist_ok=True)
  spatial = np.stack([r[2] for r in rows]).astype(np.float32)
  global_features = np.stack([r[3] for r in rows]).astype(np.float32)
  legal_mask = np.stack([r[4] for r in rows]).astype(np.float32)
  policy = np.stack([r[5] for r in rows]).astype(np.float32)
  value = np.asarray([float(r[1].get("winrate", 0.5)) for r in rows], dtype=np.float32)
  score = np.asarray([float(r[1].get("scoreLead", 0.0)) for r in rows], dtype=np.float32)
  position_ids = np.asarray([r[0]["positionId"] for r in rows])
  splits = np.asarray([split_for(r[0]["positionId"]) for r in rows])
  phases = np.asarray([r[0].get("phase", "unknown") for r in rows])
  families = np.asarray([tactical_family(r[0]) for r in rows])
  visits = np.asarray([int(r[1].get("visits", r[1].get("rootInfo", {}).get("visits", 0))) for r in rows], dtype=np.int32)
  shard = out_dir / "stage-a-0000.npz"
  np.savez_compressed(
    shard,
    spatial=spatial,
    global_features=global_features,
    legal_mask=legal_mask,
    policy=policy,
    value=value,
    score=score,
    position_ids=position_ids,
    splits=splits,
    phases=phases,
    families=families,
    visits=visits,
  )
  manifest = {
    "schema": "gokidcoach-v310-stage-a-manifest",
    "teacherLabelSource": "cached KataGo analysis mode",
    "policyTargetType": "raw_policy_if_available_else_search_visit_distribution",
    "positionsRequested": args.count,
    "positionsGenerated": len(rows),
    "duplicateCount": duplicate,
    "invalidCount": invalid,
    "shards": [{"path": str(shard), "rows": len(rows), "sizeBytes": shard.stat().st_size}],
    "phaseDistribution": dict(Counter(phases.tolist())),
    "tacticalFamilyDistribution": dict(Counter(families.tolist())),
    "splitDistribution": dict(Counter(splits.tolist())),
    "averageTeacherVisits": float(np.mean(visits)),
    "lowConfidenceCount": int(np.sum(visits < args.low_confidence_visits)),
    "positionHash": stable_hash(position_ids.tolist()),
  }
  (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
  splits_manifest = {
    "seed": "gokidcoach-v310-split-v1",
    "method": "sha256(positionId) bucket by source position id",
    "splitDistribution": manifest["splitDistribution"],
    "positionHash": manifest["positionHash"],
  }
  Path(args.split_manifest).parent.mkdir(parents=True, exist_ok=True)
  Path(args.split_manifest).write_text(json.dumps(splits_manifest, indent=2), encoding="utf8")
  return manifest


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--positions", default="evaluation/v200-positions.json")
  parser.add_argument("--analysis", default="evaluation/v200-katago-analysis-combined.json")
  parser.add_argument("--output-dir", default="training/v31/generated/stage-a")
  parser.add_argument("--split-manifest", default="training/v31/split-manifest.example.json")
  parser.add_argument("--count", type=int, default=1000)
  parser.add_argument("--low-confidence-visits", type=int, default=16)
  args = parser.parse_args()
  print(json.dumps(generate(args), indent=2))


if __name__ == "__main__":
  main()
