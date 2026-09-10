# Revised Kosmos-Oden and GKOS execution plan

Revision: 2026-09-10. Status: ready for agents to claim work; release qualification remains blocked.

The immediate goal is to restore bounded, recoverable Kosmos vault reads and prove them through the real Hermes client. Successful discovery and a healthy HTTP endpoint do not qualify the data path. Later results from a different, `gkos_*` tool surface do not close that blocker until the actual server, client and loaded build are reconciled.

This packet supersedes the execution order and assignments in the September 10 Codex 24-hour mailbox plan and the September 9 coding-coordination plan. It incorporates subsequent mailbox corrections, the governed Notes workspace proposal, retrieval rev4, and the Graphiti assessment. Immutable mailbox artifacts remain historical evidence. This revision sets no invented deadline or claim of agent availability.

## Read and use this packet

- [Evidence and decisions](EVIDENCE-AND-DECISIONS.md): what is established, contradicted, inferred or still unverified.
- [Claimable work packages](WORK-PACKAGES.md): scope, file boundaries, dependencies and acceptance checks.
- [Future product and Engine tracks](FUTURE-TRACKS.md): native retrieval, Notes parity, temporal history and optional Graphiti.
- [Snapshot](SNAPSHOT.json): sanitized repository and mailbox identifiers used for this review.
- [SHA256SUMS](SHA256SUMS): file identity for comparing the repository packet with its local copy.

The source baseline is main commit `b0c7ee2845f24c53586c5bc6feaa9ae28fbff50b`, Kosmos 0.8.3, with Engine dependency pinned to `650eab4a6752227cae336d7556a57826c22a0d5a`. The publication branch already includes documentation commits `b3acd1c` and `3146fb5`; neither fixes the runtime. Check the actual checkout SHA before inspecting code: the root checkout and some review worktrees are older than this baseline.

## Execution order

1. Start **R0** runtime identity reconciliation, **R1** provider recovery design/reproduction, **R2** server lifecycle design/reproduction, and **Q1/Q2** independent conformance/audit evidence in parallel. Any available agent may take an unclaimed package using the rules below.
2. R1 and R2 agree on the deadline/error/cancellation contract before integrating source changes. Q1 prepares independent fixtures concurrently; its `agent-server.ts` changes are integrated sequentially with R2 by one writer. R1 includes the smaller operational-rename correction, with a separate regression case.
3. Run the combined synthetic suite, repository verification and an independent review. Record the candidate's exact source and artifact hashes. The host operator then installs/reloads that candidate through the existing deployment procedure and proves which module is loaded.
4. **R3** reruns the complete Hermes gate, including allowed reads, denial and traversal, against that exact runtime. Capture both client patch identity and server identity. A change or auto-update invalidates the affected receipt and requires the relevant gate again.
5. Close release qualification only after all required checks pass. Work on **E1**, **M1**, **B1**, **G1** and future contract/fixture design can proceed independently; it cannot substitute for R3.

With three available workers, a practical initial allocation is R0, R1, and R2; Q1/Q2 can run on the next available worker or be taken first by an agent without host/source access. With more workers, Q1, Q2, E1 and B1 are independent opportunities. With one worker, do R0, Q2, R1/R2, Q1, then R3. Capacity changes alter scheduling, not acceptance criteria. Q2 is a small evidence-only task suitable for the next quickest contribution; the release blocker remains higher priority for agents able to fix it.

## How any agent claims and delivers work

Read the current mailbox directly and verify recent message bytes, corrections and active claims. Use this repository's canonical `.coordination/v1` mailbox; Engine-Rust has a separate root and separate sequence counters. Follow the existing protocol rather than inventing a second registry or changing peer identities.

Publish a work proposal/claim under your own identity containing package ID, baseline SHA, intended branch/worktree, exact files, dependencies, deliverable, intended reviewer and next reporting point. An ACK of receipt is not acceptance of a task. A package in this document is an opportunity, not a claim on behalf of an absent agent.

Historical reservations are Claude's server dispatch seam and Codex's provider seam. A new contributor may immediately prepare isolated reproductions, tests and design notes. Before editing the reserved shared files, obtain an explicit handoff or an allocation from the coordinating agent/owner; never assume silence relinquishes a claim. For otherwise unclaimed work, verify no conflicting claim before starting. Escalate competing claims to Codex as the designated coding coordinator, with Jeffrey's allocation evidence and the owner's direction where needed; keep useful nonconflicting work moving.

Use one isolated worktree per implementation package from the current verified base and a `codex/` branch when Codex creates it. Do not operate in the stale mailbox checkout or stage the whole workspace. One integrator owns each shared file at a time, including shared test files and generated artifacts. Agree on new module interfaces before dependent implementation; hand off a patch/commit rather than co-editing the same file. Rebase and rerun affected checks when the integrated base changes.

Deliver a commit or patch, changed-file list, exact commands and results, failing-before/passing-after evidence where relevant, unresolved limitations, and artifact digests. Publish immutable evidence under your own mailbox artifact path and append the result message. Have another agent review the acceptance criteria before calling the package complete. A reviewer can be any qualified available peer who did not author the evidence being independently checked.

Manual mailbox checks occur before claiming, before integration and before delivery, with bounded checks during active work. This plan does not enable or alter anyone's timers. Preserve historical malformed messages and fork evidence; corrections are appends.

## Release exit criteria

- R0 maps the Kosmos and Engine endpoints/tool inventories and proves the active candidate and Hermes client identity.
- R1/R2 demonstrate bounded failure, exactly-once accounting cleanup, bounded unresolved underlying work, recovery and no stale unauthorized publication.
- Q1 confirms the modern protocol contract independently, including cache-result membership and removal of modern `ping`, while preserving validation-first error behavior.
- Q2 supplies the corrected narrow lockfile mutation evidence; existing valid audit evidence is retained.
- The combined candidate passes `npm run verify` on a supported runtime. Run the repository's applicable browser/renderer checks when the shared read helper or viewer behavior changes. Do not label a skipped required check as passing.
- R3 completes discovery, list, search, allowed UID read, restricted denial and observed traversal on the same identified Kosmos runtime, including a cold build and recovery after an injected stall in a safe test environment.
- Release/build provenance and rollback receipts are recorded. No blanket merge or closure of older PRs is part of release sign-off.

This publication changes plans only. It does not restart services, repair live vault identities, deploy Graphiti, change dependency pins, or claim implementation checks have passed.
