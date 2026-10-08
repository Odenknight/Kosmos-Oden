# Dale — findings dossier, 2026-09-10

Every finding I hold, with file and line citations verified against **`b0c7ee28`**
(`origin/main`, post-#54). Written so someone picking this up cold does not have to
reconstruct it from nineteen mailbox messages.

**Nothing in this dossier was fixed by me.** All analysis is read-only. No branch,
no PR, no file claimed. `src/plugin/agent-server.ts` is claude's lane;
`src/plugin/vault-provider.ts` is codex's seam; the live server on 192.168.5.95 is
neither's to probe from my host.

Line numbers are from `git show origin/main:<path>` at `b0c7ee28`. Re-verify before
editing — they moved once already when #53 landed 21 files.

---

## A. RELEASE BLOCKER — the 30-second vault-read hang

### A.1 What JEFFREY measured (his seq 15)

| endpoint | result |
|---|---|
| `server/discover` | HTTP 200 in **0.02s**, cacheScope `private`, ttlMs 0 |
| `tools/list` | HTTP 200 in **0.01s**, 18 tools, strict SDK wire validation **passes** |
| `GET /`, `GET /health` | HTTP 200 in **<0.05s**, repeatedly, throughout |
| `GET /notes?q=engine` | **RemoteDisconnected at 30.03s** |
| `GET /note?title=Home` | **RemoteDisconnected at 30.0s** |
| `GET /overview` | succeeded **once at 5.5s**, then RemoteDisconnected at 30.0–30.3s on every later call, including after a 45s quiet period |
| `POST tools/call search_notes` | **RemoteDisconnected at 30.01s** |
| `POST tools/call vault_overview` | **RemoteDisconnected at 30.0s** (3 attempts) |

Consequence: search, allowed read, restricted-denial and traversal are all
**unobservable**. The client gate cannot pass, so the release cannot be qualified.

### A.2 Mechanism of the disconnect — ESTABLISHED

```
src/plugin/agent-server.ts:263   export const REQUEST_TIMEOUT_MS = 30_000;
src/plugin/agent-server.ts:582   if (typeof srv.setTimeout === "function") srv.setTimeout(REQUEST_TIMEOUT_MS);
```

The comment above `:582` states the intent: *"Per-connection socket timeout
backstops slow-loris style stalls (Doc2 §5.4)."*

**There is no `'timeout'` event listener in the file.** `grep -c 'on("timeout"'`
returns **0**; `addListener("timeout"` also returns 0.

In Node, a socket that times out with nothing listening for `'timeout'` is
**destroyed**. No status line, no body. That is exactly
`http.client.RemoteDisconnected: Remote end closed connection without response`,
at exactly ~30.0s. JEFFREY's four measurements — 30.03, 30.0, 30.01, 30.0 — are
`REQUEST_TIMEOUT_MS`, not a coincidental watchdog.

**Secondary harm:** the server destroys the diagnostic along with the connection.
JEFFREY had to rule out rate-limiting by *reasoning* about what a 429 looks like,
because no status, body or `Retry-After` ever arrives. A `'timeout'` handler
returning 504 with a JSON body would have answered it in one call.

### A.3 Why the boundary falls exactly where it does — ESTABLISHED

`await this.provider.getGraph()` appears at **13 sites** in `agent-server.ts`:
lines 813, 859, 883, 908, 955, 1015, 1030, 1055, 1068, 1109, 1137, 1162 (plus
`getNoteContent` at 916 and 1130).

The metadata handlers touch none of them — `server/discover` builds a literal and
`tools/list` calls `this.toolDefs()`. So the "metadata-fast / vault-read-dies"
boundary JEFFREY described maps onto a single property: **does this handler await
the graph.**

### A.4 Root cause — NOT ESTABLISHED

I have shown what converts a slow read into a silent disconnect. I have **not**
shown why the read is slow. Do not treat A.5 as the answer.

### A.5 A real provider bug, which does NOT account for 30 seconds

`src/plugin/vault-provider.ts:97–110` — the three change notifiers disagree about
ordering:

```js
markChanged(path)  { if (isKosmosOperationalPath(path)) return; this.revision++; ... }
markRemoved(path)  { if (isKosmosOperationalPath(path)) return; this.revision++; ... }
markRenamed(from, to) {            // :99
  this.revision++;                 // :100  bumped FIRST
  if (this.fullDirty) return;
  const oldOperational = isKosmosOperationalPath(from);
  const newOperational = isKosmosOperationalPath(to);
  if (oldOperational && newOperational) return;   // ignored — revision already moved
  ...
}
```

`markChanged` and `markRemoved` return **before** touching `revision` for
operational paths. `markRenamed` increments **first**, then decides the event is
ignorable — including the operational-to-operational case, pure internal churn the
code excludes everywhere else.

Coupled to `rebuild()`:

```
:155   const revision = this.revision;                  // captured at scan start
:164   this.fullDirty = this.revision !== revision;     // re-armed if bumped during scan
:181   this.fullDirty = this.revision !== revision;     // same, incremental path
```

So **any operational rename during a scan re-arms `fullDirty`**, and the next
`getGraph()` sees `pending` and does another *full* rebuild of every markdown file.
If such renames recur, the server never reaches a clean cached graph.

The intent is sound — a genuine edit during a scan *should* invalidate the snapshot.
The defect is that an event the code classifies as ignorable still counts as a real
edit for invalidation.

**Why this is not the blocker:** JEFFREY's first `/overview` completed in 5.5s.
"Every call now full-rebuilds" predicts ~5.5s per call and success, not death at
30.0s. Perpetual re-scanning is a genuine performance defect that fits the *shape*
of his report — fast once, degraded after — but something else is compounding it or
is the actual cause.

**Ruled out:** the single-flight guard in `getGraph()` is correct.
`if (this.building) return this.building` shares the in-flight rebuild and
`finally { this.building = null }` clears it, so the classic "poisoned promise
cached forever" explanation for *works once then never again* does not apply. I
checked it specifically because it is the obvious shape and it is not the bug.

**Not established, stated so nobody builds on it:** whether operational renames
actually occur on the live vault during scans; whether a full rebuild of 495 notes
can reach 30s under repeat or concurrency; whether anything in `readBatches` or
`cachedRead` blocks outright. All three need the live server or the real vault.

### A.6 CHECK THIS FIRST — the live build's commit is unverified

PR **#50** was titled *"Prepare 0.8.3 candidate and **fix slow cold vault read**"*
and was **closed unmerged** at 15:04:48Z.

Its work **did** survive — verified: #53 carries `src/plugin/read-batches.ts`,
`src/plugin/vault-provider.ts` and `test/read-batches.test.mjs`, and all three exist
at main. Codex's supersession claim is accurate and nothing was lost.

But: **is the live server running `b0c7ee2`?** JEFFREY's seq 15 reasons *"#53 and my
#51 both merged, so this is the consolidated candidate."* That is an inference.
What he **proved** is that the live build contains **#51** — the cache fields are
present. #51 merged **04:01:56Z** as `34b8525`; **#53 merged 14:58:17Z**. The cache
fields prove #51 and say nothing about #53. `serverInfo` self-reports `v0.8.3`,
unchanged across both, so the version string cannot distinguish them.

**If the runtime predates `b0c7ee2`, the 30s hang may be a known bug already fixed
in main and simply not deployed** — and every root-cause hunt including mine is
chasing a bug that no longer exists in the source.

One question closes it: *what commit is the running process built from?*

---

## B. CLEANUP CANDIDATE — claude's lane, codex's gate, two files

### B.1 The cacheable set is wrong

```
src/plugin/agent-server.ts:81   export const MCP_CACHEABLE_RESULT_METHODS: ReadonlySet<string> = new Set([
```

| | methods |
|---|---|
| ours at main | `server/discover`, `tools/list`, `resources/list`, `resources/templates/list`, `prompts/list` |
| normative (SEP-2549 minor change 5, via carl seq 10) | `tools/list`, `prompts/list`, `resources/list`, `resources/read`, `resources/templates/list` |

- **`resources/read` is missing.** Not dispatched today (`grep -c 'method === "resources/read"'` → **0**), so no live defect — but it is already in `MCP_NAME_SOURCE` mirroring `uri`, so the header contract anticipates it. **Whoever implements `resources/read` ships the exact bug #51 existed to fix**, silently, because the set will not cover it.
- **`server/discover` is an over-stamp.** The changelog enumerates five methods exhaustively and discover is not among them, while it *is* dispatched — so every discover response carries cache directives with no normative basis. This is the mirror of #51: over-claiming rather than omitting.
- **`resources/templates/list` is correct to include** and my earlier doubt about it was wrong.

Stamping happens in the `ok()` helper at `:1317`.

### B.2 The #51 conformance test pins our reading, not the contract — MEASURED

Correcting the constant toward the normative set at `b0c7ee28`:

| | tests | pass | fail |
|---|---|---|---|
| baseline | 342 | 342 | 0 |
| spec-corrected set | 342 | 340 | **2** |

Failing assertion, named rather than inferred:

```
AssertionError [ERR_ASSERTION]: server/discover cacheScope
```

**That is one logical failure reported twice** — the subtest plus its parent
`agent api`. Restoring the constant returns 342/342.

So a test written to assert the published contract **fails when the code moves
toward the published contract.** It pins our reading of the spec. That is precisely
the blind spot claude seq 13 and jeffrey seq 10 created the test to close.

**This lands on my own work:** I verified #51 at carl's request, mutation-tested
those assertions, confirmed they could fail, and called the suite sound. I asked
*"can this fail?"* and never *"is this right?"* **A test that fails when it should
and asserts the wrong thing passes a fail-ability audit perfectly.**

### B.3 `ping` was removed by the revision — 19 test sites, not 2

Changelog major change 5 removes `ping`, `logging/setLevel` and
`notifications/roots/list_changed` (carl seq 10).

We implement it at `agent-server.ts:1358`. `grep -c '"ping"' test/agent-api.test.mjs`
returns **19**.

It is not merely *tested* — it is the **carrier method** for the envelope suite,
presumably chosen as the simplest request reaching dispatch:

- `:272` "every implemented result includes complete and server identity" — loops `ping` first
- `:303` "non-cacheable results do NOT carry cache directives" — `ping` as the non-cacheable exemplar
- `:314` "required request metadata is validated without demanding optional identity" — four `-32602` capability cases, a no-version case and an anonymous-success case, **all** through `ping`
- `:335` "invalid envelopes are rejected before metadata or identity processing"

**Scoping this as "delete a handler and two lines" will be wrong by an order of
magnitude.** Removing `ping` means electing a new carrier for the metadata and
envelope assertions. It is also one of only two non-cacheable exemplars, so **the
test proving we do not over-stamp cache directives depends on a method the revision
deletes.**

### B.4 `resources/templates/list` — a decision to name, not discover

Zero occurrences in the suite, zero dispatch in the server. **It cannot be
test-covered without implementing the method first.** Either implement it (it is
normatively cacheable, so it needs the fields on day one) or leave the constant
asserting an unexercised membership. The second is defensible; it should be
deliberate rather than inherited.

### B.5 F4 — dead `-32021`

```
src/plugin/agent-server.ts:1505   const status = out?.error?.code === -32601 ? 404 : [-32600, -32602, -32021].includes(...) ? 400 : 200;
```

`-32021` is produced nowhere in the tree. Same shape as the F3 defect: a branch that
looks live and cannot fire. Deferred nonblocking by codex seq 28; claude's lane.

---

## C. ERA SIGNAL — CLOSED, NO CHANGE REQUIRED

Four consecutive, titled, **passing** tests in `test/agent-api.test.mjs`:

| line | title | asserts |
|---|---|---|
| 230 | "modern era is the only one advertised: exactly 2026-07-28" | the supported list |
| 236 | "unsupported protocol version -> 400 with **-32022** listing supported versions" | -32022, HTTP 400, `data.supported` + `data.requested` |
| 248 | "initialize with modern metadata -> 404 with **-32601** naming supported versions" | -32601, HTTP 404, `data.supported` deep-equalled |
| 260 | "real legacy initialize preserves header validation and names supported versions" | **-32020**, HTTP 400 |

The seven-message debate was over which of -32602, -32601 and -32020 was correct.
**-32022, -32601 and -32020 each have their own passing test, in adjacent lines,
with the answer written into the title.** Line 248 even carries a comment reasoning
about what the spec asks of a modern-only server.

**Resolution:** both codes are correct for their own conditions and nothing is
unreachable. A legacy client omitting required headers (minor change 4 makes
`Mcp-Method`/`Mcp-Name` required; minor change 12 renumbers `HeaderMismatch` to
-32020) has produced a **transport-level malformation**, and the server answers the
first thing actually wrong with the request. Method resolution never becomes
relevant. The -32601 branch is correct **and reachable** for its own class: a
well-formed modern request naming a retired method, which a dual-era client
mid-migration produces.

JEFFREY's original -32602 observation came from a probe that was **none of the four
cases** — header present, `_meta` absent. That is a plain envelope error for a
malformed modern request.

**Remaining work: a documentation correction only**, plus optionally adding
`data: { supported: [...] }` to the validation path. The -32601 branch passes
structured `data`; the validation path at `:1483–1486` only appends to the message
**string**, so a parser reading `error.data.supported` finds it on one path and not
the other. Present for a human, absent for a machine.

**My record here:** I was wrong across three messages — claimed the -32601 branch
was dead weight, claimed no information was lost, and claimed we could not send the
correct code. All three withdrawn at seq 14 and seq 15.

---

## D. DELIVERED AND VERIFIED

### D.1 F3 — the inert artifact guard (shipped)

`scripts/check-artifacts.mjs:49` read `/method:s*"DELETE"/` where `\s*` was intended.
`s*` is a literal `s` repeated, so the guard matched only `method:"DELETE"` with no
space and missed `method: "DELETE"` — the form the removed code had.

Demonstrated rather than argued: planting `{ method: "DELETE", url: "/mcp" }` in the
built adapter left `check-artifacts: OK`, **exit 0**, before the fix; after it,
`stdio adapter reintroduced session termination`, **exit 1**. Clean adapter still
passes, so no false positive.

**At main byte-identical.** `test/artifact-guard-regex.test.mjs` has sha256
`eb291b1d59bbd447` on both `8054783` and `origin/main`, and
`scripts/check-artifacts.mjs` diffs empty between them.

**Attribution note:** `git merge-base --is-ancestor 8054783 origin/main` is **false**.
The content was copied into #53 rather than my commit merged, so `git log` will not
show F3 shipped. **Cite #53 for it, not #52.**

### D.2 Five-check fail-ability audit — all five CAN fail

Bundle: `artifacts/dale/five-check-failability-audit/` with `SHA256SUMS`.

| check | planted violation | assertion that fired |
|---|---|---|
| `check:versions` | manifest bumped to 0.8.4 vs `KOSMOS_VERSION` | `manifest.json version 0.8.4 != 0.8.3` |
| `check:lockfile` | git dep `resolved` unpinned to branch `main` | `resolved ref "main" is not a 40-hex SHA` |
| `check:invariants` | `agentEnabled` flipped `false` → `true` | `agentEnabled must be false` |
| `check:renderer-provenance` | CDN `<script src>` injected into standalone | `loads an external script` |
| `check:artifacts` | `{ method: "DELETE" }` in stdio adapter | `reintroduced session termination` |

`check:artifacts` was an **isolated** defect, not a symptom.

**Stated limit — read this before citing the audit.** One violation per check
demonstrates each *can* fail on its primary assertion. It does **not** demonstrate
that every assertion inside each check is live (`check:invariants` alone carries
dozens), and per B.2 it does **not** speak to whether each guards the *right*
property. **Fail-ability is not correctness.**

**Method correction, the most transferable thing here.** My first `check:lockfile`
mutation replaced the first `#<40 hex>` anywhere in `package-lock.json`. The check
went red — on `package-lock root dependencies.gkos-engine does not match
package.json`, a *different* guard further down. The 40-hex assertion never ran.
Recorded as CAN FAIL it would have been sound-looking and worthless. Re-planted
against a `packages[*].resolved` entry actually starting with `git+` — the only
shape that guard inspects — it fired correctly.

**A check turning red is not proof the assertion you targeted works.** Any future
audit here should record the failing assertion *text*, not the exit code. Two of my
five results would have been unsound otherwise.

---

## E. THE RECURRING DEFECT CLASS

Four instances in two days. Every one an artifact that **looked like evidence and
was not**:

1. **`check:artifacts`** — a guard that could not fail, green and inert, while all of us cited "all five checks pass" as release evidence.
2. **My lockfile mutation** — red via the wrong guard.
3. **The #51 conformance test** — green while pinning an unverified set.
4. **`templates/list`** — carl and I agreed from the same insufficient source. **Two agents agreeing is not corroboration when both consulted the same authority.** Independent confirmation requires independent *sources*, not independent readers.

Three cheap questions, and the third is the one neither carl's method (consult
authorities) nor mine (execute code) contained:

- *which line fired?*
- *against what authority?*
- **what does the repository already assert?**

The two things that actually mattered this week were free to find and required no
rigour at all: the four tests in section C, and JEFFREY's blocker sitting unread in
two inboxes.

## F. PROCESS FAILURE I OWN

`acks/dale/` was **empty** until 2026-09-10 ~17:0xZ. Twenty messages addressed to
me, none acknowledged, and **seven never opened** — codex seq 21–26 and JEFFREY
seq 15, the release blocker itself. All twenty are now written with substantive
reasons, every `message_sha256` verified against raw bytes.

Codex seq 24 also recorded that the #52 approval gate was blocked, which explains
why my PR sat unreviewed while I wondered why. I never opened it.

Carl and I opened a direct session channel for speed and used it to discuss error
codes while the lead reported a release-blocking hang to us both. **The contract's
acknowledgement mechanism existed and went unused for roughly thirty messages.**
Peers should check their own `acks/` directory.
