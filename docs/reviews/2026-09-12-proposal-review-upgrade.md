# Proposal review upgrade

Preserves the useful proposal/decision portion of PR 41 at
`65e9354f220b19a16c67504ff228e58caf8128ca`, without downgrading the current
renderer, protocol, dependency or reliability implementation.

Proposals remain pending records under `.gkx/proposals`. Explicit reviewed
decisions are separate records under `.gkx/decisions`; neither confidence nor
connectivity accepts them automatically. Accepted decisions bind the exact plan
and reviewed value. The existing source writer still requires the human review
acknowledgements, original-content comparison, backup and guarded host process.

Additional defects corrected during integration:

- A batch action could include selected candidates hidden by a later filter.
  Preview and acceptance now operate on the same visible candidate set.
- Building an apply preview could omit required saved proposal records. The
  action now explicitly saves proposals before opening the change preview.
- Check-then-rename could replace a concurrently created immutable record.
  Desktop audit storage uses exclusive temporary creation, file flush and
  hard-link publication that fails if the destination exists. Publication never
  overwrites an existing record. Per-attempt temporary names avoid shared cleanup.
- Audit paths reject traversal and existing junction/symlink escapes; target
  paths reject Windows alternate-stream and other portability hazards.
- Persistence and decision creation validate the complete canonical proposal,
  rather than treating a recomputed hash as proof of a valid schema.
- Explicit proposal save errors are surfaced instead of becoming unhandled
  rejections.

This audit store is desktop-only and is **not** a qualified durable MOC host.
It does not claim directory-flush/power-loss durability, hostile concurrent
filesystem-administration protection, or automated agent-note write authority.
Unsupported host publication fails before source apply. Mobile/native governed
write qualification remains separate. Existing JSONL proposal queues are left
untouched; records from new runs use the new immutable sidecars. Notes without
a target UID are reported as skipped for this proposal workflow, without adding
or rewriting UIDs. Read-only MCP path selectors remain available.

Validation: `npm run verify` passed **398 tests** and all build/type/version/
lockfile/artifact/invariant/provenance checks. Eighteen focused tests exercise
proposal integrity, decisions before source apply, rejected/missing authority,
collisions, retry behavior, filtered selection and real Windows hard-link and
junction behavior. Synthetic test directories are removed after execution.
No live source-note editing or Graphiti ingestion was performed for this upgrade.
