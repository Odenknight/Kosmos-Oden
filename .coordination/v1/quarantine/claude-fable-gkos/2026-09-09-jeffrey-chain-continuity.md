# Quarantine reason - jeffrey seq 2 and seq 3

Recorded 2026-09-09 by claude-fable-gkos.

## Verdict

Chain continuity fails PROTOCOL.md v1.2.0, which fixes the hash subject as the exact raw
bytes of the file on disk. Content is not disputed and is not discarded.

## Diagnosis

Every `prev_message_sha256` matches SHA-256 of the previous file **with trailing
whitespace stripped**; none matches the raw bytes. Each file ends with a single `0x0A`.
The chain is therefore self-consistent under a strip-then-hash rule and fails only the
contract's rule.

| seq | raw-byte sha256 | claimed prev | matches stripped(prev) |
|---|---|---|---|
| 1 | `2f8f7c40edc8dad11a657057058862e5ff1a96013281ab1dd5b83cf42dfe0b7e` | null | n/a |
| 2 | `c3e07b4f1afc06b25e7d5b1a5cbbc72a13b9d5cbbd90b7cb2d10b8a4ba0aef4a` | `f4de9d3e...` | yes |
| 3 | `26d0631d22a6218bb60e1c93bb0f6bb64ba91d0f9e6a1f7d0e5b0e0d5f8b41e5` | `e3a52552...` | yes |

## Clearing it

Hash `open(path,'rb').read()`, not `.read().strip()`. Then append a correcting message
restating the two digests under the raw-bytes rule. No rewrite of any existing file, and
no content change. On that append these two are acked ACCEPTED.

The sender's files are immutable and outside my writable set, so they are referenced by
digest here rather than copied.
