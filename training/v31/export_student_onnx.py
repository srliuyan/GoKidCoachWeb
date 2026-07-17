#!/usr/bin/env python3
"""Export V3.1 student checkpoint to ONNX and verify CPU equivalence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from model_student import build_model


def export(args):
  ckpt = torch.load(args.checkpoint, map_location="cpu")
  arch = ckpt.get("architecture", args.architecture)
  model = build_model(arch)
  model.load_state_dict(ckpt["model"])
  model.eval()
  spatial = torch.randn(1, 12, 19, 19, dtype=torch.float32)
  global_features = torch.randn(1, 4, dtype=torch.float32)
  Path(args.output).parent.mkdir(parents=True, exist_ok=True)
  with torch.no_grad():
    torch_outputs = model(spatial, global_features)
  torch.onnx.export(
    model,
    (spatial, global_features),
    args.output,
    input_names=["spatial", "global_features"],
    output_names=["policy_logits", "value_logit", "score"],
    opset_version=args.opset,
    do_constant_folding=True,
  )
  onnx_model = onnx.load(args.output)
  onnx.checker.check_model(onnx_model)
  inferred = onnx.shape_inference.infer_shapes(onnx_model)
  onnx.save(inferred, args.output)
  session = ort.InferenceSession(args.output, providers=["CPUExecutionProvider"])
  ort_outputs = session.run(None, {"spatial": spatial.numpy(), "global_features": global_features.numpy()})
  diffs = []
  top1 = True
  top3 = True
  for t, o in zip(torch_outputs, ort_outputs):
    tn = t.detach().numpy()
    diffs.append({"maxAbs": float(np.max(np.abs(tn - o))), "meanAbs": float(np.mean(np.abs(tn - o)))})
  top1 = int(np.argmax(torch_outputs[0].detach().numpy(), axis=1)[0]) == int(np.argmax(ort_outputs[0], axis=1)[0])
  top3 = set(np.argsort(torch_outputs[0].detach().numpy()[0])[-3:]) == set(np.argsort(ort_outputs[0][0])[-3:])
  ops = sorted({node.op_type for node in inferred.graph.node})
  report = {
    "output": args.output,
    "architecture": arch,
    "opset": args.opset,
    "sizeBytes": Path(args.output).stat().st_size,
    "checker": "passed",
    "onnxRuntimeCpu": "passed",
    "operators": ops,
    "top1Agreement": bool(top1),
    "top3Agreement": bool(top3),
    "differences": diffs,
  }
  Path(args.report).parent.mkdir(parents=True, exist_ok=True)
  Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf8")
  print(json.dumps(report, indent=2))
  return report


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--checkpoint", default="training/v31/checkpoints/tiny-student.pt")
  parser.add_argument("--architecture", default="res6c64")
  parser.add_argument("--output", default="training/v31/generated/student-res6c64-fp32.onnx")
  parser.add_argument("--report", default="training/v31/generated/onnx-export-report.json")
  parser.add_argument("--opset", type=int, default=17)
  args = parser.parse_args()
  export(args)


if __name__ == "__main__":
  main()
