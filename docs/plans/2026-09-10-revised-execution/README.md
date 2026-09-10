# Revised Kosmos-Oden and GKOS execution plan

Revision 2: 2026-09-10, incorporating the owner-supplied execution review. Status: planning updated; runtime identity and lifecycle gates must close before behavioral fixes merge. Release qualification remains blocked.

The immediate goal is to restore bounded, recoverable Kosmos vault reads and prove them through the real Hermes client. Successful discovery and a healthy HTTP endpoint do not qualify the data path. Later results from a different, `gkos_*` tool surface do not close that blocker until the actual server, client and loaded build are reconciled.

This packet supersedes the execution order and assignments in the September 10 Codex 24-hour mailbox plan and the September 9 coding-coordination plan. It incorporates subsequent mailbox corrections, the governed Notes workspace proposal, retrieval rev4, and the Graphiti assessment. Immutable mailbox artifacts remain historical evidence. This revision sets no invented deadline or claim of agent availability.

## Read and use this packet

- [Evidence and decisions](EVIDENCE-AND-DECISIONS.md): what is established, contradicted, inferred or still unverified.
- [Shared operation-lifecycle contract](OPERATION-LIFECYCLE.md): the R1/R2 boundary and required freeze receipt.
- [Claimable work packages](WORK-PACKAGES.md): scope, file boundaries, dependencies and acceptance checks.
- [Future product and Engine tracks](FUTURE-TRACKS.md): native retrieval, Notes parity, temporal history and optional Graphiti.
- [Snapshot](SNAPSHOT.json): sanitized repository and mailbox identifiers used for this review.
- [SHA256SUMS](SHA256SUMS): file identity for comparing the repository packet with its local copy.

The source baseline is main commit `b0c7ee2845f24c53586c5bc6feaa9ae28fbff50b`, Kosmos 0.8.3, with Engine dependency pinned to `650eab4a6752227cae336d7556a57826c22a0d5a`. The publication branch already includes documentation commits `b3acd1c` and `3146fb5`; neither fixes the runtime. Check the actual checkout SHA before inspecting code: the root checkout and some review worktrees are older than this baseline.

## Execution order

1. Correct and freeze the **Q1 normative oracle** first: retain cacheable `server/discover`, include `resources/read` in the six-method expectation, and reject a valid modern `ping` with `-32601`. The previous five-method expectation is withdrawn. Full Q1 execution follows integration.
2. Complete **R0 as a hard identity lock**: process/lifetime, loaded Kosmos build, plugin artifacts, endpoint, Hermes client/SDK and patch. R1/R2 workers may prepare reproductions, instrumentation and contract design concurrently, but no behavioral fix may merge until R0 identifies the actual target. Assigning missing evidence does not close R0.
3. Freeze **L0**, the [shared operation-lifecycle contract](OPERATION-LIFECYCLE.md), with one contract owner and both R1/R2 implementers reviewing it. This removes the circular dependency between their packages. Logical timeout never proves physical cancellation.
4. Implement **R1/R2 as one coordinated reliability boundary** with separate file owners. Integrate only against the locked target and frozen contract. Q1 source changes share R2's single writer; Q1/Q2 fixture preparation can proceed in parallel.
5. Finish adversarial provider/server qualification, Q1/Q2 and repository checks. Build and freeze **one candidate identity**: source, dependencies, build environment, artifact hashes, installation and client identities. Install/reload that exact candidate and prove it is loaded. A code, artifact or load-bearing client change creates a new candidate and invalidates the affected qualification; never patch between synthetic checks and the live gate while retaining the old pass.
6. Run **R3** through actual Hermes → Kosmos: discovery/list/search/allowed read/denial/traversal, cold and warm builds, indexing observations, and safe synthetic stall/recovery using the same candidate bytes. Close the release blocker only with all required evidence.
7. After R3 and release sign-off, advance native governed retrieval, then authoritative temporal history, then optional Graphiti qualification/promotion. Notes/governance interface design and Graphiti research may continue earlier; their implementation must not alter the release-critical provider or enter its dependency chain. E1 diagnosis, M1 and B1 remain independent opportunities. G1 readiness research/tests can proceed, with product integration deferred until the blocker closes.

With three available workers, start R0, provider reproductions, and server reproductions; one of the latter owns the short L0 draft. Additional workers can prepare Q1/Q2 evidence, E1 diagnosis or future interface design. R1/R2 implementation follows L0 freeze, and all behavioral merges follow R0. With one worker: correct Q1 expectations → R0 → L0 → R1/R2 → Q1/Q2 qualification → candidate freeze → R3. Any qualified agent may claim a free package; estimates and availability do not waive gates.

## How any agent claims and delivers work

Read the current mailbox directly and verify recent message bytes, corrections and active claims. Use this repository's canonical `.coordination/v1` mailbox; Engine-Rust has a separate root and separate sequence counters. Follow the existing protocol rather than inventing a second registry or changing peer identities.

Publish a work proposal/claim under your own identity containing package ID, baseline SHA, intended branch/worktree, exact files, dependencies, deliverable, intended reviewer and next reporting point. An ACK of receipt is not acceptance of a task. A package in this document is an opportunity, not a claim on behalf of an absent agent.

Historical reservations are Claude's server dispatch seam and Codex's provider seam. A new contributor may immediately prepare isolated reproductions, tests and design notes. Before editing the reserved shared files, obtain an explicit handoff or an allocation from the coordinating agent/owner; never assume silence relinquishes a claim. For otherwise unclaimed work, verify no conflicting claim before starting. Escalate competing claims to Codex as the designated coding coordinator, with Jeffrey's allocation evidence and the owner's direction where needed; keep useful nonconflicting work moving.

Use one isolated worktree per implementation package from the current verified base and a `codex/` branch when Codex creates it. Do not operate in the stale mailbox checkout or stage the whole workspace. One integrator owns each shared file at a time, including shared test files and generated artifacts. Agree on new module interfaces before dependent implementation; hand off a patch/commit rather than co-editing the same file. Rebase and rerun affected checks when the integrated base changes.

Deliver a commit or patch, changed-file list, exact commands and results, failing-before/passing-after evidence where relevant, unresolved limitations, and artifact digests. Publish immutable evidence under your own mailbox artifact path and append the result message. Have another agent review the acceptance criteria before calling the package complete. A reviewer can be any qualified available peer who did not author the evidence being independently checked.

Manual mailbox checks occur before claiming, before integration and before delivery, with bounded checks during active work. This plan does not enable or alter anyone's timers. Preserve historical malformed messages and fork evidence; corrections are appends.

## Release exit criteria

- R0 locks the actual Kosmos target before behavioral merges and distinguishes the Engine surface; the candidate receipt later proves the exact installed/loaded package and Hermes client. Missing identity evidence leaves the gate open.
- L0 records concrete budgets, epochs, finalization owners and typed error mapping, accepted before R1/R2 behavioral implementation.
- R1/R2 demonstrate bounded failure, exactly-once accounting cleanup, bounded unresolved underlying work, recovery and no stale unauthorized publication.
- Q1 independently confirms all six cacheable complete-result methods, including retained `server/discover`, and modern `ping` rejection, while preserving validation-first error behavior.
- Q2 supplies the corrected narrow lockfile mutation evidence; existing valid audit evidence is retained.
- The combined candidate passes `npm run verify` on a supported runtime. Run the repository's applicable browser/renderer checks when the shared read helper or viewer behavior changes. Do not label a skipped required check as passing.
- R3 completes discovery, list, search, allowed UID read, restricted denial and observed traversal on the same identified Kosmos runtime, including a cold build and recovery after an injected stall in a safe test environment.
- Synthetic and Hermes results bind to one frozen candidate and client identity; mutations require a new receipt and affected checks again. Release/build provenance and rollback receipts are recorded. No blanket merge or closure of older PRs is part of release sign-off.

This publication changes plans only. It does not restart services, repair live vault identities, deploy Graphiti, change dependency pins, or claim implementation checks have passed.
