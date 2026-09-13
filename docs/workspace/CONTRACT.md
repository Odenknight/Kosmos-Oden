# Governed Notes workspace contract — implementation candidate

This records the W1/W2 boundary and a local W3/W4 implementation candidate under
the owner's instruction to complete all build plans. Native release qualification
and the default-workspace transition remain open.

The host owns corpus, committed source revision, authorized scope and current
policy. Human and agent queries use the same Engine-derived semantics; a display
name does not grant access. The preview receives only authorized query results.
Metadata tags remain navigation vocabulary. Authored, derived, proposed, approved
and effective values are displayed separately from the Engine projection, with
unavailable provenance stated explicitly. Neither the preview nor a selection
event approves a proposal, lowers sensitivity or creates an authoritative write.

Search uses the existing native defaults and reports bounded/partial coverage.
Long reads use committed continuation with explicit revision, offsets, budget
exhaustion and completion. Corpus, source or policy changes invalidate pending
work. The host rechecks its current binding immediately before publishing a
preview; asynchronous Markdown preparation does not preserve permission forever.

Each search and selected-note preview has an independent selection revision.
Replacing a selection aborts its signal and rejects late results even if the
provider ignores cancellation. Closing the workspace invalidates both. Prepared
but rejected previews release their rendering components. Cancellation signals
do not prove physical I/O cancellation; existing bounded provider admission is
still required. `WorkspaceSelection` implements only this UI-ordering boundary.

The Notes workspace opens source editing in the canonical Obsidian editor, with
no second write API. Kosmos remains available as the visualization workspace.
The intended default transition follows native Notes qualification and preserves
saved Kosmos leaves and existing open-visualization commands.

Markdown qualification must cover raw HTML, scripts/event handlers, unsafe URL
schemes, external resources, wiki links and transcluded notes. A renderer must
not load a hidden transclusion and then merely filter its output.
The candidate uses exact-pinned markdown-it 15.0.2 with raw HTML disabled,
images reduced to alt text and links rendered as inert spans. Wiki embeds remain
text. It does not invoke Obsidian's transclusion loader. Source is capped at
200,000 characters and output at 2,000,000 characters. These display budgets do
not claim physical preemption during parsing.

Required fixtures: hidden path/count/neighbor exclusion; unlabeled and invalid
sensitivity; origin collisions; missing provenance; proposed versus effective
relationships; stale search and selection; policy changes during rendering;
Unicode/continuation boundaries; keyboard navigation and canonical edit routing.
Current selection tests cover out-of-order completion, ignored cancellation,
closure, errors and changes during a final authority refresh. The remaining
fixture categories retain their W2/W3/W4 gates.

## Local evidence — 2026-09-13

- Full verification: 439 tests pass, no failures or skips; typecheck, build,
  version, lockfile, artifact, invariant and renderer-provenance checks pass.
- Browser interactions: 16 checks pass across desktop Chromium, mobile Chromium,
  Firefox and WebKit. Includes resource-free rendering, separate origin sections,
  paged reads, canonical source actions, late search/read suppression, revoked
  source opening, keyboard selection and closing while a read is pending.
- Host tests use the actual Agent API with synthetic public/confidential notes;
  they verify hidden counts/paths and no denied body access, corpus/provider/
  graph/policy fencing and two outstanding physical operations per host.

The browser host is a synthetic capability fixture; it does not qualify actual
Obsidian file opening, native lifecycle, platform performance, or the complete
revised fixture matrix. Existing saved Kosmos leaves and commands are preserved.
The installed plugin has not been replaced by this candidate.

Follow-up fixture run: eight host checks pass, including configured unlabeled
defaults, invalid-sensitivity exclusion and missing-projection preservation.
The 439-test full run preceded these two additional fixture tests.

[Native reader probe](../reviews/2026-09-13-native-notes-probe.md): candidate
reader/API code subsequently passed real-provider preview and canonical editor
opening inside a temporary Obsidian pane. Plugin startup/registration and final
release gates remain unqualified.

## Search continuation — 2026-09-13

Notes exposes **Next results** and **Back to first results**, with page ranges
against the readable total. Each next-page capability retains the original query,
filters and committed corpus/graph/policy binding. It rechecks that binding before
and after preparing the next page; publication checks it again. A changed binding
requires a fresh search. The current graph's stable result order is preserved.
Only one page is displayed at a time; no growing result cache is introduced.

The shared query supports an internal native offset. Public MCP search arguments
and existing substring/ranking behavior remain unchanged. Counts include only
readable matches; body search continues to disclose its bounded prefix coverage.

Full verification now passes 443 tests and all build checks. Ten host fixtures
and 20 browser checks pass, including complete traversal without duplicates,
revocation before/during continuation and page navigation across four browsers.
At 09:35:46 UTC, the candidate API/host queried the actual Obsidian provider:
two pages of 100 results, second offset 100, readable total 2275, no duplicate
paths, and successful final publication. This in-process probe left the installed
plugin unchanged and does not qualify plugin startup/reload or release promotion.

## Installed candidate acceptance

[Installed Notes acceptance](../reviews/2026-09-13-installed-notes-acceptance.md)
subsequently qualifies plugin registration, preview, source opening and
close/reopen on clean candidate `c5b7b7f`. The prior temporary probes remain
historical evidence. Cold process start, negative authorization, the remaining
fixture matrix and the default transition retain their separate gates.

## Inspector navigation follow-up

The inspector now displays navigation tags separately from Engine assessment
labels and exposes outgoing links, backlinks and semantic links from the existing
policy-filtered related-note query. Following a link uses the same authorized
read/selection path as a search result. Author-written references in a readable
body are preserved; hidden targets are not resolved into neighbor metadata.
Each link group and the tag list display at most 100 entries with explicit
truncation text. Eleven host checks and 24 browser checks pass for this follow-up;
it is not part of the previously installed `c5b7b7f` native receipt.

## Assessment and diagnostics follow-up

The inspector reads the existing Engine-backed assessment and diagnostics queries
under the same final corpus, graph and policy publication check as the preview.
It accepts the documented documentation-and-support-quality interpretation,
distinguishes a zero score from an unrecorded score, and explains that the score
does not establish truth or approval. Diagnostics render as inert text, with at
most 100 entries and explicit truncation. Unavailable projections do not trigger
assessment or diagnostics queries. Full local verification passes 446 tests and
all build checks. This increment is not yet installed in the native plugin.

Twelve host checks and 28 browser checks pass across desktop Chromium, mobile
Chromium, Firefox and WebKit, including unavailable, zero and missing assessments
and inert diagnostic markup.

## Selection continuity

Refreshing the native Notes view re-reads its selected path under the current
publication checks. File and folder renames update that path; deletion clears it
immediately. Unreadable notes discard the retained selection after displaying the
unavailable state. Search/filter changes deliberately start a new selection.
This is continuity within an open Notes pane; persisted selection across closing
the pane and synchronization with the spatial view remain separate work.
Full verification passes 446 tests and all build checks. The browser suite passes
32 checks across all four targets, including rename, deletion and unreadability.

### Saved layout implementation

The native view now implements Obsidian layout state for search text, navigation
tag, body-search choice and selected path. It stores no preview, projection or
authorization capability. Restore bounds text fields, checks field types and
repeats search/read publication checks. Browser qualification passes 36 checks
across four targets, including restoration under revoked policy and malformed
saved values. Full verification passes 446 tests and build checks; the subsequent
close-state retention hook passes typechecking. Native installed layout restore
and spatial synchronization are not qualified by these browser checks.

## Opt-in entry

`notesWorkspaceEnabled` defaults to false and migration accepts only boolean
true. The Open Kosmos-Oden workspace command opens Notes when enabled and the
existing Kosmos view otherwise. Direct commands and saved view IDs remain
unchanged. This opt-in does not change the global default or qualify rollout.
