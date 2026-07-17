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


def load_split(shard, split="train", limit=None):
  data = np.load(shard, allow_pickle=True)
  mask = data["splits"] == split
  idx = np.nonzero(mask)[0]
  if limit:
    idx = idx[:limit]
  tensors = [
    torch.from_numpy(data["spatial"][idx]).float(),
    torch.from_numpy(data["global_features"][idx]).float(),
    torch.from_numpy(data["policy"][idx]).float(),
    torch.from_numpy(data["value"][idx]).float(),
    torch.from_numpy(data["score"][idx]).float(),
  ]
  return TensorDataset(*tensors)


def compute_loss(outputs, targets, weights):
  policy_logits, value_logit, score = outputs
  policy_t, value_t, score_t = targets
  log_probs = F.log_softmax(policy_logits, dim=1)
  policy_loss = -(policy_t * log_probs).sum(dim=1).mean()
  value_loss = F.binary_cross_entropy_with_logits(value_logit, value_t)
  score_loss = F.huber_loss(score, score_t)
  total = weights["policy"] * policy_loss + weights["value"] * value_loss + weights["score"] * score_loss
  return total, {"policy": float(policy_loss.detach()), "value": float(value_loss.detach()), "score": float(score_loss.detach()), "total": float(total.detach())}


def train(args):
  torch.manual_seed(args.seed)
  device = torch.device("cuda" if args.prefer_gpu and torch.cuda.is_available() else "cpu")
  model = build_model(args.architecture).to(device)
  weights = {"policy": args.policy_weight, "value": args.value_weight, "score": args.score_weight}
  ds = load_split(args.shard, "train", args.limit)
  loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True)
  opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
  start_epoch = 0
  if args.resume and Path(args.resume).exists():
    ckpt = torch.load(args.resume, map_location=device)
    model.load_state_dict(ckpt["model"])
    opt.load_state_dict(ckpt["optimizer"])
    start_epoch = int(ckpt["epoch"]) + 1
  first = None
  last = None
  for epoch in range(start_epoch, start_epoch + args.epochs):
    for spatial, global_features, policy, value, score in loader:
      spatial = spatial.to(device)
      global_features = global_features.to(device)
      policy = policy.to(device)
      value = value.to(device)
      score = score.to(device)
      opt.zero_grad(set_to_none=True)
      loss, parts = compute_loss(model(spatial, global_features), (policy, value, score), weights)
      loss.backward()
      opt.step()
      if first is None:
        first = parts
      last = parts
  Path(args.checkpoint).parent.mkdir(parents=True, exist_ok=True)
  torch.save({"model": model.state_dict(), "optimizer": opt.state_dict(), "epoch": start_epoch + args.epochs - 1, "architecture": args.architecture}, args.checkpoint)
  metrics = {"device": str(device), "architecture": args.architecture, "firstLoss": first, "lastLoss": last, "checkpoint": args.checkpoint}
  Path(args.metrics).parent.mkdir(parents=True, exist_ok=True)
  Path(args.metrics).write_text(json.dumps(metrics, indent=2), encoding="utf8")
  print(json.dumps(metrics, indent=2))
  return metrics


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--shard", default="training/v31/generated/stage-a/stage-a-0000.npz")
  parser.add_argument("--architecture", default="res6c64")
  parser.add_argument("--checkpoint", default="training/v31/checkpoints/tiny-student.pt")
  parser.add_argument("--metrics", default="training/v31/generated/tiny-train-metrics.json")
  parser.add_argument("--resume")
  parser.add_argument("--epochs", type=int, default=1)
  parser.add_argument("--batch-size", type=int, default=16)
  parser.add_argument("--limit", type=int, default=128)
  parser.add_argument("--lr", type=float, default=1e-3)
  parser.add_argument("--seed", type=int, default=310)
  parser.add_argument("--policy-weight", type=float, default=1.0)
  parser.add_argument("--value-weight", type=float, default=0.25)
  parser.add_argument("--score-weight", type=float, default=0.05)
  parser.add_argument("--prefer-gpu", action="store_true")
  args = parser.parse_args()
  train(args)


if __name__ == "__main__":
  main()
