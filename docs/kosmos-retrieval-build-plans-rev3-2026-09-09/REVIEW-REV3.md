# Review of revision 2 and what changes in revision 3.1

Date: 2026-09-09. Reviewer basis: the four rev2 documents, the five supplied
inputs, the Kosmos and Engine repositories (fetched today), the deployed plugin
in the Obsidian vault on this host, the running listener, and two read-only MCP
probes. Nothing was changed: no configuration, no client, no repository, no
service. No secret values were read into any report.

Rev2 is structurally sound. Its security contract, its refusal to treat
adoption rows as wire equivalence, its area-mapping fixtures and its known-at
model all survive review. What changes is the ground it stands on: several
facts rev2 marked unknown or "reported" are now observed, and three of them
alter the build order.

## 1. Findings that change the plans

### F1. The deployed Engine service is on the 2.1.2 line, not the 0.8.2 candidate's Engine

An authorized identity for the Engine service already exists on this host
(Claude Desktop's `fac-local` MCP server). Using it, `initialize` at
`https://192.168.5.99/mcp` returned `serverInfo gkos-engine 2.1.2`, protocol
`2025-11-25`, and `gkos_capabilities` returned contract `1.0.0-draft.2`,
extension `observatory.mcp-content.v0`, ten capabilities all available.

The "2.1.2" literal is hard-coded in both the v2.1.2 tag commit and the frozen
oracle; every commit from 650eab4 onward reports `ENGINE_VERSION` 2.2.0. So the
live service is either the tag or the oracle, and it is not 650eab4. Between the
oracle and 650eab4, `src/service/mcp.ts` changed by 162 lines and the SQLite
retrieval store by 74. Consequence: R1 captures must be taken against the
deployed 2.1.2 service first and against 650eab4 second, as two ledgers. The
rev2 sentence "capture at the selected Engine SHA" was underspecified.

The matrix's "forbidden" probe is superseded, not contradicted: it used a
different identity. The remaining unknown is which 2.1.2 commit runs; only an
operator receipt from the 192.168.5.99 host can settle tag versus oracle.

### F2. Kosmos does not reach the Engine on loopback, and never did

The Engine service is a separate LAN host (192.168.5.99, TLS terminated by
Caddy). Kosmos runs inside Obsidian on 192.168.5.95 and currently has no Engine
client at all. The only client code, the standalone prototype on
`codex/retrieval-moc-next-update`, refuses any non-loopback URL. Rev2's R0
question "does the trusted Kosmos host reach Engine on loopback" is answered:
no. The bridge must be designed for LAN HTTPS with a trusted certificate from
day one. The current `fac-local` client disables TLS verification
(`NODE_TLS_REJECT_UNAUTHORIZED=0`); the bridge must not inherit that shortcut.

### F3. Kosmos mainline pins an off-main Engine commit

Kosmos `origin/main` (3aab1e3, version 0.8.0) depends on Engine `41172b9`.
That commit is on `integration/navigation-effects-reconciliation-20260827`,
is not an ancestor of Engine main, and does not descend from v2.1.2. The
supplied matrix had this as a claim to recompute; it is now verified and it is
the current mainline dependency, not a historical one. PR #42 (0.8.2, head
b35b27e, all checks green, does not touch `agent-server.ts`) moves the pin to
650eab4, which is on Engine main. Any R-series branch must be cut from main
after #42 or an equivalent lands; branching from today's main would build the
bridge against an Engine line that will never be released.

### F4. The deployed Kosmos plugin is 0.7.0 with a "public" default sensitivity on a LAN bind

Installed plugin: `kosmos-oden` 0.7.0, bundle built 2026-08-06, embedding
Engine library 2.0.1 (eight literal strings), eighteen tools, four protocol
versions. Non-secret settings: `agentBindMode=lan`, port 4816 (confirmed
listening on 0.0.0.0, owned by Obsidian), ceiling `internal`,
`defaultSensitivity=public`, token present. Unauthenticated initialize returns
401.

So the transcript's "Engine 2.0.1" was correct for the deployed bundle; the
Hermes review's "hard-coded string, not a probe" is also correct. Both are
true because two Engine coordinates exist: the library embedded in the plugin
and the service on the other host. Rev2 conflates them in places. Rev3
separates `engine_library_pin` from `engine_service_coordinate` everywhere.

The `public` default means an unlabeled note is readable by any holder of the
LAN bearer token up to the `internal` ceiling. That is a policy choice the
owner may have made deliberately for metadata search. It becomes materially
riskier once body search returns passage text. Rev3 adds a gate: the owner
confirms the default-sensitivity posture before body mode is enabled on a LAN
bind. No setting is changed by the plan.

### F5. A second Kosmos plugin is installed and outside every plan

`kosmos-moc-prototype` 0.1.1 (built 2026-09-08, embeds Engine 2.2.0,
desktop-only, references port 4815 and `createServer`, no vault write calls
found). It is not in the inventory of any input document. It can confound
acceptance runs (a second listener, a second identity, a second Engine version
string visible to agents). Rev3 adds it to R0 and requires it be disabled or
explicitly in scope during H1 and Q1 runs.

### F6. Two retrieval integration plans exist

PR #41 (`codex/engine-service-uplift-20260906`) ships `docs/plans` K0 to K6;
K3 is "Retrieval and selected query integration" using `gkos_search` with
service-issued references. That is rev2's R2 under another name. PR #41 is a
65,000-line change dominated by the Tauri standalone host and vendored glib.
Rev3 makes an explicit ownership decision: the R-series is the retrieval plan
of record; it branches from main plus #42, takes only #41's origin-validation
and SSE-denial code if R1 needs it, and leaves the Tauri work off the critical
path. K3 in #41 should be marked superseded by R2 or the two must be merged;
running both is the worst outcome.

### F7. The MCP SDK recommendation needs a decision, not an assumption

Neither Kosmos nor the Engine uses `@modelcontextprotocol/sdk`; Kosmos's
runtime dependencies are `gkos-engine` and `three`. The Engine server is
fixed-protocol (any `protocolVersion` other than 2025-11-25 is rejected) and
answers only `application/json`. So the prototype's "fixed protocol, JSON only"
transport, which rev2 called a defect, matches the only server it will talk
to. Adding the SDK to the Obsidian bundle is a new runtime dependency with
bundle-size, mobile and SBOM/provenance consequences (the repo runs
`provenance-and-sbom` and `dependency-review` checks). Rev3 turns R1's SDK
sentence into a transport decision record with criteria. Either answer is
acceptable; guessing is not.

### F8. Page and window sizes constrain the Hermes experience more than rev2 says

At 650eab4, `gkos_note_read` pages are 4 to 16,384 bytes and `gkos_search`
returns at most 50 per page from a top-100 window. Kosmos allows 200 search
results and a 200,000-character full note. A single long note is therefore at
least thirteen Engine calls. If `get_note_passage` is a one-to-one wrapper,
Hermes needs thirteen tool calls for one note; the transcript already shows it
resorting to Python when that happens. Rev3 specifies server-side page
aggregation inside Kosmos with a disclosed byte budget.

### F9. The deployed vault is a Nextcloud-synced folder

`C:/Users/FAC/Documents/_NC/Obsidian-Oden`. Anything T1 writes under the vault
replicates to Nextcloud and to every other device; dot-folders are skipped by
Obsidian Sync but not by Nextcloud. Rev2's T1 says "outside source Markdown";
rev3 says outside the synced tree unless the retention policy explicitly puts
it in scope.

### F10. Live Kosmos probe (added after the owner supplied the credential)

An authenticated read-only session against `http://192.168.5.95:4816/mcp`
confirmed the on-disk findings: serverInfo `kosmos-oden 0.7.0`, eighteen tools,
session issued, unknown session returns 404, limit validation is honest (1 to
200). `BUILD-INFO.json` gives the source commit 1bbbc541, and the bundle hashes
match the shipped `SHA256SUMS`, so the matrix's "deployed-matching tree" claim
is now proven, not inferred. The corpus is 2,222 notes with 5,296 semantic
edges. The body-only gap reproduces: "fighter metrics" returns zero results.

One new finding for R0 and H1: the MOC prototype's archived runs under
`_archive/moc-runs/2026-09-08/...` are indexed as ordinary notes, so
`get_related` returns before/after snapshot copies as backlinks. That inflates
edge counts and will confuse Hermes path-following until those folders are
excluded from the agent projection or the prototype is disabled. The credential
used for this probe was pasted into chat and should be rotated.

### F11. The vault already holds governing documents the plans must reconcile with

A search of the live vault found 31 notes matching "kosmos-oden" and 81
matching "kosmos", all under `AI_LLM`. Three are recent and binding on this work:

- `Kosmos-Oden_Capabilities_2026-09-05.md` (public): the current Kosmos-versus-
  Engine capability split. It names "bring Engine retrieval and the managed MOC
  runtime into Kosmos, preserving offline mode" as a top transfer, which is the
  R-series. It also lists "expose selected Kosmos agent queries through Engine
  service contracts" (evidence, labels, relationships, policy) as a transfer in
  the other direction; that is out of scope here and is now stated as such.
- `Marshal-008 GKOS Stack Operating Loop Directive v0.2` (public, GKX): §7
  fixes a governed retrieval order (eligible canonical set before any ranking;
  Graphiti ranks only inside that set and never expands it; a Selection
  Envelope records provider results, generation, query, ranking, omissions and
  degradation). R1's security contract already matches it; rev3.1 cites it and
  aligns the search response metadata with the Selection Envelope fields. It
  also records an **already-ratified Graphiti benchmark gate** (unique query
  class, at least 10% quality, at most 25% overhead) and an open two-candidate
  retrieval-provider trial (Kosmos-Oden versus grooveseek). The README's
  proposed 5-point / 2x p95 thresholds conflicted with the ratified gate; the
  README now defers to the ratified gate and names the trial.
- `03_KOSMOS_ODEN_NAVIGATION_MOC_INTEGRATION_PLAN.md` (public, 2026-08-15): §13
  defines `_archive/moc-runs/**` as a designed run archive with its own sync and
  retention policy; §14 says expose read-only Navigation operations first and
  never an apply route on the ordinary read token. So the archive copies seen
  in `get_related` (F10) are not stray files; they are a designed archive that
  the agent projection has not been taught to treat as history. Rev3.1 proposes
  that the agent projection exclude `_archive/moc-runs/**` from search, related
  and graph results by default, surfacing it only through an explicit
  `include_archive` argument, and confirms Navigation tools stay out of the
  public catalog.

### F12. Metadata search misses the product's own name when spaced

`search_notes` is a literal substring match, so "kosmos oden" returns zero
while "kosmos-oden" returns 31. The Engine's own `gkos_navigation_discover`
`name_query` already matches every whitespace-separated term case-insensitively.
Rev3.1 adds the same term-AND semantics to Kosmos metadata mode as an additive
change in R2, disclosed through the existing `method` field. It is cheap and
independent of the Engine bridge.

### F13. Duplicate folder trees inflate results and edges

The vault carries parallel `Kosmsos_Research_Studio` and `Kosmsos_Research_Suite`
trees with identical filenames, plus the MOC run archive's before/after copies.
Duplicates by content digest should be grouped in search results, not hidden,
and the frozen evaluation corpus must either include them deliberately or
exclude them deliberately; an answer key that ignores them will mis-score
recall.

## 2. Minor corrections

- README: "Kosmos already filters fileNodes by sensitivity before scoring" is
  confirmed at `agent-server.ts` (`fileNodes` filters by `canRead` before
  `qSearch` scores). Keep.
- README: Hard-coded strings on main are "GKOS-Engine v2.1.1" (three places);
  the deployed bundle says v2.0.1; the running service says 2.1.2; the 0.8.2
  candidate library is 2.2.0. Four numbers are visible to an agent depending on
  where it looks. R3's version-metadata work is more urgent than rev2 implies.
- ADOPTION MATRIX: the rows and the 6/3/1/8 arithmetic are unchanged and
  re-verified against `agent-server.ts` and `mcp.ts`. The release ledger gains
  observed standings for 41172b9 and f1a95f8f and the live service self-report.
- ADOPTION MATRIX: the reconciliation's `area=Root` and `area=Vault` synthetic
  results are consistent with Engine `paths.ts` on main (`Vault` for empty/dot,
  `Root` for root-level files, first segment otherwise). Keep.
- NATIVE R1: `gkos_record_resolve` needs no scope reference (input is
  `canonical_path` plus optional `expected_uid`); `gkos_graph_at_time`,
  `gkos_navigation_audit` need a `scope_ref`, which is issued by discovery.
  Rev2's "may require an existing scope/session reference" is now precise.
- NATIVE R2G: `scores_basis_points` and profile `gkx-2.3-validating-projection`
  confirmed at 650eab4; not yet captured at the deployed 2.1.2.
- Kosmos rate limiting exempts loopback and applies to LAN clients; the Hermes
  deployment is a LAN client, so the acceptance runs exercise the limiter.
  Added to H1 acceptance.

## 3. New proposals

- **R0 is partly delivered.** `evidence/retrieval/baseline.json` in this folder
  is a first draft populated from today's observations, with every unknown
  named and its reason given. Remaining R0 items are operator receipts:
  Engine commit on 192.168.5.99, Hermes host and installed version, Kosmos
  tools/list digest (needs the Kosmos credential), Graphiti DB existence.
- **R0b, new: mainline dependency repair.** Land PR #42 or an equivalent so
  main pins an on-main Engine commit. Prerequisite for R1.
- **R0c, new: settings posture confirmation.** Owner confirms or changes
  `defaultSensitivity` and bind mode before body mode is enabled on a LAN bind.
- **R1 transport decision record** (SDK versus hardened in-house), criteria
  listed in the revised Plan A.
- **Topology fixture, new.** Hermes to Kosmos over LAN HTTP with bearer; Kosmos
  to Engine over LAN HTTPS with a trusted CA. Kosmos's own MCP endpoint is
  plain HTTP on the LAN today; rev3 records that and proposes TLS termination
  as a Q1 consideration, not a blocker.
- **Passage aggregation contract** with numbers, in R2.
- **Second-plugin inventory rule** in R0 and H1.
- **Plan-of-record decision** between the R-series and PR #41's K3.

## 4. What did not change

The security contract in R1, the area-mapping fixture table, the admission
gap handling, the lineage and related-paths contracts in R3, the known-at
three-basis model, the Graphiti mode table and managed-ingestion steps, the
acceptance matrices, the evaluation arms A to D and the predeclared
thresholds. The engineering-day allowance is unchanged; F2, F6 and F7 add
decisions, not weeks, if they are made before R1 starts.

## 5. Evidence sources used today

Kosmos: `origin/main` 3aab1e3, PR #42 head b35b27e, PR #41 head 65e9354, PR
#38 head fbec1f9, branch `codex/retrieval-moc-next-update` 35644f1. Engine:
`origin/main` 94a1e64, tag v2.1.2 peeled 7bf14b4, oracle 8207958, 650eab4,
f1a95f8f, 41172b9. Deployed: vault plugin manifests and bundles, non-secret
`data.json` fields, listener table, unauthenticated initialize on
127.0.0.1:4816, authorized initialize and `gkos_capabilities` on
192.168.5.99. Local checkouts of both repositories were stale (Kosmos 0.6.9,
Engine 1.0.5) and were not used as evidence.
