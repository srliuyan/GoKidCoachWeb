# GoKidCoach V3.0.2 Model Inspection

Status: blocked before ONNX export. No model binary is tracked.

## Selected Model

- Exact file: `g170e-b10c128-s1141046784-d204142634.txt.gz`
- Family: official KataGo g170e small network
- Source release: KataGo `v1.3`, published 2020-01-13
- Reason b6 was not selected: no `g170-b6c96` release asset was discoverable through GitHub releases, and the official historical CloudFront archive referenced by KataGo release notes was not reachable from this environment. The b10 asset was the smallest verifiable official g170-family GitHub release asset found.
- Compressed size: 14,466,254 bytes
- Uncompressed size: 36,484,194 bytes
- SHA-256: `3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4`

## License Result

KataGo source is MIT-style with vendored notices. The KataGo neural-network license page states that official `g170` run networks are an exception covered by CC0 rather than the newer MIT-style network license. This model is treated as legally viable for inspection and later redistribution, subject to preserving attribution in project docs.

## Inspected Structure

- Format: KataGo gzipped text neural-net format
- Model version: `8`
- Board size: `19`
- Input feature planes: `22`
- Trunk blocks: `10`
- Trunk channels: `128`
- Global pooling channels: `96`
- Global input channels: `32`
- Residual structure: ordinary residual blocks plus global-pooling residual blocks
- Policy head: board policy logits plus pass branch
- Value head: value output, score auxiliary output, and ownership output
- Tensor dtype: float32 text weights

## Export Result

`tools/export-katago-small-to-onnx.py` can validate the source path, hash, model version, board size, and parsed structure. It intentionally returns nonzero before writing ONNX because no validated KataGo text-network-to-ONNX graph exporter exists in this repository.

`onnx` and `onnxruntime` were installed only in the ignored private V3.0.2 virtual environment to rule out a missing-package-only failure. With those dependencies available, the script still refuses to emit ONNX because the actual KataGo graph conversion is not implemented and validated.

The script refuses to emit a fake or partial graph. The specific unsupported pieces are:

- KataGo-specific feature encoder parity;
- global-pooling residual blocks;
- policy pass branch;
- value, score, and ownership heads;
- native-output equivalence validation path.

## Gate Status

V3.0.2 does not pass. The exact blocker is the absence of a validated exporter for this old KataGo text model. Browser integration must not start from this state.
