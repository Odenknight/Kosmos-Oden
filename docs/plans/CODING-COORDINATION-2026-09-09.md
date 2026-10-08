# Kosmos-Oden coding coordination

Owner instruction, 2026-09-09: “Coordinate with the other teammates on who can code what. You will review and debug before it gets pushed to GitHub.”

Codex coordinates coding and owns the review/debug gate. The owner retains final product authority. The assignments below are proposed to teammates pending their confirmation; existing local work must be disclosed before overlapping edits begin.

## Work allocation

### Reconciled allocation after Claude seq10 and JEFFREY seq7

This update supersedes the crossed adapter-seam proposals below: Claude accepts server/protocol/docs and withdraws the seam; Codex takes the seam and retrieval integration. JEFFREY owns synthetic fixtures and vocabulary design/evidence, without source implementation. Claude alone edits `src/plugin/agent-server.ts` and its named tests; Codex owns `src/plugin/vault-provider.ts` and `src/retrieval/*`. Engine inline parsing is deferred. JEFFREY uses only `artifacts/jeffrey/` for this package. These compatible offers establish the first build allocation; any expanded scope or shared-file handoff must be coordinated again. No fetch, pull or code import was performed during this status check.

Claude should revise the modern-only documentation locally before review rather than merge known-stale wording. Existing PR review order is 46, 47, 48, then revised 45; this is review order, not approval. Codex must reproduce checks on exact candidates before pushing/merging. GitHub protection requirements still apply; owner delegation alone does not satisfy an independent-review rule enforced by GitHub.

| Contributor | Proposed coding responsibility | Deliverable and boundary |
| --- | --- | --- |
| Claude / claude-fable-gkos | MCP protocol implementation and server dispatch; README and technical documentation | Confirm the current published protocol and exact Engine coordinate. Own `src/plugin/agent-server.ts` changes, including existing UID/schema and version-reporting fixes. Deliver transport/discovery/error tests and documentation of actual behavior. Coordinate Engine-side requirements before editing another repository. |
| JEFFREY | Synthetic discovery fixtures and inside-vault validation; isolated vocabulary implementation if coding capacity is confirmed | Deliver authored-tag/effective-label/link fixtures with expected authorized results and hashes. Propose a separate vocabulary module and tests before claiming its paths. Do not edit server dispatch. Use synthetic fixtures for writes; live vault checks remain read-only unless separately authorized. |
| Codex | Retrieval and Engine integration contracts, corpus binding, citation checks, temporal/projection boundaries; final integration and debugging | Reserve integration work outside Claude's server file. Review existing PRs 45–48 and every new submission against exact source revisions. Own cross-component testing and resolution of regressions before any further push. |

Claude's protocol/docs ownership is already owner-established. JEFFREY has already offered the fixture package. New coding boundaries require teammate acknowledgement, including availability, current branch/base, and changed or reserved paths. Codex fills an unclaimed implementation lane rather than silently assuming it is covered.

## Order and contracts

Owner sequencing clarification: coordinate locally for build assignments **before pulling any code**. Until the allocation is acknowledged and overlapping paths are resolved, hold pulls, fetches, clones, dependency updates, and importing peer patches/bundles. Local mailbox and existing-file inspection may continue. Record each accepted assignment and base from existing local state; then Codex records that coordination is complete before code acquisition begins.

Claude seq9 offers only the adapter seam for this pass, not the broad server lane above. Updated proposed first assignment: Claude owns adapter construction in `vault-provider.ts` plus focused regression tests; protocol/docs ownership continues, but server implementation remains unclaimed until explicitly allocated. Codex reserves retrieval/match contracts and review; JEFFREY retains the offered synthetic fixtures pending acknowledgement. No concurrent Engine modification is assigned.

For the seam, use Claude's option A as the design direction: reconstruct the adapter with the current projection options when default sensitivity changes, retaining the existing rebuild guard. This is conditional on local source review confirming the described API and behavior. Test initial unlabeled-note fail-closed behavior and setting changes/rebuilds; do not drop projection options. An Engine API extension is deferred. Design agreement is not implementation or push approval. Claude must confirm exact changed paths and JEFFREY must clear any seam overlap before this assignment is ready.

1. Record exact Kosmos base SHA and Engine release/commit/package integrity. Reported main `a38aefe50cefbc7f0a13b461d35256d2f4cf5b8a` is a coordination reference, not independently verified qualification. Resolve already-open fixes before starting overlapping work.
2. Agree request/response contracts and file ownership. Target the current MCP protocol with no legacy compatibility lane. Preserve intended Kosmos features and security boundaries; observed live v0.8.2 behavior is baseline evidence, not the target protocol.
3. Land local fixes for schema acceptance/version reporting and modern transport, then vocabulary discovery and native retrieval integration. Module authors provide interfaces; Claude wires approved interfaces into server dispatch so only one person edits that file at a time.
4. Qualify against synthetic fixtures and the actual Engine/corpus. Graphiti work follows a separate evidence-backed contract: `known_at` requires retained durable transaction history and provenance. Do not advertise historical knowledge queries from current projections alone.

Required discovery semantics: navigation tags and effective governance labels are separate; count and rank only authorized inputs; bound inventory and pagination to a snapshot; preserve stable identity across moves/content changes; treat similarity and wikilinks as suggestions. Frontmatter-only discovery may precede inline-tag support if explicitly documented. Governance exports alone do not prove GKOS conformance.

## Review and push gate

- Owner explicitly assigns the GitHub push and merge to main to Codex. Teammates hand off local candidates; Codex performs the push and merge after assignment agreement, review/debug approval, and required checks. This ownership does not bypass the code-acquisition hold above.
- From this instruction onward, do not push new branches, commits, tags, releases, or merges before Codex review/debug approval. Already-pushed PRs are historical submissions awaiting review; their existence does not approve additional pushes.
- Work on separate local branches/worktrees. Reserve exact paths in the mailbox before editing shared files. Exchange local commits, patches, or git bundles through this local network; do not push merely to make a review possible.
- Each handoff supplies base SHA, candidate SHA (or patch/bundle SHA256), changed paths, behavior changes, commands and results, and remaining limitations. Include synthetic reproduction for a bug and evidence the fix resolves it.
- Codex inspects the diff, reproduces relevant checks, debugs failures, and validates cross-component behavior. Coverage must address protocol behavior, argument/schema agreement, visibility and citation boundaries, corpus/revision binding, body retrieval, and retained product features as applicable. Temporal claims require temporal evidence.
- Approval is written to the mailbox and tied to the exact reviewed candidate and checks. Any subsequent change invalidates that candidate approval until reviewed again. Codex coordinates the authorized push/merge and version/package work after the gate passes; CI failure blocks merge/release.
- Update version and README to match the final build, and leave a local testable plugin package with its hash. Do not represent a library version, live client marker, or green unit suite as complete deployment qualification.

## Communication

Use `.coordination/v1` and the existing sender helper. Send ownership acknowledgement, material findings, blockers, review requests, and exact-candidate approvals. Keep secrets and private vault content out of correspondence. Luna's 15-minute monitor alerts on meaningful changes; mailbox delivery is not proof a peer has read or accepted an assignment.
