# OKF+ v2.3 Validating Projection Profile

Kosmos-Oden 0.6.5-beta.10 implements the **OKF+ v2.3 Validating Projection
Profile**. It is not a full GKOS governance engine and does not authorize or
apply consequential semantic changes.

## Implemented profile

- source-preserving parsing of canonical nested 2.3 frontmatter;
- compatibility projection for 2.2 and legacy notes;
- unknown extension-field preservation;
- a UID index independent of paths, with missing/invalid/duplicate/conflicting
  identity diagnostics;
- UUIDv7 and policy-permitted namespaced identifiers;
- typed relationship and lineage resolution, with no edge projected for an
  ambiguous target;
- separate `authored`, `derived`, `proposed`, `approved`, and `effective`
  containers;
- separate source-authored `tags` for navigation/discovery from governed
  `labels`; tags are never silently promoted into an authority-bearing label
  origin;
- seven deterministic assessment dimensions, null handling, policy identity,
  policy hash, stable labels, and structured diagnostics;
- seven sensitivity levels, internal default, and fail-closed invalid values;
- read-only REST/MCP projections and in-memory assess/validate operations;
- an origin-preserving Graphiti adapter and an inspector governance summary.

Proposed values are intentionally omitted from effective state. A high score
does not promote epistemic state, approve a proposal, lower sensitivity, alter
authoritative lineage, or authorize use.

## Bundled deterministic policy

The policy hash is SHA-256 over this exact UTF-8 canonical JSON (no trailing
newline):

```json
{"assessment_thresholds":[[0.9,"assessment:strongly-documented"],[0.75,"assessment:well-documented"],[0.6,"assessment:partially-supported"],[0.4,"assessment:weakly-supported"],[0.01,"assessment:insufficient"],[0,"assessment:invalid-or-untraceable"]],"compatible_okf_versions":["2.3"],"missing_value_behavior":"exclude-null-and-renormalize","policy_id":"policy:okf23-default-v1","policy_version":"1.0.0","sensitivity_default":"internal","weights":{"contradiction_status":0.1,"evidence_support":0.2,"provenance_quality":0.2,"relationship_integrity":0.15,"review_readiness":0.1,"structural_completeness":0.15,"temporal_freshness":0.1}}
```

Hash:
`sha256:c2c476ca6f847bca20477d36ddda7a443d9fb4c5a9b1c3677a4347436deb0fb2`.

Missing dimensions are excluded and remaining weights are renormalized. Scores
are rounded to four decimal places. Assessment timestamps use source timestamps
so identical source bytes and policy inputs produce stable output.

## Explicit limitations

Beta.10 does not claim a general-purpose Governed Writer, authority verification, human
attestation, automatic epistemic promotion, automatic sensitivity reduction,
authorized operational use, full sidecar-decision processing, signed schema
package installation, remote schema updates, or full GKOS conformance. The
separate standalone-engine directive remains a future package/repository plan.
