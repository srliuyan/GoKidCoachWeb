#!/usr/bin/env python3
"""Inspect a small KataGo text network and attempt a guarded ONNX export.

This script deliberately refuses to emit a placeholder ONNX graph. The old
KataGo text format contains KataGo-specific feature handling and global pooling
blocks, so a real export must be implemented and validated against native
KataGo before browser inference work begins.
"""

import argparse
import gzip
import hashlib
import json
import re
import sys
import time
from pathlib import Path


SUPPORTED_TEXT_MODEL_VERSION = 8
NUMERIC_LINE = re.compile(r"^[-+0-9.eE ]+$")


def sha256_file(path):
  if not path.exists():
    raise FileNotFoundError(f"source model not found: {path}")
  h = hashlib.sha256()
  with path.open("rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
      h.update(chunk)
  return h.hexdigest()


def read_text_model_lines(path):
  if not path.exists():
    raise FileNotFoundError(f"source model not found: {path}")
  if path.suffix != ".gz":
    raise ValueError("expected a gzipped KataGo text model")
  with gzip.open(path, "rt", encoding="utf8") as f:
    return [line.strip() for line in f]


def is_numeric_line(line):
  return bool(NUMERIC_LINE.match(line))


def parse_structure(lines):
  if len(lines) < 12:
    raise ValueError("model file is too short to be a KataGo text network")
  try:
    model_version = int(lines[1])
    input_features = int(lines[2])
    board_size = int(lines[3])
  except ValueError as exc:
    raise ValueError("failed to parse KataGo model header") from exc
  if lines[4] != "trunk":
    raise ValueError("expected trunk section at line 4")
  try:
    trunk = {
      "blockCount": int(lines[5]),
      "channels": int(lines[6]),
      "regularChannels": int(lines[7]),
      "gpoolChannels": int(lines[8]),
      "gpoolOutChannels": int(lines[9]),
      "globalInputChannels": int(lines[10]),
    }
  except ValueError as exc:
    raise ValueError("failed to parse trunk header") from exc

  sections = []
  for index, line in enumerate(lines):
    if is_numeric_line(line):
      continue
    dims = []
    j = index + 1
    while j < len(lines) and is_numeric_line(lines[j]) and len(lines[j].split()) <= 10:
      dims.append(lines[j].split())
      j += 1
    sections.append({"line": index, "name": line, "dims": dims})

  return {
    "modelName": lines[0],
    "modelVersion": model_version,
    "inputFeatureCount": input_features,
    "boardSize": board_size,
    "trunk": trunk,
    "sections": sections,
    "sectionNames": [item["name"] for item in sections],
    "hasGlobalPoolingBlocks": any(item["name"] == "gpool_block" for item in sections),
    "hasPolicyHead": any(item["name"] == "policyhead" for item in sections),
    "hasValueHead": any(item["name"] == "valuehead" for item in sections),
    "hasOwnershipHead": any(item["name"] == "vownership/w" for item in sections),
    "hasScoreHead": any(item["name"] == "sv3/w" for item in sections),
  }


def write_manifest(path, manifest):
  if not path:
    return
  Path(path).parent.mkdir(parents=True, exist_ok=True)
  Path(path).write_text(json.dumps(manifest, indent=2), encoding="utf8")


def build_manifest(args, source_hash, structure, status, reason, started_at, ended_at):
  return {
    "tool": "export-katago-small-to-onnx.py",
    "status": status,
    "reason": reason,
    "sourceModel": str(args.source_model),
    "sourceSha256": source_hash,
    "outputOnnx": str(args.output_onnx),
    "boardSize": args.board_size,
    "opset": args.opset,
    "startedAtUnix": started_at,
    "endedAtUnix": ended_at,
    "structure": {
      "modelName": structure.get("modelName"),
      "modelVersion": structure.get("modelVersion"),
      "inputFeatureCount": structure.get("inputFeatureCount"),
      "boardSize": structure.get("boardSize"),
      "trunk": structure.get("trunk"),
      "hasGlobalPoolingBlocks": structure.get("hasGlobalPoolingBlocks"),
      "hasPolicyHead": structure.get("hasPolicyHead"),
      "hasValueHead": structure.get("hasValueHead"),
      "hasScoreHead": structure.get("hasScoreHead"),
      "hasOwnershipHead": structure.get("hasOwnershipHead"),
    },
  }


def main(argv=None):
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("source_model", type=Path)
  parser.add_argument("output_onnx", type=Path)
  parser.add_argument("--board-size", type=int, default=19)
  parser.add_argument("--expected-sha256")
  parser.add_argument("--manifest-out", type=Path)
  parser.add_argument("--opset", type=int, default=17)
  args = parser.parse_args(argv)

  started_at = time.time()
  source_hash = None
  structure = {}
  try:
    source_hash = sha256_file(args.source_model)
    if args.expected_sha256 and source_hash.lower() != args.expected_sha256.lower():
      raise RuntimeError(f"source hash mismatch: expected {args.expected_sha256}, got {source_hash}")
    lines = read_text_model_lines(args.source_model)
    structure = parse_structure(lines)
    if structure["modelVersion"] != SUPPORTED_TEXT_MODEL_VERSION:
      raise RuntimeError(f"unsupported KataGo text model version: {structure['modelVersion']}")
    if structure["boardSize"] != args.board_size:
      raise RuntimeError(f"model board size {structure['boardSize']} does not match requested {args.board_size}")

    missing = []
    for module_name in ("onnx", "onnxruntime"):
      try:
        __import__(module_name)
      except ImportError:
        missing.append(module_name)
    if missing:
      raise RuntimeError(f"missing required ONNX validation modules: {', '.join(missing)}")

    raise RuntimeError(
      "no validated KataGo text-network-to-ONNX exporter is implemented; "
      "refusing to emit a placeholder graph"
    )
  except Exception as exc:
    manifest = build_manifest(args, source_hash, structure, "failed", str(exc), started_at, time.time())
    write_manifest(args.manifest_out, manifest)
    print(json.dumps(manifest, indent=2), file=sys.stderr)
    return 1


if __name__ == "__main__":
  raise SystemExit(main())
