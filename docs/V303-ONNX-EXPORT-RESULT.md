# GoKidCoach V3.0.3 ONNX Export Result

Status: failed cleanly before ONNX graph creation.

## Selected Model

- File: `g170e-b10c128-s1141046784-d204142634.txt.gz`
- SHA-256: `3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4`
- License: official KataGo `g170` network exception, CC0

## Reference Inference

`tools/run-katago-network-reference.py` verifies the model hash and fixture metadata, then fails before inference because no official Python/PyTorch text-network loader is available in this environment.

This is not a numerical mismatch; raw reference inference did not start.

## Feature Inspection

`tools/inspect-katago-features.py` validates the deterministic fixture hashes and reports expected v8 shape metadata:

- spatial shape: `[1, 361, 22]`
- global shape: `[1, 19]`
- pass index: `361`

Actual feature tensor hashes remain unavailable until the official feature encoder can be executed from the bridge.

## ONNX Export

`tools/export-katago-small-to-onnx.py` now checks for official source layout and reports the precise loader issue. It refuses to create ONNX because:

- the selected `.txt.gz` model belongs to the TensorFlow/C++ text-loader era;
- modern official PyTorch code loads checkpoints, not exported text networks;
- no verified legacy-text-to-PyTorch state_dict converter exists in this repository.

## Browser Operator Audit

No real ONNX graph exists, so WebGPU/WASM operator compatibility remains blocked. Any future audit must be based on the actual exported graph's operator inventory.

## Next Step

Build the bridge at the loader boundary first: either convert the v8 text weights into the official modern PyTorch state_dict layout with layer-by-layer checks, or export the official v1.3 TensorFlow graph directly to ONNX.
