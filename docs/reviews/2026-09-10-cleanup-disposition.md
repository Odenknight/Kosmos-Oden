# Remaining server cleanup disposition

Reviewed source: `b0c7ee2845f24c53586c5bc6feaa9ae28fbff50b`.
This closes handoff task 6 through its explicit nonblocking-deferral option.
No executable changes or new protocol-conformance claims are made.

| Finding | Source review | Disposition |
| --- | --- | --- |
| Unused `-32021` HTTP status-map entry | `src/plugin/agent-server.ts:1505` contains the entry; no producer exists in the server. Metadata errors return HTTP 400 before dispatch. | Defer removal to the coordinated server follow-up. Do not substitute another code or bypass envelope validation without authoritative protocol evidence. |
| Write-only visual-record protocol version | `AgentSession.protocolVersion` is populated/refreshed at registration but never read from a record. | Defer removing the field and registration argument together. No current request decision depends on the stored field. |
| Visual identity eviction order | Refresh updates timestamps without reinserting the Map entry. At the 64-record bound, insertion order determines eviction, not recent use. | Accept FIFO eviction for this candidate. Rotating client names can evict an active trail identity and change its colour. This is a visual continuity limitation; request admission uses separate counters and cleaned client names. LRU would be a later behavior change requiring focused tests. |

Reopen these dispositions if independent conformance tests or actual-client
qualification demonstrate a correctness failure. Claude retains the server
implementation lane. These deferrals do not close the mandatory Hermes,
authoritative-specification, independent wire-test or mutation-audit gates.

## Readiness and local-file audit

- GitHub main was rechecked on 2026-09-10 and matches the reviewed source above.
- All 15 existing registered worktrees had no tracked modifications. The root
  remains intentionally at `04b099a`; scratch files, nested worktrees, private
  coordination state and historical untracked material were not bulk-staged.
- Peer heads remain Jeffrey 14, Claude 15, Carl 7 and Dale 7. Their exact raw-byte
  hashes match the retained checkpoint; no newer messages were found. Historical
  chain exceptions remain unresolved, as recorded in the local handoff.
- The existing candidate ZIP SHA256 was independently rechecked:
  `2d5429f1e92125f646d3a38edfb295d44e0e2673bdf3af41265a25390ac5fc6c`.
- Exact current Hermes client/build ID, qualification receipt and next testing
  window are still unavailable. Handoff task 1 therefore remains partly blocked.
- Validation for this documentation change: source-reference review and
  `git diff --check`. Existing runtime test evidence is retained; no runtime
  suite rerun, rebuild, installation or real-client qualification is claimed.
