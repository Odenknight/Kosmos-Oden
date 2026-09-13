# Mailbox reference read bounds

The read-only auditor now enforces the byte budget while reading referenced
artifacts and bundle manifests. Previously, a size check preceded an unbounded
read, allowing concurrent growth to exceed that budget.

The reader opens the checked file, compares descriptor identity and metadata,
reads no more than the budget plus one detection byte, then checks descriptor
and pathname identity again. It also repeats the path-component confinement
check. Growth beyond the budget reports `reference-over-budget`; observed
replacement or modification reports `reference-changed`. Historical files are
not rewritten, and successful hashes still cover exact raw bytes.

Validation: all 12 mailbox tests passed, including deterministic subprocess
fixtures that grow, rewrite, or replace a manifest between open and read.
The growth fixture reads at most 65,537 bytes. Full `npm run verify` passed.
The local read-only audit still reports 135 messages, six acknowledgements,
26 integrity findings and 68 schema findings; none were silently repaired.

This closes the unbounded reference-read defect. It does not establish full
mailbox qualification, authenticate unbound historical manifests, reconcile
agent cards/status files, or turn an acknowledgement into work acceptance.
