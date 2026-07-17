# GoKidCoach V3.1.0 Student Feature Schema

Status: fixed for the first browser student prototype.

## Tensor Shapes

- Spatial input: `[batch, 12, 19, 19]`
- Global input: `[batch, 4]`
- Policy output: `[batch, 362]`
- Value output: `[batch]`
- Score output: `[batch]`
- Pass index: `361`

## Spatial Planes

The board is canonicalized to the current player perspective.

| Plane | Meaning |
| ---: | --- |
| 0 | current-player stones |
| 1 | opponent stones |
| 2 | empty points |
| 3 | occupied points with 0-1 adjacent empty points |
| 4 | occupied points with 2 adjacent empty points |
| 5 | occupied points with 3+ adjacent empty points |
| 6 | ko point |
| 7 | most recent move |
| 8 | second most recent move |
| 9 | third most recent move |
| 10 | fourth most recent move |
| 11 | reserved zero plane for future pass/auxiliary encoding |

## Global Features

| Index | Meaning | Normalization |
| ---: | --- | --- |
| 0 | komi | `(komi - 7.5) / 10` |
| 1 | move number | `min(moveNumber, 300) / 300` |
| 2 | Chinese rules indicator | `1.0` initially |
| 3 | previous move was pass | `0` or `1` |

## Scope

The first student supports 19x19 Chinese-style play, configurable komi, side-to-move canonicalization, recent move history, ko, pass, policy/value/score outputs, and legal-move masking outside the graph.

The schema intentionally avoids KataGo's full feature set to keep iPad inference small and ONNX Runtime Web friendly.
