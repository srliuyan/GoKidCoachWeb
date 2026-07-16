# GoKidCoach V3.0.1 License Audit

Status: research only. No model binary, inference runtime, or third-party source is vendored by this task.

## License Gate

A library or model is acceptable for a future browser-local prototype only when all of these are known:

- source-code license
- model or weights license
- redistribution terms for static GitHub Pages hosting
- attribution requirements
- commercial or noncommercial restrictions
- absence of hidden paid runtime dependency

Unknown license status is treated as BLOCKED.

## Libraries

| Component | License | Runtime payment | Server dependency | Redistribution status | V3.0.1 status |
| --- | --- | --- | --- | --- | --- |
| KataGo source | MIT-style with vendored third-party notices | None | Native engine normally runs locally, not in browser | Source redistribution allowed with notices | Allowed for study; not browser-ready |
| ONNX Runtime Web | MIT | None | None required | Browser bundle redistribution allowed under MIT | Recommended runtime candidate |
| TensorFlow.js | Apache-2.0 | None | None required | Browser bundle redistribution allowed under Apache-2.0 | Viable alternative |
| Minigo source | Apache-2.0 | None | None required for exported models | Source redistribution allowed; model files require separate confirmation | Candidate only after model license check |
| Leela Zero source | GPL-3.0 | None | None required | GPL obligations would apply to derivative distribution | BLOCKED unless project accepts GPL obligations and network license is confirmed |
| WebNN | Browser API | None | None | No bundled library implied | Not primary due Safari/operator uncertainty |

## Public Go Model Families

| Model family | Known license evidence | Redistribution status | Notes | Status |
| --- | --- | --- | --- | --- |
| KataGo official distributed-training networks | KataGo network license grants broad redistribution for official networks, with specific CC0 exceptions for some older g170 networks and MIT-style terms for others | Likely allowed when exact file is confirmed | Strongest public model family; large modern models may exceed iPad budget | Candidate |
| KataGo g170 b6/b10 small networks | Network license page lists g170 exception under CC0 | Likely allowed when exact artifact is confirmed | Best first inspection candidate due size/complexity tradeoff | Candidate |
| KataGo human-style networks | Publicly released by KataGo project; exact model license must be tied to downloaded artifact | Pending | Better style fit possible, but likely larger than initial iPad budget | Pending |
| Leela Zero networks | Source GPL-3.0; network redistribution terms must be verified separately | Unclear | Technically simpler older architecture, but legal clarity is weaker | BLOCKED |
| Minigo networks | Source Apache-2.0; model artifact license/format must be verified | Unclear | Useful fallback candidate if ONNX export path is easier | Pending |

## Recommended License Position

For the next implementation step, inspect exactly one small KataGo g170 network artifact, record its checksum and license status, and keep the binary out of Git until explicitly approved. ONNX Runtime Web is the preferred runtime candidate because its MIT license and static-browser deployment model fit GitHub Pages.

No route in this audit requires a paid runtime API or private inference server.
