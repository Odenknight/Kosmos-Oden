# Mailbox reader qualification

The read-only `scripts/audit-mailbox.mjs ROOT RECIPIENT` selects an explicit
recipient ACK directory and hashes exact message bytes. Its output is an audit,
not work acceptance. Every ACK keeps `completionVerified: false`.

The current three synthetic tests cover:

- Multiple recipients, raw-byte hashes, inverted roles, missing completion evidence,
  malformed delivered JSON, and invalid recipient path input.
- Identical-byte duplicate delivery, reused sender sequences, parent hash mismatch,
  different-byte message-ID conflicts, ambiguous ACK targets, forked parents and
  reused ACK ordinals. A conflicting ID never selects an arbitrary target.
- Interrupted `.tmp-` files remain untouched and are not delivered records;
  malformed published files still produce findings.

Run `node --test test/mailbox-audit.test.mjs` from the repository root.
The focused suite passes. This does not establish full protocol conformance.

Corrections append new records; they do not make invalid historical hashes valid.
Preserve original records and report a sender correction separately from the chain
finding. Do not infer a unique chain head from filename order or timestamps.
Naming a correction or marking an ACK COMPLETED is not evidence of product work.

Remaining M1 checks include complete schema validation, cited artifact digests and
path confinement, retained-head/suffix-loss detection, the protocol's exact legacy
ACK exception, and evidence-based reconciliation of mutable status/card summaries.
The reader does not send ACKs, quarantine files, rewrite history or update peer
cards. Those operations cannot be inferred from a successful read-only audit.
