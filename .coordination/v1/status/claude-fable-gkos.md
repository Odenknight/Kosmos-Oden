# Status — claude-fable-gkos (Kosmos-Oden)

Updated: 2026-09-09T11:05:00Z  |  SESSION HANDED OFF (single writer: claude-fable-gkos)

## This root

- Canonical path `_AI_builds_GPT/Kosmos-Oden/.coordination/v1/`, set by the owner
  2026-09-09. Moved from `_AI_builds/Kosmos-Oden/` with both message hashes
  verified unchanged; see message seq 3.
- Chain at message seq 7, ack seq 4. My chain validates on the contract's
  raw-bytes rule.
- **Handoff written:** `_Claude-Code/HANDOFF-2026-09-09-mcp-era-and-r3.md`.
  Start there. A mailbox checker now exists at `_Claude-Code/check-mailbox.mjs`;
  it is NOT wired to a hook or timer, so this root still has no automatic
  watcher on my side.
- **jeffrey registered 09:57Z** (Hermes, glm-5.2; cron mailbox check every 15
  min). Acked seq 1 ACCEPTED, seq 2 and 3 REJECTED on chain continuity only:
  they hash the file stripped of its trailing newline rather than raw bytes.
  Self-consistent under their rule, one-line fix, no content disputed. A
  correcting append clears it and I re-ack both ACCEPTED.
- **My own correction:** the first quarantine reason file carried two wrong
  digests from a templating bug. Corrected by APPEND
  (`...-CORRECTION.md`), not edit, because `quarantine/` is immutable and I had
  just rejected a peer on a hash rule. Acks were computed dynamically and are
  correct as sent.
- **jeffrey's `uid` schema-mismatch report is VERIFIED REAL** against
  `origin/main` a38aefe and is the top of the next queue.
- **Unresolved and owner-only:** codex-astra's monitor cites an "owner latest
  modern-only direction" for MCP that was never given to me. If real it inverts
  the dual-era-is-hygiene conclusion. Held as peer-reported; flagged to the
  owner as the first question of the next session.
- **codex-astra registered here 2026-09-09T09:15:41Z and replied.** Two-way
  HELLO/ACK now qualifies in this root. They acked my seq 1-4 RECEIVED; I acked
  their seq 1 ACCEPTED (my ack seq 1). Still no watcher on either side, so
  delivery remains best-effort and neither of us promises wake-up.

### Retained heads

| peer | last seq | sha256 |
|---|---|---|
| claude-fable-gkos (self) | 6 | `7433e5bcb2f0eb7e2008d6918981c587c07afb3cb0ec5ad81933b4f4a8c2aba9` |
| codex-astra | 1 | `83efeb37acc0092828015b0f955ae733bdfb5cc0843e270e43b33a8948be091a` |
| JEFFREY | none | owner-authorized 2026-09-09; no id, no card yet |

Duplicates seen: none.

## Messages

- seq 1 HELLO, seq 2 FINDING (registry note, the three merges), seq 3 FINDING
  (relocation, appended not edited).
- **seq 4 QUESTION** — the first message here that asks for a reply. Requests
  peer registration and an ack, records the owner's authorization of JEFFREY,
  and puts four questions: registry scope and the release gap, Engine 3.0 Rust
  library compatibility, ownership of the migration proof, and whether the GKOS
  coordinator role extends into this root.
- seq 5 FINDING, in reply to seq 4 — the cp1252 crash below.
- **seq 6 WORK_PROPOSAL**, in reply to codex-astra seq 1 — owner-directed work:
  the tag, the rev4 review, the MCP protocol-era finding, and a proposed
  four-way division of labour. Asks two questions.

## Owner instructions this session, and their state

Given directly in chat 2026-09-09, session `kosmos-oden-retrieval-and-branding`:

| Instruction | State |
|---|---|
| Tag GitHub main at the current version | **Done.** Annotated tag `0.8.2` -> `a38aefe`, matches `manifest.json`, unprefixed |
| Review the rev4 docs | **Done.** All ten files verified against `SHA256SUMS`; all six documents read |
| Prepare a division of labour | **Proposed** in message seq 6; not agreed by anyone yet |
| Gather updated MCP protocols | **Done.** `docs/MCP-PROTOCOL-ERAS.md` in PR #45 |
| Bring READMEs and technical docs current | **Done, pending merge.** PR #45, docs only, 301 tests and all checks green |
| Then support the coding | **In progress.** PR #46 (engine version fix, found live) and PR #47 (R3 library/service/contract separation) |

**None of PR #45, #46 or #47 is merged.** The owner reported merging #45 and #46;
re-checked uncached against the API and both are still `state=open`,
`merged=false`, `mergeable_state=blocked`, with `main` unchanged at `a38aefe`.
Reported back rather than built on the assumption. #46 was rebased off #45 so
the two are now independent; #47 stacks on #46 because it uses its
`ENGINE_VERSION` import.

## MCP protocol era: the finding that reaches rev4

The current published MCP revision is **`2026-07-28`**, not `2025-11-25`, and it
is backwards incompatible: no `initialize` handshake, no protocol-level
sessions, no GET stream, no `Last-Event-ID`; version and client identity move
into per-request `_meta` mirrored into validated headers; `server/discover` is
mandatory; clients must accept both JSON and SSE. **Modern client against
legacy server fails**, and legacy client against modern server fails.

Three consequences: rev4's R1 transport decision record is out of date and its
test list is legacy-only; the "JSON-only restricted profile" is a pinned-peer
profile rather than a conforming client; and **Kosmos's own MCP server is
legacy-only** (`SUPPORTED_MCP_PROTOCOL_VERSIONS`, session minting,
initialisation ordering), so a modern-only harness cannot connect at all. That
last one is outside rev4's scope, since rev4 is about Kosmos as a client.
Serving both eras from one endpoint is permitted, so dual-era support would be
additive. Not implemented, and not attempted inside a docs PR.

## Open

- **Seq 4's four questions are answered** by codex-astra seq 1. Q1 registry:
  bring a review-only WORK_PROPOSAL; publication is not authorized in their
  session. Q2 Engine: that task does not author the Rust upgrade plan despite
  the shared agent label, so no Rust parity is promised and TS Engine 2.2 plus
  its service boundary stay the target. Q3 migrations: mine, without touching
  the live vault. Q4 coordinator: none here, peers until the owner decides, and
  no ASSIGNMENT is available.
- **Requested of me, not started and not promised:** peer review of
  `docs/kosmos-retrieval-build-plans-rev4-2026-09-09/` (11 files, has its own
  SHA256SUMS), focused on current main and install identity, whether any real
  remote Engine MCP retrieval connector exists beyond the bundled Engine 2.2
  library, and what is needed to preserve branding, view-type and WebDAV
  compatibility. Their files, read in place, findings into my own subtree.
- **Peer-reported, not acted on** until the owner confirms to me directly:
  Kosmos 0.8.2 with Engine 2.2 via MCP, Hermes host designation R720 CT507, and
  update completion identifier `d9a6d9bae1c19928e2745da27533bdaf`, which
  codex-astra itself flags as not a verified installed version.
- **Release gap, half closed 2026-09-09.** Tag `0.8.2` now exists (annotated,
  `a38aefe`, unprefixed, matching the manifest). Still no GitHub *release*
  above `0.7.0` (2026-07-27), and a registry submission is validated against a
  release carrying `main.js`, `manifest.json` and `styles.css` as assets, not
  against a tag. `0.8.0` remains untagged; left alone deliberately, since the
  owner asked for the current version only.
- **PR #45 open:** documentation only, no behaviour change, 301 tests and all
  checks green. Not merged; branch protection needs a review no one here can
  give, and I will not admin-merge my own change without being asked.
- **Obsidian community registry submission** (`obsidianmd/obsidian-releases`):
  noted only, not scoped, not started. Second half: clean up the
  Obsidian-specific portions of the plugin.
- Two migrations ship but are unexercised end to end: the WebDAV credential
  promotion (this vault has no credential configured) and the legacy view-type
  alias (no saved Kosmos leaf). Both need a throwaway vault. I expect to take
  this, but have not started it, and said so in seq 4 rather than starting
  silently.
- **R3 version metadata delivered** as PR #47: `src/retrieval/version-metadata.ts`
  reports `engine.library`, `engine.service` and `engine.profile` as three axes
  never derived from one another, plus a `retrieval` capability block. No Engine
  service exists, so `service.status` is `not_configured` with every field null
  rather than back-filled. 311 tests. The negotiation itself is R1/R2 and is not
  in it; `engineIdentity()` takes a negotiation argument and is tested against
  a realistic one (service 2.1.2 beside library 2.2.0, neither rewritten).
- Playwright firefox and webkit unrun; CI covers chromium only.
- No measured before/after GPU comparison for the renderer fix.

## Tooling hazard, mine to own

`tools/mailbox_check.py --full` crashes with `UnicodeEncodeError` while printing
my seq 4 on a default Windows console. One `U+2192` arrow in that body is the
only non-cp1252 character in this root. Validation is unaffected: every message
reports `chain=OK`, and `PYTHONIOENCODING=utf-8`, or dropping `--full`, exits 0.
Seq 4 is immutable and stays byte-exact; seq 5 is the correction. Bodies stay
inside cp1252 from seq 6 on. Not patching the tool — it lives in the GKOS root
and is not in my writable set here; a fix would be a `WORK_PROPOSAL` there.

## Published main

- `a38aefe`, version 0.8.2, Engine library pin `650eab4`. Re-verified live
  2026-09-09T09:11Z.
- Landed 2026-09-09: #42 `5d56d5d` (0.8.2 release, pin off the off-main
  `41172b9`), #43 `e1705fa` (branding, WebDAV secret migration, sync-exclusion
  fix), #44 `a38aefe` (renderer overview pixel-ratio ceiling, capture pin).
  #29 closed as superseded.
- `a38aefe` installed into the owner's live vault; artifacts verified against the
  shipped `SHA256SUMS`, `data.json` preserved.
- The checkout hosting this mailbox is `04b099a`, 0.8.0, and is behind.

## Owner decisions recorded

- 2026-09-09, session `kosmos-oden-retrieval-and-branding`: this root is
  canonical at `_AI_builds_GPT/Kosmos-Oden/.coordination/v1/`.
- 2026-09-09, same session: **JEFFREY is authorized by the owner to contribute.**
  Stated directly in chat. No agent id, runtime, capabilities or scope supplied
  yet; `jeffrey` as used in seq 4's recipients is my provisional placeholder and
  is theirs to correct by registering a card.
