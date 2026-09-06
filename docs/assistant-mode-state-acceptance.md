# Assistant mode acceptance matrix

| Condition | Badge | Authority |
| --- | --- | --- |
| No private sync link | Grounded local | Deterministic local engine |
| Private sync linked, cloud health checking | Grounded local | Deterministic local engine |
| Private sync linked, cloud configured, no validated response yet | Cloud ready | Deterministic local engine until first validated model response |
| Validated model response succeeded for active profile | Grounded model | Deterministic inventory evidence + validated model explanation |
| Model request fails or response fails grounding validation | Local fallback | Deterministic local engine |
| Device offline | Grounded local | Deterministic local engine |
| Production model service unconfigured | Grounded local | Deterministic local engine |

A successful Bill response never marks Aimee verified, and vice versa. Verification is intentionally browser-session scoped rather than persisted.
