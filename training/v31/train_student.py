#!/usr/bin/env python3
"""Tiny supervised training scaffold for the V3.1 browser student."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

from model_student import build_model


def load_split(shard, split="train", limit=None, include_meta=False):
  data = np.load(shard, allow_pickle=True)
  mask = data["splits"] == split
  idx = np.nonzero(mask)[0]
  if limit:
    idx = idx[:limit]
  sample_weights = data["sample_weights"][idx] if "sample_weights" in data.files else np.ones((len(idx),), dtype=np.float32)
  tensors = [
    torch.from_numpy(data["spatial"][idx]).float(),
    torch.from_numpy(data["global_features"][idx]).float(),
    torch.from_numpy(data["policy"][idx]).float(),
    torch.from_numpy(data["value"][idx]).float(),
    torch.from_numpy(data["score"][idx]).float(),
    torch.from_numpy(data["legal_mask"][idx]).float(),
    torch.from_numpy(sample_weights).float(),
  ]
  ds = TensorDataset(*tensors)
  if include_meta:
    return ds, {key: data[key][idx] for key in data.files if key not in {"spatial", "global_features", "legal_mask", "policy", "value", "score"}}
  return ds


def weighted_mean(values, sample_weights):
  normalized = sample_weights / torch.clamp(sample_weights.mean(), min=1e-6)
  return (values * normalized).mean()


def compute_loss(outputs, targets, weights, sample_weights=None):
  policy_logits, value_logit, score = outputs
  policy_t, value_t, score_t, legal_mask = targets
  if sample_weights is None:
    sample_weights = torch.ones_like(value_t)
  mask_floor = -1e4 if policy_logits.dtype in (torch.float16, torch.bfloat16) else -1e9
  masked_logits = policy_logits.masked_fill(legal_mask <= 0, mask_floor)
  log_probs = F.log_softmax(masked_logits, dim=1)
  policy_loss = weighted_mean(-(policy_t * log_probs).sum(dim=1), sample_weights)
  value_loss = weighted_mean(F.binary_cross_entropy_with_logits(value_logit, value_t, reduction="none"), sample_weights)
  score_loss = weighted_mean(F.huber_loss(score, score_t, reduction="none"), sample_weights)
  total = weights["policy"] * policy_loss + weights["value"] * value_loss + weights["score"] * score_loss
  return total, {"policy": float(policy_loss.detach()), "value": float(value_loss.detach()), "score": float(score_loss.detach()), "total": float(total.detach())}


def evaluate_loss(model, dataset, weights, device, batch_size):
  loader = DataLoader(dataset, batch_size=batch_size, shuffle=False)
  totals = []
  parts_sum = {"policy": 0.0, "value": 0.0, "score": 0.0, "total": 0.0}
  count = 0
  model.eval()
  with torch.no_grad():
    for spatial, global_features, policy, value, score, legal_mask, sample_weights in loader:
      spatial = spatial.to(device)
      global_features = global_features.to(device)
      policy = policy.to(device)
      value = value.to(device)
      score = score.to(device)
      legal_mask = legal_mask.to(device)
      sample_weights = sample_weights.to(device)
      _, parts = compute_loss(model(spatial, global_features), (policy, value, score, legal_mask), weights, sample_weights)
      n = spatial.shape[0]
      for key in parts_sum:
        parts_sum[key] += parts[key] * n
      count += n
  model.train()
  return {key: parts_sum[key] / max(1, count) for key in parts_sum}


def train(args):
  torch.manual_seed(args.seed)
  np.random.seed(args.seed)
  device = torch.device("cuda" if args.prefer_gpu and torch.cuda.is_available() else "cpu")
  model = build_model(args.architecture).to(device)
  weights = {"policy": args.policy_weight, "value": args.value_weight, "score": args.score_weight}
  ds = load_split(args.shard, "train", args.limit)
  val_ds = load_split(args.shard, "validation", args.validation_limit)
  generator = torch.Generator().manual_seed(args.seed)
  loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True, generator=generator)
  opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
  scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs), eta_min=args.min_lr)
  scaler = torch.amp.GradScaler("cuda", enabled=args.mixed_precision and device.type == "cuda")
  start_epoch = 0
  best_validation = None
  best_epoch = None
  best_metric = None
  initialized_from = None
  if args.init_from and Path(args.init_from).exists() and not args.resume:
    init_ckpt = torch.load(args.init_from, map_location=device)
    model.load_state_dict(init_ckpt["model"])
    initialized_from = args.init_from
  if args.resume and Path(args.resume).exists():
    ckpt = torch.load(args.resume, map_location=device)
    model.load_state_dict(ckpt["model"])
    opt.load_state_dict(ckpt["optimizer"])
    start_epoch = int(ckpt["epoch"]) + 1
    best_validation = ckpt.get("bestValidation")
    best_epoch = ckpt.get("bestEpoch")
    best_metric = ckpt.get("bestMetric", best_validation)
  first = None
  last = None
  history = []
  for epoch in range(start_epoch, start_epoch + args.epochs):
    for spatial, global_features, policy, value, score, legal_mask, sample_weights in loader:
      spatial = spatial.to(device)
      global_features = global_features.to(device)
      policy = policy.to(device)
      value = value.to(device)
      score = score.to(device)
      legal_mask = legal_mask.to(device)
      sample_weights = sample_weights.to(device)
      opt.zero_grad(set_to_none=True)
      with torch.amp.autocast("cuda", enabled=args.mixed_precision and device.type == "cuda"):
        loss, parts = compute_loss(model(spatial, global_features), (policy, value, score, legal_mask), weights, sample_weights)
      scaler.scale(loss).backward()
      if args.grad_clip > 0:
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), args.grad_clip)
      scaler.step(opt)
      scaler.update()
      if first is None:
        first = parts
      last = parts
    validation = evaluate_loss(model, val_ds, weights, device, args.batch_size)
    metric = validation[args.selection_metric]
    history.append({"epoch": epoch, "trainLast": last, "validation": validation, "selectionMetric": args.selection_metric, "selectionValue": metric, "lr": opt.param_groups[0]["lr"]})
    if best_metric is None or metric < best_metric:
      best_metric = metric
      best_validation = validation["total"]
      best_epoch = epoch
      Path(args.checkpoint).parent.mkdir(parents=True, exist_ok=True)
      torch.save({
        "model": model.state_dict(),
        "optimizer": opt.state_dict(),
        "epoch": epoch,
        "architecture": args.architecture,
        "bestValidation": best_validation,
        "bestMetric": best_metric,
        "selectionMetric": args.selection_metric,
        "bestEpoch": best_epoch,
      }, args.checkpoint)
    scheduler.step()
    epochs_completed = epoch - start_epoch + 1
    if args.early_stopping_patience and epochs_completed >= args.min_epochs_before_stopping and best_epoch is not None and epoch - best_epoch >= args.early_stopping_patience:
      break
  if not Path(args.checkpoint).exists():
    Path(args.checkpoint).parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "optimizer": opt.state_dict(), "epoch": start_epoch + args.epochs - 1, "architecture": args.architecture}, args.checkpoint)
  metrics = {
    "device": str(device),
    "architecture": args.architecture,
    "firstLoss": first,
    "lastLoss": last,
    "bestValidation": best_validation,
    "bestMetric": best_metric,
    "selectionMetric": args.selection_metric,
    "bestEpoch": best_epoch,
    "initializedFrom": initialized_from,
    "history": history,
    "checkpoint": args.checkpoint,
  }
  Path(args.metrics).parent.mkdir(parents=True, exist_ok=True)
  Path(args.metrics).write_text(json.dumps(metrics, indent=2), encoding="utf8")
  print(json.dumps(metrics, indent=2))
  return metrics


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--shard", default="training/v31/generated/stage-a/teacher-0000.npz")
  parser.add_argument("--architecture", default="res6c64")
  parser.add_argument("--checkpoint", default="training/v31/checkpoints/tiny-student.pt")
  parser.add_argument("--metrics", default="training/v31/generated/tiny-train-metrics.json")
  parser.add_argument("--resume")
  parser.add_argument("--init-from")
  parser.add_argument("--epochs", type=int, default=1)
  parser.add_argument("--batch-size", type=int, default=16)
  parser.add_argument("--limit", type=int, default=128)
  parser.add_argument("--validation-limit", type=int)
  parser.add_argument("--lr", type=float, default=1e-3)
  parser.add_argument("--min-lr", type=float, default=1e-5)
  parser.add_argument("--seed", type=int, default=310)
  parser.add_argument("--policy-weight", type=float, default=1.0)
  parser.add_argument("--value-weight", type=float, default=0.25)
  parser.add_argument("--score-weight", type=float, default=0.10)
  parser.add_argument("--grad-clip", type=float, default=1.0)
  parser.add_argument("--early-stopping-patience", type=int, default=0)
  parser.add_argument("--min-epochs-before-stopping", type=int, default=0)
  parser.add_argument("--selection-metric", choices=["policy", "value", "score", "total"], default="total")
  parser.add_argument("--mixed-precision", action="store_true")
  parser.add_argument("--prefer-gpu", action="store_true")
  args = parser.parse_args()
  train(args)


if __name__ == "__main__":
  main()
