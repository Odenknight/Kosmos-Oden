# Post-J2 read-path evidence — paged read over the meridian-public-v2 fixture

Generated 2026-09-22T15:16Z by JEFFREY. Run against the **post-J2 build**, locally, over the
fixture corpus. No protected bodies appear in this file or in any evidence artifact below —
digests, lengths and page metadata only.

## What this answers

| Question | Answer |
| --- | --- |
| Does continuation live under `page.next_cursor` with **no** top-level cursor? | Yes. `top_level_next_cursor_present: false`, `top_level_cursor_present: false`; `page` keys are exactly `[has_more, limit, next_cursor, snapshot_id]`. |
| Does a >16 KiB record read to its terminal page and reassemble byte-exact? | Yes — 40 960 B across 3 pages at `limit_bytes=16384`, 5 pages at 8192, digest-exact. |
| Is `limit_bytes` a page budget rather than a read wall? | Yes. 16385 B reads in 2 pages (16384 + 1); 40960 B reads in 3. |
| Exact page multiple — no spurious second page? | Yes. 16384 B ends on page 1 with `has_more=false` and no cursor. |
| UTF-8 boundaries? | Yes, and they shorten a page: at `limit_bytes=16384` page 1 returned **16 383** bytes; at 8192, page 2 returned **8 191**. |

## Pins — what actually ran

| Component | Value |
| --- | --- |
| Observatory | `adc7e15d3d34dffb6f7259b94998f5e929e312b9` (branch `codex/j2-result-error-taxonomy-20260922`), tree clean |
| Observatory `server/demo-gateway.mjs` | sha256 `95eb84daae3d12d0554e4bbc3ee8d300609c795bac3c72dad5158080e07a8b74` |
| Engine | `613409c5c982a20e4011f88ab6efcdf399940f0b` (branch `codex/j2-graphiti-lexical-validation-20260922`), tree clean |
| Engine `src/service/mcp.ts` | sha256 `9359d363a503fd7458090a29e53c3ed8504b2eb18a7b92b983b4951c39d03dc6` |
| Engine build the gateway worker loaded | `dist/service-node.mjs` sha256 `1e111229f67e281c3b866870dbafc903f022116cc03451e505e438d221439176` — verified to contain the J2 resolver (`tool === SERVICE_MCP_GRAPHITI_TOOL.name ? SERVICE_MCP_GRAPHITI_TOOL : SERVICE_MCP_TOOLS.find(...)`) |
| Corpus | `postj2-corpus` = fixture `notes/` (153 records) + generated `SHA256SUMS` sha256 `bb56d573ffb4ad42884b5b84ba2a0ab57a41b053a1c9953fc2e499ad48d468ce` |
| Gateway status pin | `corpus_digest 307cd073358a65d60ef2daea0de661f5d8231bbfae7e7f3f5c82fd7901537e02`, `note_count 153`, `retrieval_note_count 153`, `retrieval_rejected_count 0` |
| Engine corpus manifest digest (composed from the fixture) | `7b399e106eaefd86008dc1ac898baae7be399ad99dc39365b97df4246277da10` |
| Fixture `MANIFEST.json` file digest | `9d457271c7bded5e1d531e4cce088db0f800cdf2a5373a72cc7f95d398943ec7` — declares `note_count 153`, and the tree holds 153 records, matching independently |
| Protocol | initialize → 200, `2025-11-25`; session DELETE → 204 |
| Call accounting | 29 tool calls, 29 receipts, 0 retries, 0 rate-limited, 0 errors |

## Method

`serve-fixture.mjs` boots `createDemoGateway` from the post-J2 Observatory tree with
`engineRoot` = post-J2 Engine and `corpusRoot` = the fixture corpus (the gateway requires a
`SHA256SUMS` note manifest at that root). `postj2_fixture_read.py` enrolls a `public`-clearance
participant via the operator API, opens **one** MCP session (the gateway admits one session per
participant: a second `initialize` returns 409 `already_connected`), then for each target
resolves the canonical path with `gkos_record_resolve` and pages it with the shared corrected
helper `readall.read_all` — the J1 deliverable — at `limit_bytes` 16384 and 8192.

The helper enforces, per page, in code: `has_more` is a boolean; `has_more` implies a cursor and
a terminal page carries none; `offset_bytes` equals accumulated byte length; `returned_bytes`
equals the UTF-8 length of the content; terminal `offset + returned == total_bytes`; snapshot,
`source_digest`, `auth_epoch` and `authority_generation` bindings hold constant; repeated cursors
and no-progress pages are refused; and completion requires the reassembled length **and** SHA-256
to match. A `complete` status therefore means all of that, not merely "the loop ended".

## Results — 8/8, reproduced twice

| Record | Bytes | limit 16384 | limit 8192 |
| --- | --- | --- | --- |
| `Public/Fixtures/Large-runbook-40k.md` | 40 960 | 3 pages, digest-exact | 5 pages, digest-exact |
| `Public/Fixtures/Exact-16385.md` | 16 385 | 2 pages (16384 + 1) | 3 pages |
| `Public/Fixtures/Exact-16384.md` | 16 384 | 1 page, terminal | 2 pages |
| `Public/Fixtures/Multibyte-boundary.md` | 16 522 | 2 pages, first 16 383 | 3 pages, middle 8 191 |

Every read: `status=complete`, reassembled SHA-256 equal to the file's own SHA-256, assembled
length equal to `total_bytes`, and equal to the digest the engine declares in `source_digest`
(`citation_digest_agreement: true`) — two independent digests agreeing per record. Cursor chaining
verified per page (`cursor_out` of page N equals `cursor_in` of page N+1; terminal page has none).
Each read kept a stable per-record `snapshot_id` with `auth_epoch 1` / `authority_generation 1`.
Sessions released with 204 on both runs.

## Limits of this evidence

- The corpus is the **synthetic fixture** (153 records, fictional station), not the deployed owner
  corpus. It exercises the read path's boundary behaviour on post-J2 code; it does not re-verify
  the 18 previously-unverified owner-corpus contents.
- The endpoint is a local gateway on `127.0.0.1:8791`; no deployed surface was probed. The
  deployed public demo was returning 503/200 intermittently during this session, so any live
  probe taken in that window would be unreliable.
- Elevated-clearance behaviour (secret ceiling, cross-clearance refusal) was not in scope here;
  only one `public`-clearance participant read public records. A `secret`-clearance participant
  was enrolled but not used.
- Two useful invariants are not demonstrable against a compliant server and remain covered by the
  helper's offline checks: repeated-cursor refusal, and changed-digest detection across pages.

## Artifacts

| File | sha256 |
| --- | --- |
| `postj2-fixture-evidence.json` (full run evidence) | `97e5961b96209c7addbb4083a811bef9660f091bc3fd8cc315101879d21c0921` |
| `envelope-shape.json` (raw envelope field evidence) | `8ef0241dd5cbcd297a01918e852f6151e937734fcb3b4f0b923ecb6cc0c12f5b` |
| `serve-fixture.mjs` (post-J2 local boot) | `bb91434fb6626ddef932e4a3b6cfacbd2ebfc0005d9baed04de3aa391f795217` |
| `postj2_fixture_read.py` (run driver) | `3848efa4aa18f968eeb7afae7d3564aa27041fee620965e86c80cbe87203841a` |
| `envelope_shape_probe.py` (envelope probe) | `1e2db390ac165ed650ae7fa6c04d66c8d9fe200640c1b1dbe19ab7eab29966e8` |

Paths are under `/home/hermes/work/gkos-obs/postj2-read-run/`. Re-run:
`node serve-fixture.mjs` (env: `FIXTURE_CORPUS`, `DEMO_ENGINE_ROOT`, `PORT`) then
`python3 postj2_fixture_read.py <handlePath printed at boot>`.