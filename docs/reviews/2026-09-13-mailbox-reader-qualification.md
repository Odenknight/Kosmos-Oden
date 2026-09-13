# Mailbox reader qualification

The read-only `scripts/audit-mailbox.mjs ROOT RECIPIENT` selects an explicit
recipient ACK directory and hashes exact message bytes. Its output is an audit,
not work acceptance. Every ACK keeps `completionVerified: false`.

The current eleven synthetic tests cover:

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

Direct file references now verify raw SHA-256 bytes under the repository root,
reject absolute/traversing paths and symbolic links, and distinguish changed
contract-defined mutable files as superseded references. Missing files and files
above the 64 MiB per-reference budget remain unverified findings. Mailbox-relative bundle manifests now check member hashes, duplicates and path
confinement, bounded to 1,000 entries and 64 MiB in total. Historical references
without a digest of the manifest remain `reference-manifest-unbound` even when
all members match. Remote-host references remain unresolved; the reader never
substitutes a same-named local file.

Optional `RETAINED_HEADS_JSON` is a caller-retained array of
`{sender, sequence, sha256}` records. The CLI checks those original raw-byte heads
without advancing or rewriting them. Missing or changed retained messages produce
findings; omitting the file cannot prove suffix-loss detection. A valid head also
does not clear other chain or schema findings.

`schemaFindings` now reports required fields, version, identity, recipient lists,
time syntax, kinds, payload/reference list shapes and ACK fields. Non-coordinator
ASSIGNMENT records are flagged. Schema findings also make the CLI fail; minimal
integrity fixtures are not certified as complete protocol records.

Calendar validation rejects impossible dates, 24-hour rollover and invalid offsets;
ACK outputs use the same reference validation as message artifacts. Output hash
verification never changes `completionVerified` to true.

Remaining M1 checks include exhaustive field constraints, immutable manifest binding, the protocol's exact legacy
ACK exception, and evidence-based reconciliation of mutable status/card summaries.
The reader does not send ACKs, quarantine files, rewrite history or update peer
cards. Those operations cannot be inferred from a successful read-only audit.

## Exact historical outputs exception

The Protocol 1.2.0 source was relocated and verified (SHA-256
`320b514203db63b537f2451111d083ac7e0f6351461ece84148d7ed7cdab661a`).
Its four pre-1.2 ACKs are recognized by exact raw SHA-256, with only a missing
`outputs` field interpreted as an empty array. Other schema and integrity checks
remain in force, and `completionVerified` remains false. The audit exposes
`legacyOutputs` for this interpretation; source bytes are never rewritten.

All nine reader tests pass. A read-only scan of the original protocol mailbox
recognized both historical ACKs for the selected recipient. This is not a clean
mailbox or full M1 claim. Exhaustive field constraints, manifest binding and
status/card reconciliation remain open. The historical-exception item above is
superseded only for the explicitly permitted missing-outputs field.

Envelope reads are now capped at 65,537 bytes before parsing: 64 KiB is admitted,
and the extra byte establishes an oversize finding without reading the whole
file. Ten focused tests pass, including both exact boundary cases. The protocol's
generated `BOARD.md` is classified as mutable; preserved protocol versions and
similarly named artifact files still require their immutable hashes. These checks
do not establish protection against hostile concurrent directory replacement.

The standalone bundle verifier also accepts an explicit third argument containing
the expected raw manifest SHA-256. It checks that digest before interpreting
members, then verifies each member normally. Matching members cannot compensate
for a manifest mismatch. Focused tests cover a bound valid bundle, incorrect or
malformed manifest digest, and a changed member under an unchanged manifest.
The mailbox CLI does not synthesize this argument from current files; historical
unbound references remain unbound. This helper capability is not a protocol
extension or automatic manifest-authentication claim.

Envelope decoding now rejects malformed UTF-8 before JSON parsing instead of
silently replacing corrupt bytes. Eleven focused tests pass, including malformed
message and ACK text, overlong encodings, encoded surrogates and truncated
multibyte sequences. Delivered files remain byte-identical. A valid literal
replacement character and an optional leading UTF-8 BOM remain accepted, with
the BOM included in the raw-byte digest. This closes a decoding defect; full
M1 qualification and the outstanding reconciliation checks remain open.

Sender directory aliases now produce an explicit confinement finding instead of disappearing from enumeration. Published JSON aliases also reach the existing confined reader and are rejected. A real Windows directory-junction fixture verifies exclusion plus the finding; all 14 focused tests pass. This does not prove protection against every concurrent directory replacement or close M1.

