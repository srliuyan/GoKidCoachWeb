# GoKidCoach V3.0.3 Official KataGo Loader Audit

Status: precise export blocker identified. No browser integration was attempted.

## Source Checkouts

Official KataGo source tarballs were inspected in the ignored private workspace:

- `v1.3`: compatible with the selected `g170e-b10c128-s1141046784-d204142634.txt.gz` release family.
- `v1.16.5`: compatible with the locally available native KataGo binary version and modern PyTorch training/export code.

The private source archives and extracted checkouts are not staged.

## Official Components Located

| Responsibility | Official file |
| --- | --- |
| Legacy text model parsing | `cpp/dataio/loadmodel.cpp`, `cpp/dataio/loadmodel.h` |
| Model version metadata | `cpp/neuralnet/modelversion.cpp`, `cpp/neuralnet/modelversion.h` |
| Native feature encoding | `cpp/neuralnet/nninputs.cpp`, `cpp/neuralnet/nninputs.h` |
| Native NN interface | `cpp/neuralnet/nninterface.h`, `cpp/neuralnet/nneval.cpp` |
| v8 TensorFlow model definition | `KataGo-1.3/python/model.py` |
| v8 architecture configs | `KataGo-1.3/python/modelconfigs.py` |
| Modern PyTorch model definition | `KataGo-1.16.5/python/katago/train/model_pytorch.py` |
| Modern PyTorch checkpoint loader | `KataGo-1.16.5/python/katago/train/load_model.py` |
| Modern PyTorch export-to-KataGo format | `KataGo-1.16.5/python/export_model_pytorch.py` |

## Loader Finding

The selected model is a legacy KataGo text network:

- model version: `8`
- model name: `b10c128-s1141046784-d204142634`
- format: `.txt.gz`
- official architecture path: v1.3 TensorFlow-era model code plus native C++ text loader

Modern KataGo PyTorch code does not provide a direct loader for this legacy `.txt.gz` network. The official PyTorch `load_model` path loads training checkpoints/state dicts, not exported text networks.

## Feature Encoder Finding

The official feature source of truth is KataGo's `nninputs` implementation and the v1.3 `Model.fill_row_features` logic. The model expects:

- `22` spatial input feature planes;
- `19` global features;
- board size `19`;
- pass index `361`;
- rules, komi, ko, history, liberty, and ladder-related data encoded according to the official v8 feature schema.

The bridge cannot safely generate feature tensors until it can execute or faithfully bind to the official feature encoder.

## V3.0.3 Blocker

The required PyTorch bridge cannot be built from official code for this model without first implementing one of these:

1. a verified converter from legacy KataGo text weights into the modern PyTorch model/state_dict format;
2. a TensorFlow v1 graph export path from the official v1.3 model to ONNX;
3. a C++ native loader binding that exposes raw network inference and layer outputs.

No placeholder graph was emitted.
