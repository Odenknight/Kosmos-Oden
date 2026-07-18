# OKF+ v2.3 Validating Projection Profile

Kosmos-Oden implements a deterministic, read-oriented projection of OKF+ v2.3. It is not a full GKOS governance engine and does not authorize or apply consequential semantic changes.

The shared core preserves nested and unknown frontmatter, separates authored, derived, proposed, and approved values, diagnoses identity and controlled-vocabulary problems, applies sensitivity defaults, and calculates a policy-versioned documentation/support assessment. A score is not proof of truth.

Compatibility modes are `strict-v2.3`, `compatible`, and `legacy`. The current graph index uses `compatible`; legacy OKF+ 2.2 notes remain readable. UID collisions are diagnosed and never silently merged. Existing Markdown is never rewritten by parsing, validation, assessment, REST, or MCP surfaces.

This beta does not claim the standalone-engine completion criteria. Schema-package installation, governed sidecar writing, assignment execution, the full typed relationship graph, and remote schema updates remain future, separately reviewed phases. Remote schema updates must remain disabled by default.
