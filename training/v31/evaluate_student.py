#!/usr/bin/env python3
"""Evaluate V3.1 student checkpoint against teacher labels."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from model_student import build_model
from train_student import load_split


def topk_agreement(logits, target, k):
  pred = torch.topk(logits, k, dim=1).indices
  truth = torch.argmax(target, dim=1)
  return float(torch.stack([torch.isin(truth[i], pred[i]).float() for i in range(truth.shape[0])]).mean())


def metric_block(logits, policy, value_prob, value, score_pred, score_raw, legal_mask):
  masked_logits = logits.masked_fill(legal_mask <= 0, -1e9)
  probs = torch.softmax(masked_logits, dim=1)
  kl = F.kl_div(torch.log(probs + 1e-8), policy, reduction="batchmean")
  score_error = torch.abs(score_pred - score_raw)
  teacher_best = torch.argmax(policy, dim=1)
  pred_best = torch.argmax(masked_logits, dim=1)
  legal_selected = legal_mask.gather(1, pred_best[:, None]).squeeze(1) > 0
  return {
    "rows": int(logits.shape[0]),
    "policyTop1": topk_agreement(masked_logits, policy, 1),
    "policyTop3": topk_agreement(masked_logits, policy, 3),
    "policyTop5": topk_agreement(masked_logits, policy, 5),
    "policyTop10": topk_agreement(masked_logits, policy, 10),
    "policyKl": float(kl),
    "valueMae": float(torch.mean(torch.abs(value_prob - value))),
    "scoreMae": float(torch.mean(score_error)),
    "scoreP90": float(torch.quantile(score_error, 0.9)),
    "legalMoveRate": float(legal_selected.float().mean()),
    "passAccuracy": float(((pred_best == 361) == (teacher_best == 361)).float().mean()),
  }


def evaluate(args):
  device = torch.device("cpu")
  ckpt = torch.load(args.checkpoint, map_location=device)
  arch = ckpt.get("architecture", args.architecture)
  model = build_model(arch).to(device)
  model.load_state_dict(ckpt["model"])
  model.eval()
  ds, meta = load_split(args.shard, args.split, args.limit, include_meta=True)
  spatial, global_features, policy, value, score = [t.to(device) for t in ds.tensors]
  data = np.load(args.shard, allow_pickle=True)
  score_scale = float(args.score_scale)
  score_raw = torch.from_numpy(meta.get("score_raw", np.asarray(score.numpy() * score_scale))).float().to(device)
  legal_mask = torch.from_numpy(data["legal_mask"][np.nonzero(data["splits"] == args.split)[0][: spatial.shape[0]]]).float().to(device)
  with torch.no_grad():
    logits, value_logit, score_pred = model(spatial, global_features)
    score_pred_raw = score_pred * score_scale
    value_prob = torch.sigmoid(value_logit)
  metrics = {"split": args.split, **metric_block(logits, policy, value_prob, value, score_pred_raw, score_raw, legal_mask)}
  for key, values in (("phase", meta.get("phases")), ("family", meta.get("families"))):
    grouped = {}
    if values is not None:
      for value_name in sorted(set(values.tolist())):
        mask_np = values == value_name
        if int(mask_np.sum()) == 0:
          continue
        mask = torch.from_numpy(mask_np).bool()
        grouped[str(value_name)] = metric_block(
          logits[mask], policy[mask], value_prob[mask], value[mask], score_pred_raw[mask], score_raw[mask], legal_mask[mask]
        )
    metrics[f"by{key.capitalize()}"] = grouped
  Path(args.out).parent.mkdir(parents=True, exist_ok=True)
  Path(args.out).write_text(json.dumps(metrics, indent=2), encoding="utf8")
  print(json.dumps(metrics, indent=2))
  return metrics


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--shard", default="training/v31/generated/stage-a/teacher-0000.npz")
  parser.add_argument("--checkpoint", default="training/v31/checkpoints/tiny-student.pt")
  parser.add_argument("--architecture", default="res6c64")
  parser.add_argument("--split", default="validation")
  parser.add_argument("--limit", type=int, default=64)
  parser.add_argument("--score-scale", type=float, default=30.0)
  parser.add_argument("--out", default="training/v31/generated/tiny-eval-metrics.json")
  args = parser.parse_args()
  evaluate(args)


if __name__ == "__main__":
  main()
