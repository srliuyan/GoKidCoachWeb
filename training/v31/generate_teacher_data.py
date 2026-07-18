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
PHASE_TARGETS = {
  "opening_1_20": 0.125,
  "early_middlegame_21_60": 0.30,
  "middlegame_61_120": 0.23,
  "late_middlegame_121_200": 0.22,
  "endgame_201_plus": 0.125,
}
IMPORTANT_FAMILIES = {"escape", "weak_group", "counterattack", "capture_or_atari", "connection", "cut"}


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


def index_to_move(index: int) -> dict:
  if index == PASS_INDEX:
    return {"pass": True, "index": PASS_INDEX}
  y, x = divmod(index, BOARD_SIZE)
  return {"x": x, "y": y, "index": index}


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


def board_value(value) -> int:
  if value in (1, "B", "black"):
    return 1
  if value in (-1, 2, "W", "white"):
    return -1
  return 0


def side_value(side_to_move: str) -> int:
  return -1 if side_to_move in ("W", -1, 2) else 1


def side_name(value: int) -> str:
  return "W" if value == -1 else "B"


def neighbors(x: int, y: int) -> list[tuple[int, int]]:
  out = []
  for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
    nx = x + dx
    ny = y + dy
    if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE:
      out.append((nx, ny))
  return out


def clone_board(board) -> list[list[int]]:
  return [[board_value(board[y][x]) if y < len(board) and x < len(board[y]) else 0 for x in range(BOARD_SIZE)] for y in range(BOARD_SIZE)]


def group_at(board, x: int, y: int) -> dict:
  color = board_value(board[y][x])
  if color == 0:
    return {"color": 0, "stones": [], "liberties": []}
  queue = [(x, y)]
  seen = set()
  liberties = set()
  stones = []
  while queue:
    px, py = queue.pop()
    if (px, py) in seen:
      continue
    seen.add((px, py))
    stones.append((px, py))
    for nx, ny in neighbors(px, py):
      value = board_value(board[ny][nx])
      if value == 0:
        liberties.add((nx, ny))
      elif value == color and (nx, ny) not in seen:
        queue.append((nx, ny))
  return {"color": color, "stones": stones, "liberties": list(liberties)}


def ko_matches(ko, x: int, y: int) -> bool:
  return isinstance(ko, dict) and ko.get("x") == x and ko.get("y") == y


def play_move(position: dict, move: dict) -> dict | None:
  color = side_value(position.get("sideToMove", "B"))
  next_color = -color
  board = clone_board(position.get("board", []))
  if move.get("pass"):
    return {**position, "board": board, "sideToMove": side_name(next_color)}
  x = int(move["x"])
  y = int(move["y"])
  if board[y][x] != 0 or ko_matches(position.get("koState") or position.get("ko"), x, y):
    return None
  board[y][x] = color
  captured = []
  for nx, ny in neighbors(x, y):
    if board_value(board[ny][nx]) != next_color:
      continue
    opponent = group_at(board, nx, ny)
    if len(opponent["liberties"]) == 0:
      for sx, sy in opponent["stones"]:
        board[sy][sx] = 0
        captured.append((sx, sy))
  own = group_at(board, x, y)
  if len(own["liberties"]) == 0:
    return None
  return {**position, "board": board, "sideToMove": side_name(next_color), "captures": len(captured)}


def legal_moves(position: dict) -> list[dict]:
  moves = []
  board = clone_board(position.get("board", []))
  for y in range(BOARD_SIZE):
    for x in range(BOARD_SIZE):
      if board[y][x] != 0:
        continue
      move = {"x": x, "y": y, "index": xy_to_index(x, y)}
      if play_move(position, move) is not None:
        moves.append(move)
  moves.append({"pass": True, "index": PASS_INDEX})
  return moves


def legal_policy_mask(position: dict) -> np.ndarray:
  mask = np.zeros((POLICY_SIZE,), dtype=np.float32)
  for move in legal_moves(position):
    mask[int(move["index"])] = 1.0
  return mask


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
  legal_mask = legal_policy_mask(position)
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


def normalize_policy(arr: np.ndarray) -> np.ndarray | None:
  total = float(arr.sum())
  if not np.isfinite(total) or total <= 0.0:
    return None
  out = (arr / total).astype(np.float32)
  if not np.isfinite(out).all():
    return None
  return out


def mask_policy(policy: np.ndarray, legal_mask: np.ndarray) -> np.ndarray | None:
  masked = np.asarray(policy, dtype=np.float32) * np.asarray(legal_mask, dtype=np.float32)
  return normalize_policy(masked)


def temperature_smooth(policy: np.ndarray, temperature: float) -> np.ndarray:
  if temperature <= 0:
    raise ValueError("temperature must be positive")
  if abs(temperature - 1.0) < 1e-9:
    return policy.astype(np.float32)
  powered = np.power(np.clip(policy, 0.0, 1.0), 1.0 / temperature).astype(np.float32)
  normalized = normalize_policy(powered)
  if normalized is None:
    raise ValueError("temperature produced invalid policy")
  return normalized


def make_visit_policy(result: dict, top_n: int = 0, tail_mass: float = 0.0) -> np.ndarray | None:
  arr = np.zeros((POLICY_SIZE,), dtype=np.float32)
  infos = result.get("moveInfos") or []
  sorted_infos = sorted(infos, key=lambda info: float(info.get("visits", 0)), reverse=True)
  if top_n > 0:
    sorted_infos = sorted_infos[:top_n]
  total = sum(max(0.0, float(info.get("visits", 0))) for info in sorted_infos)
  if total <= 0:
    return None
  for info in sorted_infos:
    idx = move_to_index(info.get("move", ""))
    if idx is not None:
      arr[idx] += (1.0 - tail_mass) * max(0.0, float(info.get("visits", 0))) / total
  if tail_mass > 0.0:
    legal_count = POLICY_SIZE
    arr += tail_mass / legal_count
  return normalize_policy(arr)


def make_prior_policy(result: dict) -> np.ndarray | None:
  arr = np.zeros((POLICY_SIZE,), dtype=np.float32)
  for info in result.get("moveInfos") or []:
    idx = move_to_index(info.get("move", ""))
    if idx is not None:
      arr[idx] += max(0.0, float(info.get("prior", 0)))
  return normalize_policy(arr)


def make_policy(result: dict, source: str = "prefer_visits", temperature: float = 1.0, top_n: int = 0, tail_mass: float = 0.0, blend_raw: float = 0.0) -> Tuple[np.ndarray, str]:
  if source in {"visits", "prefer_visits"}:
    visit_policy = make_visit_policy(result, top_n=top_n, tail_mass=tail_mass)
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
  if blend_raw > 0.0 and target_type == "search_visit_policy":
    prior = make_prior_policy(result)
    if prior is not None:
      arr = normalize_policy((1.0 - blend_raw) * arr + blend_raw * prior)
      target_type = "visit_prior_blend_policy"
  arr = temperature_smooth(arr, temperature)
  if not np.isfinite(arr).all() or float(arr.max()) < 0.006:
    raise ValueError("malformed or near-uniform policy target")
  return arr.astype(np.float32), target_type


def policy_quality(result: dict, policy: np.ndarray, target_type: str) -> dict:
  infos = result.get("moveInfos") or []
  visit_values = np.asarray([max(0.0, float(info.get("visits", 0))) for info in infos], dtype=np.float32)
  total_visits = float(visit_values.sum())
  sorted_visits = np.sort(visit_values)[::-1]
  entropy = float(-(policy * np.log(np.clip(policy, 1e-12, 1.0))).sum())
  max_entropy = float(np.log(POLICY_SIZE))
  score_stdevs = [float(info.get("scoreStdev", 0.0)) for info in infos if info.get("scoreStdev") is not None]
  winrates = [float(info.get("winrate", result.get("winrate", 0.5))) for info in infos if info.get("winrate") is not None]
  top1 = float(sorted_visits[0] / total_visits) if total_visits > 0 and len(sorted_visits) else 0.0
  top3 = float(sorted_visits[:3].sum() / total_visits) if total_visits > 0 and len(sorted_visits) else 0.0
  top10 = float(sorted_visits[:10].sum() / total_visits) if total_visits > 0 and len(sorted_visits) else 0.0
  pass_prob = float(policy[PASS_INDEX])
  low_visit = total_visits < 32
  flat = entropy / max_entropy > 0.72
  sharp = top1 > 0.92
  few_moves = len([v for v in visit_values if v > 0]) < 3
  excessive_pass = pass_prob > 0.35
  score_uncertainty = float(np.mean(score_stdevs)) if score_stdevs else 0.0
  winrate_uncertainty = float(np.std(winrates)) if winrates else 0.0
  confidence = 1.0
  if low_visit:
    confidence *= 0.70
  if flat:
    confidence *= 0.80
  if sharp:
    confidence *= 0.90
  if few_moves:
    confidence *= 0.75
  if score_uncertainty > 25:
    confidence *= 0.85
  if excessive_pass:
    confidence *= 0.75
  return {
    "teacherVisits": int(result.get("visits", result.get("rootInfo", {}).get("visits", total_visits))),
    "rootMoveCount": int(len(infos)),
    "top1VisitShare": top1,
    "top3VisitShare": top3,
    "top10VisitShare": top10,
    "policyEntropy": entropy,
    "nonzeroMoves": int(np.sum(policy > 0)),
    "scoreUncertainty": score_uncertainty,
    "winrateUncertainty": winrate_uncertainty,
    "targetType": target_type,
    "lowVisit": low_visit,
    "flatTarget": flat,
    "sharpTarget": sharp,
    "fewExploredMoves": few_moves,
    "excessivePass": excessive_pass,
    "confidenceWeight": float(max(0.15, min(1.0, confidence))),
  }


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


def is_low_information(quality: dict, args) -> bool:
  if not args.drop_low_information:
    return False
  if quality["flatTarget"] or quality["excessivePass"]:
    return True
  if quality["rootMoveCount"] < args.min_root_moves:
    return True
  if quality["teacherVisits"] < args.min_teacher_visits:
    return True
  return False


def build_rows(positions: list, analysis: list, count: int, policy_source: str, temperature: float, top_n: int, tail_mass: float, blend_raw: float, args) -> Tuple[list, int, int, int]:
  pos_by_id = {p["positionId"]: p for p in positions}
  rows = []
  invalid = 0
  low_information = 0
  duplicate_sample = 0
  seen_samples = set()
  for result_index, result in enumerate(analysis):
    pid = result.get("positionId")
    position = pos_by_id.get(pid) or reconstruct_position_from_id(result)
    if not position:
      invalid += 1
      continue
    try:
      policy, target_type = make_policy(result, policy_source, temperature=temperature, top_n=top_n, tail_mass=tail_mass, blend_raw=blend_raw)
    except ValueError:
      invalid += 1
      continue
    spatial, global_features, legal_mask = encode_features(position)
    legal_policy = mask_policy(policy, legal_mask)
    if legal_policy is None:
      invalid += 1
      continue
    quality = policy_quality(result, legal_policy, target_type)
    if is_low_information(quality, args):
      low_information += 1
      continue
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
        "legal": transform_policy(legal_mask, symmetry),
        "policy": transform_policy(legal_policy, symmetry),
        "targetType": target_type,
        "quality": quality,
        "sampleId": sample_id,
        "basePositionId": pid,
        "symmetry": symmetry,
      })
  return rows, duplicate_sample, invalid, low_information


def quota_counts(total: int, proportions: dict) -> dict:
  quotas = {key: int(total * value) for key, value in proportions.items()}
  remainder = total - sum(quotas.values())
  for key in sorted(proportions, key=lambda k: proportions[k], reverse=True)[:remainder]:
    quotas[key] += 1
  return quotas


def select_balanced(rows: list, count: int, mode: str = "round_robin") -> list:
  if mode == "phase_targets":
    return select_phase_targeted(rows, count)
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


def select_phase_targeted(rows: list, count: int) -> list:
  phase_buckets = defaultdict(list)
  for row in rows:
    phase_buckets[row["position"].get("phase", "unknown")].append(row)
  for phase in phase_buckets:
    phase_buckets[phase].sort(key=lambda row: (-row["quality"]["confidenceWeight"], row["sampleId"]))
  selected = []
  seen = set()
  for phase, quota in quota_counts(count, PHASE_TARGETS).items():
    for row in phase_buckets.get(phase, [])[:quota]:
      selected.append(row)
      seen.add(row["sampleId"])
  remaining = [row for row in rows if row["sampleId"] not in seen]
  family_counts = Counter(tactical_family(row["position"]) for row in selected)
  family_min = int(count * 0.08)
  for family in sorted(IMPORTANT_FAMILIES):
    need = max(0, family_min - family_counts[family])
    if need == 0:
      continue
    additions = [row for row in remaining if tactical_family(row["position"]) == family]
    additions.sort(key=lambda row: (-row["quality"]["confidenceWeight"], row["sampleId"]))
    for row in additions[:need]:
      selected.append(row)
      seen.add(row["sampleId"])
      family_counts[family] += 1
    remaining = [row for row in remaining if row["sampleId"] not in seen]
  if len(selected) > count:
    selected.sort(key=lambda row: (-row["quality"]["confidenceWeight"], row["sampleId"]))
    selected = selected[:count]
  elif len(selected) < count:
    remaining.sort(key=lambda row: (-row["quality"]["confidenceWeight"], row["sampleId"]))
    selected.extend(remaining[:count - len(selected)])
  selected.sort(key=lambda row: row["sampleId"])
  return selected[:count]


def sample_weight_for(row: dict, args) -> float:
  weight = row["quality"]["confidenceWeight"] if args.confidence_weights else 1.0
  phase = row["position"].get("phase", "unknown")
  move_number = int(row["position"].get("moveNumber", 0) or 0)
  family = tactical_family(row["position"])
  if phase == "middlegame_61_120" or 61 <= move_number <= 120:
    weight *= args.middlegame_weight
  if phase == "early_middlegame_21_60" or 21 <= move_number <= 60:
    weight *= args.early_middlegame_weight
    if row["quality"]["top1VisitShare"] >= args.early_sharp_top1_threshold:
      weight *= args.early_sharp_teacher_weight
  if family in IMPORTANT_FAMILIES:
    weight *= args.important_family_weight
  return float(max(args.min_sample_weight, min(args.max_sample_weight, weight)))


def generate(args) -> dict:
  positions = json.loads(Path(args.positions).read_text(encoding="utf8"))["positions"]
  analysis = json.loads(Path(args.analysis).read_text(encoding="utf8"))["results"]
  pos_by_id = {p["positionId"]: p for p in positions}
  all_rows, duplicate, invalid, low_information = build_rows(positions, analysis, args.count, args.policy_source, args.temperature, args.top_n, args.tail_mass, args.blend_raw, args)
  rows = select_balanced(all_rows, args.count, args.balance_mode)

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
  score = np.clip(score_raw, -args.score_scale, args.score_scale).astype(np.float32) / args.score_scale
  position_ids = np.asarray([r["sampleId"] for r in rows])
  base_position_ids = np.asarray([r["basePositionId"] for r in rows])
  splits = np.asarray([split_for(r["basePositionId"]) for r in rows])
  phases = np.asarray([r["position"].get("phase", "unknown") for r in rows])
  families = np.asarray([tactical_family(r["position"]) for r in rows])
  target_types = np.asarray([r["targetType"] for r in rows])
  symmetries = np.asarray([r["symmetry"] for r in rows], dtype=np.int8)
  visits = np.asarray([int(r["result"].get("visits", r["result"].get("rootInfo", {}).get("visits", 0))) for r in rows], dtype=np.int32)
  sample_weights = np.asarray([sample_weight_for(r, args) for r in rows], dtype=np.float32)
  teacher_top = np.asarray([int(np.argmax(r["policy"])) for r in rows], dtype=np.int16)
  entropy = np.asarray([r["quality"]["policyEntropy"] for r in rows], dtype=np.float32)
  root_move_counts = np.asarray([r["quality"]["rootMoveCount"] for r in rows], dtype=np.int16)
  top1_visit_share = np.asarray([r["quality"]["top1VisitShare"] for r in rows], dtype=np.float32)
  top3_visit_share = np.asarray([r["quality"]["top3VisitShare"] for r in rows], dtype=np.float32)
  top10_visit_share = np.asarray([r["quality"]["top10VisitShare"] for r in rows], dtype=np.float32)
  score_uncertainty = np.asarray([r["quality"]["scoreUncertainty"] for r in rows], dtype=np.float32)
  winrate_uncertainty = np.asarray([r["quality"]["winrateUncertainty"] for r in rows], dtype=np.float32)
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
    sample_weights=sample_weights,
    teacher_top=teacher_top,
    policy_entropy=entropy,
    root_move_counts=root_move_counts,
    top1_visit_share=top1_visit_share,
    top3_visit_share=top3_visit_share,
    top10_visit_share=top10_visit_share,
    score_uncertainty=score_uncertainty,
    winrate_uncertainty=winrate_uncertainty,
  )
  quality_flags = Counter()
  for row in rows:
    for key in ("lowVisit", "flatTarget", "sharpTarget", "fewExploredMoves", "excessivePass"):
      if row["quality"][key]:
        quality_flags[key] += 1
  manifest = {
    "schema": "gokidcoach-v312-teacher-manifest",
    "teacherLabelSource": "cached KataGo analysis mode",
    "policyTargetType": "per_sample_target_types",
    "policyTemperature": args.temperature,
    "policyTopN": args.top_n,
    "tailMass": args.tail_mass,
    "blendRaw": args.blend_raw,
    "balanceMode": args.balance_mode,
    "confidenceWeightsEnabled": bool(args.confidence_weights),
    "middlegameWeight": args.middlegame_weight,
    "importantFamilyWeight": args.important_family_weight,
    "earlyMiddlegameWeight": args.early_middlegame_weight,
    "earlySharpTeacherWeight": args.early_sharp_teacher_weight,
    "earlySharpTop1Threshold": args.early_sharp_top1_threshold,
    "minSampleWeight": args.min_sample_weight,
    "maxSampleWeight": args.max_sample_weight,
    "scoreScale": args.score_scale,
    "scoreNormalization": f"clip_scoreLead_to_[-{args.score_scale},{args.score_scale}]_divide_by_{args.score_scale}",
    "valuePerspective": "current-player perspective from KataGo side-to-move analysis",
    "positionsRequested": args.count,
    "positionsGenerated": len(rows),
    "duplicateCount": duplicate,
    "invalidCount": invalid,
    "lowInformationDropped": low_information,
    "dropLowInformation": bool(args.drop_low_information),
    "minRootMoves": args.min_root_moves,
    "minTeacherVisits": args.min_teacher_visits,
    "shards": [{"path": str(shard), "rows": len(rows), "sizeBytes": shard.stat().st_size}],
    "phaseDistribution": dict(Counter(phases.tolist())),
    "tacticalFamilyDistribution": dict(Counter(families.tolist())),
    "policyTargetTypeDistribution": dict(Counter(target_types.tolist())),
    "splitDistribution": dict(Counter(splits.tolist())),
    "averageTeacherVisits": float(np.mean(visits)),
    "averageRootMoveCount": float(np.mean(root_move_counts)),
    "averagePolicyEntropy": float(np.mean(entropy)),
    "averageConfidenceWeight": float(np.mean(sample_weights)),
    "qualityFlags": dict(quality_flags),
    "flatTargetCount": int(quality_flags["flatTarget"]),
    "sharpTargetCount": int(quality_flags["sharpTarget"]),
    "fewExploredMoveCount": int(quality_flags["fewExploredMoves"]),
    "lowConfidenceCount": int(np.sum(visits < args.low_confidence_visits)),
    "manualVerificationCount": min(args.manual_verify, len(rows)),
    "passIndex": PASS_INDEX,
    "positionHash": stable_hash(position_ids.tolist()),
  }
  (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
  splits_manifest = {
    "seed": "gokidcoach-v312-split-v1",
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
  parser.add_argument("--temperature", type=float, default=1.0)
  parser.add_argument("--top-n", type=int, default=0)
  parser.add_argument("--tail-mass", type=float, default=0.0)
  parser.add_argument("--blend-raw", type=float, default=0.0)
  parser.add_argument("--balance-mode", choices=["round_robin", "phase_targets"], default="round_robin")
  parser.add_argument("--score-scale", type=float, default=SCORE_SCALE)
  parser.add_argument("--confidence-weights", action="store_true")
  parser.add_argument("--middlegame-weight", type=float, default=1.0)
  parser.add_argument("--important-family-weight", type=float, default=1.0)
  parser.add_argument("--early-middlegame-weight", type=float, default=1.35)
  parser.add_argument("--early-sharp-teacher-weight", type=float, default=1.20)
  parser.add_argument("--early-sharp-top1-threshold", type=float, default=0.35)
  parser.add_argument("--min-sample-weight", type=float, default=0.15)
  parser.add_argument("--max-sample-weight", type=float, default=2.25)
  parser.add_argument("--drop-low-information", action="store_true")
  parser.add_argument("--min-root-moves", type=int, default=3)
  parser.add_argument("--min-teacher-visits", type=int, default=0)
  args = parser.parse_args()
  print(json.dumps(generate(args), indent=2))


if __name__ == "__main__":
  main()
