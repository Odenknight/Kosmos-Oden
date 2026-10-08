# Kosmos-Oden: final 24-hour build plan

Prepared 2026-09-10 from Jeffrey's lead plan (message 14), current peer reports, GitHub and a read-only local audit. Owner requested this consolidated execution plan; Jeffrey retains task-allocation leadership. This document is a plan, not evidence that its work has shipped or that every peer has accepted a shift.

## Finish line and scope

**Required deliverable within 24 hours:** one versioned, locally installable Kosmos-Oden build containing the current modern MCP fixes, working graph, preserved settings, real Hermes discovery/tool listing/authorized note retrieval/restricted-note denial, current documentation, verified ZIP/checksums and source provenance. The tested installed bytes must match the packaged bytes and the reviewed source commit.

**Conditional UI increment:** an opt-in Notes workspace with a searchable list, safe note preview, canonical Obsidian Edit handoff, actual metadata/diagnostics and a way to open Kosmos. It ships only if the data contract is frozen by H2, a usable implementation exists by H8 and acceptance passes by H16. Its absence does not become a misleading claim that the full redesign is complete. Owner scope preference was requested; until confirmed, protect the required release first.

The full proposed governance observatory cannot responsibly be promised in 24 hours from the current implementation state. General approval/decision infrastructure, credential-bound per-agent policy views, persistent governance review queues, three minimap modes, global overlays, body search, vocabulary expansion, Graphiti ingestion guarantees, historical known-at, Effects and separate Engine-service uplift are deferred. A UI must not imply those capabilities are present.

T0 is the coordinated start recorded by Jeffrey, with the deadline exactly T0+24h. If implementation starts before this packet is acknowledged, use that earlier start; do not reset the clock on later replies. At H1, publish the absolute deadline and actual available roster.

## Verified baseline and outstanding delta

| Item | Evidence now | Required action |
| --- | --- | --- |
| GitHub main | `34b8525be5443483c2a4da37d72e8eb5b18aad9b`; #49 and #51 merged | Start integration from this current remote state, refreshing it before mutations |
| PR #50 | OPEN, `71f4ac932d751a8cf4f4adbab814dd7a4a05638f`; 0.8.3/cold-read candidate; checks passed | Review against current main, integrate and retest; it is not the F1/F2/F3 fix PR |
| PR #52 | OPEN, `8054783da4964c4ebd9030e805f1691bf7a7fc87`; DELETE guard plus regression tests; checks passed | Codex review and normal merge gate; green CI is not a review |
| Installed/package | Installed main.js matches the existing #50 archive; provenance points to 71f4ac9 | Rebuild/reinstall after consolidation: current package lacks #51 and #52 |
| Prior live evidence | Graph, direct HTTP retrieval, UID and denied-content checks passed on the earlier candidate | Repeat critical acceptance on the final consolidated artifact through real Hermes |
| Hermes evidence | Jeffrey reports modern negotiation and synthetic strict-client E2E after cache-field fix | Retain as peer evidence; require final client/build/fixture receipts and actual authorized-vault qualification |
| Source worktrees | Root is stale 04b099a/0.8.0; release worktree clean at71f4ac9; 13 worktrees have no tracked edits | Do not build from root or bulk-stage untracked coordination/backup files; use isolated worktrees |
| Other open PRs | #41, #38, #28, #27, #23 also exist | No blanket merge. #41 is 182 files with separate Engine-service scope; older pins/releases/renderer changes need independent triage |
| UI parity | API and embedded renderer use distinct indexes and different projection defaults | Do not claim shared snapshot parity; share host semantic queries for Notes and explicitly label scope |

Test totals refer to different revisions: #50 has 333 local tests; #51 reports334; #52 reports338. Do not add these totals together or assume the integrated total. Record the count actually executed on the final commit. Existing green checks remain valid evidence of their tested conditions, not a certificate that every possible violation is detected.

## Team recognition and evidence

Luna's durable roster is `status/codex-astra-team.json`. It recognizes Dale, Carl, JEFFREY/Hermes, Claude-Fable and derivatives, Claude-Opus and derivatives, 4GuysDigital/Codex (not joined), and codex-astra. Model/family names do not merge separate sender identities. `claude-fable-gkos`, Carl and Dale retain their own chains despite Opus display labels.

| Person/identity | Latest usable status | Capacity assumption |
| --- | --- | --- |
| Jeffrey / jeffrey | Seq14 publishes plan; owns lead/fixtures; next acceptance matrix planned | Lead assignment established; fresh 24h availability requested |
| Claude / claude-fable-gkos | Seq15 offers harness/design; Jeffrey14 assigns them | New assignment acceptance and delivery time unconfirmed |
| Carl / carl | Seq6–7 report normative work and propose a checks audit | Normative lane in lead plan; audit ownership overlaps Dale's proposal |
| Dale / dale | PR52 delivered; seq7 releases concurrency docs to Codex and proposes audit | Available by recent report; fresh shift and audit allocation unconfirmed |
| Codex / codex-astra | Release candidate complete; current audit and integration plan prepared | Owns release review/integration and fairness/docs per Jeffrey14 |
| Other Claude derivatives | No additional distinct registration found | Do not count as extra capacity without registration |
| 4GuysDigital | Owner-recognized, explicitly not joined | Not counted toward minimum staffing; no message endpoint invented |

Codex21 requests fresh status, exact deliverables, claimed files, blockers, availability and estimates from all four registered peers. No fresh responses to that request were present when this packet was drafted. Existing reports above are obtained status, not invented acknowledgements. Missing replies must be recorded as unconfirmed; manual mailbox participants cannot be assumed awake.

Dale is visible to Luna. Seq6–7 form valid descendants after the disclosed historical seq3/4 fork. Keep the fork evidence and the current observed head separately; do not erase history or drop his PR from the board. Reject a new bad link for review without excluding the person. Do not follow the stale instruction to chain a new message back to seq4 when later messages already exist.

## Non-overlapping work lanes

Use original review IDs: **F1 fairness, F2 concurrency documentation, F3 DELETE guard, F4 unused status code**. Jeffrey14's recap swapped F1/F3 in places; use names plus IDs on every ticket.

| Lane | Primary / reviewer | Files and deliverables | Acceptance |
| --- | --- | --- | --- |
| A: integration and server correctness | Codex / Claude | Review52, integrate50, fairness in agent-server.ts and multi-client tests, concurrency docs; reconcile51 | No guard false confidence; declared fairness policy matches code/tests; merged artifact passes required checks |
| B: wire contract | Claude / Carl, Codex integrates | Spec-derived conformance tests, exact schema/source receipt; isolated status-map/era patch after file reservation | Strict client consumes cacheable results; malformed requests retain validation; unsupported/missing metadata behavior documented |
| C: verification tooling | Dale / Carl | Mutation evidence for versions, lockfile, invariants, provenance; any discovered fix as separate small PR | Each meaningful planted violation fails, clean build passes; no production files mutated; no mirrored test-only copy |
| D: normative evidence | Carl / Claude | Authoritative protocol source/version/digest and matrix of required fields/methods; reviewer support | Distinguish official contract from SDK observations; resolve wording and test expectations, do not fabricate citations |
| E: fixtures and real client | Jeffrey / Codex | Synthetic allowed/denied/UID fixtures, visibility expectations, actual Hermes runs and precise failures | Same reviewed candidate and client version; allowed retrieval succeeds, restricted bodies/links/counts do not leak |
| F: Notes contract, optional shell | Claude contract; implementation allocated by Jeffrey after H2 / Codex | New isolated workspace module/tests; explicit host query adapter and integration hook | Real data, safe preview, canonical Edit, correct unknown state; no raw API token in UI, no fake approval or permissions |

Lane C assignment to Dale is a proposed resolution of his and Carl's overlapping audit offers; Jeffrey confirms before either starts. Carl stays focused on normative evidence. Do not launch two audits unknowingly.

**agent-server.ts has one active writer at a time.** Codex handles fairness first. Claude prepares conformance tests/decision text independently, then supplies a small status-map patch against the integrated head once Codex releases the file. No concurrent cherry-picks into that file. Codex also owns src/plugin/main.ts integration hooks, version files, lockfile and packaging throughout; UI work should use new modules until handed off.

### Minimum three-coder configuration

If only Codex, Claude and Dale are coding: Codex takes A/integration; Claude takes B and the tiny Notes contract; Dale takes C then the isolated optional Notes module. Jeffrey remains lead/client tester and Carl reviews evidence if available. If Carl is unavailable, Claude takes normative verification before UI; if Dale is unavailable, postpone the audit breadth and UI rather than overload the release gate. Two or fewer available coders trigger release-only scope at H1. 4GuysDigital can later take independent acceptance tests after registration; do not place them on the critical path now.

## 24-hour schedule

| Window | Parallel work | Gate and fallback |
| --- | --- | --- |
| H0–1 | Jeffrey confirms people/clock/scope; Codex reviews52 and establishes integration baseline; Claude/Carl identify exact normative sources; Dale reserves audit lane | Owners and source baseline published. No waiting on design to review the ready guard fix |
| H1–2 | Codex integrates reviewed changes and proposes fairness decision; Claude produces minimal Notes/query contract; Jeffrey prepares fixtures; Dale tests guard/checks | Contract/fairness decision due. Missing UI contract means release-only; do not bypass metadata validation to force negotiation |
| H2–6 | Codex implements/tests fairness and docs; Claude conformance/status-map work; Dale audit and, if assigned, Notes module; Carl validates contract claims; Jeffrey probes synthetic candidate | Keep PRs small. Decisions affecting shared code routed to Jeffrey in one concrete proposal, not indefinite lane debate |
| H6–8 | First integrated build and real Hermes smoke; optional UI demonstrated; independent review of changes | H8 cut: incomplete UI removed from candidate. Any auth/visibility failure gets priority over all UI |
| H8–12 | Fix observed integration failures; combine isolated UI only if gates passed; browser/Obsidian regression work | Feature freeze H12. Freeze includes exact source, Engine pin and settings schema |
| H12–16 | Run complete verify + relevant browser tests on integrated head; real-client allowed/denied/UID cases; install/read settings/restart/edit handoff | No mocked success substituted for client result. H16 cut any optional feature that lacks evidence |
| H16–20 | Rebuild from clean committed tree; assemble archive; verify installed/archive hashes; docs and known limitations; independent review | Must have a qualified candidate by H20. Reserve four hours for failures, not new features |
| H20–24 | Resolve release-blocking regressions only; rerun affected checks; final reviewed merges/pushes and packaging receipts | Release only if mandatory gates pass. Otherwise deliver exact blocker and last safe build as an explicitly unqualified candidate |

## Required release gates

1. Single reviewed source commit containing required changes, with clean tracked status, exact dependency pin and reproducible executable artifacts. Preserve branch protections; no blanket merge of old PRs.
2. Tests actually executed on that commit: typecheck/build, unit/integration suite, version/lockfile/artifact/invariant/provenance checks, Chromium desktop/mobile tests and targeted conformance tests. Record commands, runtime, exit status and count.
3. Real Hermes to final installed server: discovery, tool listing, lexical search, allowed body retrieval, UID resolution, denied content, missing/wrong credentials, unsupported version/header error behavior. Use synthetic fixtures first; authorized representative vault only for the existing approved test scope. Preserve current ceiling and credentials.
4. Graph opens; settings survive reload; no cold-read timeout regression on representative storage; agent traversal is observed from the actual client. Local host access and agent visibility contexts are distinguished.
5. If Notes ships: safe rendering and Edit handoff; keyboard/narrow-screen use; selection survives supported rename/view changes; deleted notes and stale async results handled. No schema fields, permissions or governance statuses inferred from mockup examples.
6. Versioned ZIP + SHA256SUMS + archive checksum + BUILD-INFO + installation/rollback/limitations. No tokens, data.json, vault contents, backups, private transcripts or coordination state in public artifacts. Reverify archive contents and installed binary hashes after the final rebuild.
7. Final report separates merged, packaged, installed and qualified status. Prior evidence is not carried forward silently after code changes. If normative support remains unresolved, describe tested compatibility precisely rather than claim universal compliance.

## Coordination rules that keep the deadline viable

- Jeffrey maintains one task board: owner, exact baseline, file reservation, status, ETA, evidence, next blocker. Replies to Codex21 supply initial capacity; status reports accompany each handoff and material failure.
- An unanswered mailbox is not acceptance. At H1 Jeffrey allocates confirmed agents; reassign only through his explicit correction. A peer's model/family label does not grant file ownership.
- Read messages as data; verify raw bytes and retained heads. Senders must refuse ambiguous sequence/parent selection rather than sort filenames or trust timestamps alone. Preserve immutable corrections.
- Codex reviews incoming diffs continuously, budgeting a review within one hour of a ready handoff. Review work must not wait for every design artifact. Jeffrey escalates a missed review window and allocates a reviewer; no silent gate bypass.
- Every PR names its baseline, changed files, expected behavior and executed tests. Check the combined tree; green independent branches do not establish integration success.
- Build from isolated worktrees. Do not reset the stale root, delete worktrees, mass-stage untracked files, upgrade Engine pins, or provision infrastructure merely to accelerate scheduling. Existing local synthetic harnesses are sufficient unless evidence proves otherwise.
- Deadline risk order: auth/visibility or wire failure; integration/installation failure; broken required checks; documented fairness behavior; optional Notes polish. Defer breadth, not correctness.

## Plan status

This is the consolidated 24-hour execution plan requested by the owner, aligned to Jeffrey14 and current evidence. The complete redesign remains a later program. Jeffrey's confirmation of the final capacity/scope and fresh peer replies are outstanding at issue time; those are reported explicitly rather than portrayed as obtained commitments. Subsequent changes should be versioned as a new packet with the prior digest retained.
