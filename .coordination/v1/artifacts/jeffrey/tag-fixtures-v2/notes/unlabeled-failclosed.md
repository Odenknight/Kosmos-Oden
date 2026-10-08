---
gkx_version: "2.3"
uid: "019b2d14-4230-7db7-87d4-7d81cfaec9aa"
title: Unlabeled Fail Closed Fixture
type: semantic
created_at: "2026-07-01T00:00:00Z"
updated_at: "2026-07-02T00:00:00Z"
epistemic_state: fact
authorship_origin: authored
---
# Unlabeled Fail Closed Fixture

This GKX 2.3 note declares NO sensitivity field. Under the fail-closed control
(Engine DIV-002; Kosmos PRs #17/#19) its effective sensitivity must equal the
configured defaultSensitivity (production default: secret), and diagnostic
GKX-SENSITIVITY-001 must be present. The note must be invisible at any ceiling
ranked below the effective value. Body tag #failclosed-fixture.
