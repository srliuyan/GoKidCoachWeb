# GoKidCoach V3.0.1 Neural Feature Schema Draft

Status: schema planning only. No encoder implementation is included.

## Existing GameCore Inputs

The future encoder should derive neural features from the existing trusted board/rule state:

- current player stones;
- opponent stones;
- empty points;
- liberties;
- ko point;
- legal move mask;
- recent move history;
- side to move;
- komi;
- rule profile;
- move number;
- consecutive pass state.

The encoder must not create a second independent rule system for legality.

## Candidate Feature Families

| Feature | GoKidCoach source | KataGo-like need | Leela Zero-like need | Notes |
| --- | --- | --- | --- | --- |
| Current stones | Board state | Required | Required | Perspective-normalized |
| Opponent stones | Board state | Required | Required | Perspective-normalized |
| Liberty planes | Group analysis | Common | Not always present | Must match selected model |
| Ko point | Rule engine | Required for legality | Required for legality | Single-point plane or global field |
| Recent moves | Move history | Model-dependent | Common in AlphaGo Zero style | Exact history depth must match model |
| Legal mask | Rule engine | Runtime mask | Runtime mask | Applied after policy output |
| Komi | Game settings | Often global input | Often omitted | Required if model expects global inputs |
| Rules | Game settings | KataGo uses rule-related inputs | Usually fixed | Must not silently mismatch |
| Move number | Game state | Sometimes global input | Often omitted | Useful for phase-aware prototypes |
| Pass state | Move history | Required for pass/legal handling | Required for pass/legal handling | Pass index must be stable |

## Coordinate Contract

Any future encoder must round-trip:

- GoKidCoach board coordinate;
- SGF coordinate;
- neural tensor index;
- policy output index;
- KataGo GTP coordinate where used offline.

The pass move uses policy index 361 for a 19x19 board.

## Model-Specific Differences

KataGo-style inputs usually require richer feature planes and global inputs than Leela Zero-style networks. Leela Zero-style models are simpler but older and may have license or strength limitations. The final feature schema must be selected only after the model artifact and manifest are selected.

## Current Decision

No feature schema is finalized in V3.0.1. The architecture records the manifest contract so a future implementation can validate that the encoder, model, and inference provider agree before running any neural inference.
