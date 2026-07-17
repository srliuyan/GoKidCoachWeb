#!/usr/bin/env python3
"""Small browser-oriented Go policy/value/score student model."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F


BOARD_SIZE = 19
PASS_INDEX = BOARD_SIZE * BOARD_SIZE
POLICY_SIZE = PASS_INDEX + 1


@dataclass(frozen=True)
class StudentArchitecture:
  name: str
  input_planes: int
  residual_blocks: int
  channels: int


ARCHITECTURES: Dict[str, StudentArchitecture] = {
  "res6c64": StudentArchitecture("res6c64", 12, 6, 64),
  "res8c64": StudentArchitecture("res8c64", 12, 8, 64),
  "res6c96": StudentArchitecture("res6c96", 12, 6, 96),
}


class ResidualBlock(nn.Module):
  def __init__(self, channels: int):
    super().__init__()
    self.conv1 = nn.Conv2d(channels, channels, 3, padding=1, bias=True)
    self.conv2 = nn.Conv2d(channels, channels, 3, padding=1, bias=True)

  def forward(self, x: torch.Tensor) -> torch.Tensor:
    residual = x
    x = F.relu(self.conv1(x))
    x = self.conv2(x)
    return F.relu(x + residual)


class GoStudentNet(nn.Module):
  def __init__(self, architecture: StudentArchitecture):
    super().__init__()
    self.architecture = architecture
    c = architecture.channels
    self.stem = nn.Conv2d(architecture.input_planes, c, 3, padding=1, bias=True)
    self.blocks = nn.Sequential(*[ResidualBlock(c) for _ in range(architecture.residual_blocks)])
    self.policy_conv = nn.Conv2d(c, 2, 1, bias=True)
    self.policy_fc = nn.Linear(2 * BOARD_SIZE * BOARD_SIZE, POLICY_SIZE)
    self.value_conv = nn.Conv2d(c, 1, 1, bias=True)
    self.value_fc1 = nn.Linear(BOARD_SIZE * BOARD_SIZE + 4, c)
    self.value_fc2 = nn.Linear(c, 1)
    self.score_fc2 = nn.Linear(c, 1)

  def forward(self, spatial: torch.Tensor, global_features: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    x = F.relu(self.stem(spatial))
    x = self.blocks(x)
    policy = self.policy_conv(x).flatten(1)
    policy_logits = self.policy_fc(policy)
    pooled = self.value_conv(x).flatten(1)
    head = F.relu(self.value_fc1(torch.cat([pooled, global_features], dim=1)))
    value_logit = self.value_fc2(head).squeeze(1)
    score = self.score_fc2(head).squeeze(1)
    return policy_logits, value_logit, score


def build_model(name: str = "res6c64") -> GoStudentNet:
  if name not in ARCHITECTURES:
    raise ValueError(f"unknown student architecture: {name}")
  return GoStudentNet(ARCHITECTURES[name])


def count_parameters(model: nn.Module) -> int:
  return sum(p.numel() for p in model.parameters())


def architecture_summary() -> Dict[str, Dict[str, float]]:
  summary = {}
  for name in ARCHITECTURES:
    model = build_model(name)
    params = count_parameters(model)
    summary[name] = {
      "parameters": params,
      "fp32Bytes": params * 4,
      "fp16Bytes": params * 2,
      "estimatedActivationBytesBatch1": ARCHITECTURES[name].channels * BOARD_SIZE * BOARD_SIZE * 4 * 4
    }
  return summary


def write_architecture_summary(path: str | Path) -> None:
  Path(path).write_text(json.dumps(architecture_summary(), indent=2), encoding="utf8")


if __name__ == "__main__":
  print(json.dumps(architecture_summary(), indent=2))
