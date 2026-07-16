#!/usr/bin/env python3
"""Run or diagnose official KataGo raw network reference inference.

The selected V3.0.3 model is a legacy KataGo text network. Official KataGo
can load it through C++ and the v1.3 TensorFlow-era Python sources, but this
repository does not contain a validated Python/PyTorch loader for that text
format. This tool verifies the model and fixture, records the official loader
status, and fails before inference when the official loader is unavailable.
"""

import argparse
import gzip
import hashlib
import json
import os
import sys
from pathlib import Path

EXPECTED_SHA256 = "3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4"


def sha256_file(path):
  h = hashlib.sha256()
  with path.open("rb") as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
      h.update(chunk)
  return h.hexdigest()


def load_fixture(path, fixture_id=None):
  data = json.loads(Path(path).read_text(encoding="utf8"))
  fixtures = data["fixtures"] if isinstance(data, dict) and "fixtures" in data else data
  if fixture_id is None:
    return fixtures[0]
  for fixture in fixtures:
    if fixture.get("id") == fixture_id:
      return fixture
  raise ValueError(f"fixture not found: {fixture_id}")


def read_model_header(path):
  with gzip.open(path, "rt", encoding="utf8") as f:
    return [next(f).strip() for _ in range(11)]


def diagnose_loader(katago_source):
  source = Path(katago_source)
  v13_python = source / "KataGo-1.3" / "python"
  v116_python = source / "KataGo-1.16.5" / "python"
  result = {
    "v13TensorFlowModelPy": str(v13_python / "model.py"),
    "v13ModelConfigs": str(v13_python / "modelconfigs.py"),
    "v116PytorchLoadModel": str(v116_python / "katago" / "train" / "load_model.py"),
    "v116PytorchModel": str(v116_python / "katago" / "train" / "model_pytorch.py"),
    "tensorflowAvailable": False,
    "torchAvailable": False,
    "officialPythonTextLoaderAvailable": False,
    "officialPytorchTextLoaderAvailable": False,
  }
  try:
    import tensorflow  # noqa: F401
    result["tensorflowAvailable"] = True
  except Exception as exc:
    result["tensorflowImportError"] = str(exc)
  try:
    import torch  # noqa: F401
    result["torchAvailable"] = True
  except Exception as exc:
    result["torchImportError"] = str(exc)
  result["officialPythonTextLoaderAvailable"] = result["tensorflowAvailable"] and (v13_python / "model.py").exists()
  # Modern official PyTorch loader is checkpoint-state-dict based; it is not a text-network loader.
  result["officialPytorchTextLoaderAvailable"] = False
  return result


def main(argv=None):
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--model", required=True, type=Path)
  parser.add_argument("--fixtures", required=True, type=Path)
  parser.add_argument("--fixture-id")
  parser.add_argument("--katago-source", required=True, type=Path)
  parser.add_argument("--expected-sha256", default=EXPECTED_SHA256)
  parser.add_argument("--out", type=Path)
  args = parser.parse_args(argv)

  if not args.model.exists():
    raise SystemExit(f"source model not found: {args.model}")
  digest = sha256_file(args.model)
  if digest.lower() != args.expected_sha256.lower():
    raise SystemExit(f"source hash mismatch: expected {args.expected_sha256}, got {digest}")

  fixture = load_fixture(args.fixtures, args.fixture_id)
  header = read_model_header(args.model)
  loader = diagnose_loader(args.katago_source)
  report = {
    "status": "failed",
    "reason": "official raw reference inference cannot run: no official Python/PyTorch text-network loader is available in this environment",
    "model": {
      "path": str(args.model),
      "sha256": digest,
      "name": header[0],
      "modelVersion": int(header[1]),
      "spatialInputFeatures": int(header[2]),
      "boardSize": int(header[3]),
    },
    "fixture": {
      "id": fixture["id"],
      "fixtureHash": fixture["fixtureHash"],
      "sideToMove": fixture["sideToMove"],
      "rules": fixture["rules"],
      "komi": fixture["komi"],
    },
    "loader": loader,
    "outputs": None,
  }
  if args.out:
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf8")
  print(json.dumps(report, indent=2))
  return 1


if __name__ == "__main__":
  raise SystemExit(main())
