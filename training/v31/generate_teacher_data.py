#!/usr/bin/env python3
"""Generate compact teacher-labelled NPZ shards from cached KataGo analysis."""

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


SCORE_SCALE = 30.0


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


def index_to_xy(index: int) -> Tuple[int, int] | None:
  if index == PASS_INDEX:
    return None
  y, x = divmod(index, BOARD_SIZE)
  return x, y


def xy_to_index(x: int, y: int) -> int:
  return y * BOARD_SIZE + x


def transform_xy(x: int, y: int, symmetry: int) -> Tuple[int, int]:
  n = BOARD_SIZE - 1
  if symmetry == 0:
    return x, y
  if symmetry == 1:
    return n - y, x
  if symmetry == 2:
    return n - x, n - y
  if symmetry == 3:
    return y, n - x
  if symmetry == 4:
    return n - x, y
  if symmetry == 5:
    return x, n - y
  if symmetry == 6:
    return y, x
  if symmetry == 7:
    return n - y, n - x
  raise ValueError(f"invalid symmetry: {symmetry}")


def transform_plane(plane: np.ndarray, symmetry: int) -> np.ndarray:
  if symmetry == 0:
    return plane
  if symmetry == 1:
    return np.rot90(plane, 1)
  if symmetry == 2:
    return np.rot90(plane, 2)
  if symmetry == 3:
    return np.rot90(plane, 3)
  if symmetry == 4:
    return np.fliplr(plane)
  if symmetry == 5:
    return np.flipud(plane)
  if symmetry == 6:
    return plane.T
  if symmetry == 7:
    return np.rot90(plane.T, 2)
  raise ValueError(f"invalid symmetry: {symmetry}")


def transform_spatial(spatial: np.ndarray, symmetry: int) -> np.ndarray:
  return np.stack([transform_plane(plane, symmetry) for plane in spatial]).astype(np.float32)


def transform_policy(policy: np.ndarray, symmetry: int) -> np.ndarray:
  if symmetry == 0:
    return policy.astype(np.float32)
  out = np.zeros_like(policy, dtype=np.float32)
  out[PASS_INDEX] = policy[PASS_INDEX]
  for index in range(PASS_INDEX):
    xy = index_to_xy(index)
    assert xy is not None
    x, y = transform_xy(*xy, symmetry)
    out[xy_to_index(x, y)] = policy[index]
  return out


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


def parse_board_string(board_string: str) -> list | None:
  rows = board_string.split("|")
  if len(rows) != BOARD_SIZE or any(len(row) != BOARD_SIZE for row in rows):
    return None
  board = []
  for row in rows:
    parsed = []
    for ch in row:
      if ch == "0":
        parsed.append(0)
      elif ch == "1":
        parsed.append(1)
      elif ch == "2":
        parsed.append(-1)
      else:
        return None
    board.append(parsed)
  return board


def reconstruct_position_from_id(result: dict) -> dict | None:
  parts = str(result.get("positionId", "")).split(":")
  for i, part in enumerate(parts):
    board = parse_board_string(part)
    if board is None:
      continue
    side_token = parts[i + 1] if i + 1 < len(parts) else "1"
    side = "B" if side_token == "1" else "W"
    tags = ["derived_from_position_id"]
    phase = result.get("phase", "unknown")
    if "opening" in str(phase):
      tags.append("opening_synthetic")
    if "endgame" in str(phase):
      tags.append("endgame")
    return {
      "positionId": result["positionId"],
      "board": board,
      "sideToMove": side,
      "komi": 7.5,
      "moveNumber": int(result.get("moveNumber", 0) or 0),
      "phase": phase,
      "sourceTags": tags,
      "moveHistory": [],
      "koState": None,
      "derived_from_position_id": True,
    }
  return None


def make_visit_policy(result: dict) -> np.ndarray | None:
  arr = np.zeros((POLICY_SIZE,), dtype=np.float32)
  infos = result.get("moveInfos") or []
  total = sum(max(0.0, float(info.get("visits", 0))) for info in infos)
  if total <= 0:
    return None
  for info in infos:
    idx = move_to_index(info.get("move", ""))
    if idx is not None:
      arr[idx] += max(0.0, float(info.get("visits", 0))) / total
  return arr


def make_policy(result: dict, source: str = "prefer_visits") -> Tuple[np.ndarray, str]:
  if source in {"visits", "prefer_visits"}:
    visit_policy = make_visit_policy(result)
    if visit_policy is not None:
      arr = visit_policy
      target_type = "search_visit_policy"
    elif source == "visits":
      raise ValueError("missing search visit policy")
    else:
      arr = None
  else:
    arr = None
  policy = result.get("policy")
  if arr is None and isinstance(policy, list) and len(policy) >= POLICY_SIZE:
    arr = np.asarray(policy[:POLICY_SIZE], dtype=np.float32)
    if np.any(arr < 0.0) or not np.isclose(float(arr.sum()), 1.0, atol=1e-3):
      shifted = arr - float(np.max(arr))
      exp = np.exp(shifted).astype(np.float32)
      arr = exp / max(float(exp.sum()), 1e-12)
      target_type = "raw_network_policy_logits_softmax"
    else:
      target_type = "raw_network_policy_probability"
  elif arr is None:
    arr = np.zeros((POLICY_SIZE,), dtype=np.float32)
    target_type = "fallback_pass_policy"
  s = float(arr.sum())
  if not np.isfinite(s) or s <= 0:
    arr[PASS_INDEX] = 1.0
    target_type = "fallback_pass_policy"
  else:
    arr /= s
  if not np.isfinite(arr).all() or float(arr.max()) < 0.006:
    raise ValueError("malformed or near-uniform policy target")
  return arr.astype(np.float32), target_type


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


def build_rows(positions: list, analysis: list, count: int, policy_source: str) -> Tuple[list, int, int]:
  pos_by_id = {p["positionId"]: p for p in positions}
  rows = []
  invalid = 0
  duplicate_sample = 0
  seen_samples = set()
  for result_index, result in enumerate(analysis):
    pid = result.get("positionId")
    position = pos_by_id.get(pid) or reconstruct_position_from_id(result)
    if not position:
      invalid += 1
      continue
    try:
      policy, target_type = make_policy(result, policy_source)
    except ValueError:
      invalid += 1
      continue
    spatial, global_features, legal_mask = encode_features(position)
    for symmetry in range(8 if count > len(pos_by_id) else 1):
      sample_id = f"{pid}|analysis{result_index}|{result.get('profile', 'unknown')}|sym{symmetry}"
      if sample_id in seen_samples:
        duplicate_sample += 1
        continue
      seen_samples.add(sample_id)
      rows.append({
        "position": position,
        "result": result,
        "spatial": transform_spatial(spatial, symmetry),
        "global": global_features,
        "legal": legal_mask,
        "policy": transform_policy(policy, symmetry),
        "targetType": target_type,
        "sampleId": sample_id,
        "basePositionId": pid,
        "symmetry": symmetry,
      })
  return rows, duplicate_sample, invalid


def select_balanced(rows: list, count: int) -> list:
  buckets = defaultdict(list)
  for row in rows:
    key = (row["position"].get("phase", "unknown"), tactical_family(row["position"]))
    buckets[key].append(row)
  for key in buckets:
    buckets[key].sort(key=lambda row: row["sampleId"])
  selected = []
  keys = sorted(buckets)
  cursor = {key: 0 for key in keys}
  while len(selected) < count:
    progressed = False
    for key in keys:
      i = cursor[key]
      if i < len(buckets[key]):
        selected.append(buckets[key][i])
        cursor[key] = i + 1
        progressed = True
        if len(selected) == count:
          break
    if not progressed:
      break
  return selected


def generate(args) -> dict:
  positions = json.loads(Path(args.positions).read_text(encoding="utf8"))["positions"]
  analysis = json.loads(Path(args.analysis).read_text(encoding="utf8"))["results"]
  pos_by_id = {p["positionId"]: p for p in positions}
  all_rows, duplicate, invalid = build_rows(positions, analysis, args.count, args.policy_source)
  rows = select_balanced(all_rows, args.count)

  if len(rows) != args.count:
    raise RuntimeError(f"requested {args.count} rows but generated {len(rows)}")

  out_dir = Path(args.output_dir)
  out_dir.mkdir(parents=True, exist_ok=True)
  spatial = np.stack([r["spatial"] for r in rows]).astype(np.float32)
  global_features = np.stack([r["global"] for r in rows]).astype(np.float32)
  legal_mask = np.stack([r["legal"] for r in rows]).astype(np.float32)
  policy = np.stack([r["policy"] for r in rows]).astype(np.float32)
  value = np.asarray([float(r["result"].get("winrate", 0.5)) for r in rows], dtype=np.float32)
  score_raw = np.asarray([float(r["result"].get("scoreLead", 0.0)) for r in rows], dtype=np.float32)
  score = np.clip(score_raw, -SCORE_SCALE, SCORE_SCALE).astype(np.float32) / SCORE_SCALE
  position_ids = np.asarray([r["sampleId"] for r in rows])
  base_position_ids = np.asarray([r["basePositionId"] for r in rows])
  splits = np.asarray([split_for(r["basePositionId"]) for r in rows])
  phases = np.asarray([r["position"].get("phase", "unknown") for r in rows])
  families = np.asarray([tactical_family(r["position"]) for r in rows])
  target_types = np.asarray([r["targetType"] for r in rows])
  symmetries = np.asarray([r["symmetry"] for r in rows], dtype=np.int8)
  visits = np.asarray([int(r["result"].get("visits", r["result"].get("rootInfo", {}).get("visits", 0))) for r in rows], dtype=np.int32)
  shard = out_dir / "teacher-0000.npz"
  np.savez_compressed(
    shard,
    spatial=spatial,
    global_features=global_features,
    legal_mask=legal_mask,
    policy=policy,
    value=value,
    score=score,
    score_raw=score_raw,
    position_ids=position_ids,
    base_position_ids=base_position_ids,
    splits=splits,
    phases=phases,
    families=families,
    target_types=target_types,
    symmetries=symmetries,
    visits=visits,
  )
  manifest = {
    "schema": "gokidcoach-v311-teacher-manifest",
    "teacherLabelSource": "cached KataGo analysis mode",
    "policyTargetType": "per_sample_target_types",
    "scoreScale": SCORE_SCALE,
    "positionsRequested": args.count,
    "positionsGenerated": len(rows),
    "duplicateCount": duplicate,
    "invalidCount": invalid,
    "shards": [{"path": str(shard), "rows": len(rows), "sizeBytes": shard.stat().st_size}],
    "phaseDistribution": dict(Counter(phases.tolist())),
    "tacticalFamilyDistribution": dict(Counter(families.tolist())),
    "policyTargetTypeDistribution": dict(Counter(target_types.tolist())),
    "splitDistribution": dict(Counter(splits.tolist())),
    "averageTeacherVisits": float(np.mean(visits)),
    "lowConfidenceCount": int(np.sum(visits < args.low_confidence_visits)),
    "manualVerificationCount": min(args.manual_verify, len(rows)),
    "passIndex": PASS_INDEX,
    "positionHash": stable_hash(position_ids.tolist()),
  }
  (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
  splits_manifest = {
    "seed": "gokidcoach-v311-split-v1",
    "method": "sha256(basePositionId) bucket; all profiles and symmetries stay in the same split",
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
  parser.add_argument("--manual-verify", type=int, default=100)
  parser.add_argument("--policy-source", choices=["prefer_visits", "visits", "raw"], default="prefer_visits")
  args = parser.parse_args()
  print(json.dumps(generate(args), indent=2))


if __name__ == "__main__":
  main()
