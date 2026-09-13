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


## Pane layout

Notes now separates navigation, canonical-note preview and the read-only
inspector. The inspector contains the local map, readable links, origin records,
assessment and diagnostics and can be collapsed on desktop. At a pane width of
600 CSS pixels or less, Browse notes and Inspector switch between drawers and
the primary note. This follows the actual pane width, including desktop splits.
Selecting a readable result or neighbor returns to the note; Escape closes an
open drawer and restores focus to its button. No global shortcut is captured.

Selection changes and refresh invalidate both preview and inspector together;
the existing snapshot publication guard still controls their replacement. The
resize observer and keyboard handler are removed when the workspace closes.
Browser qualification covers drawer switching, focus, scope checks, stale
content and continuation in Chromium, Firefox, WebKit and the mobile Chromium
configuration. General behavior fixtures use a 1280px viewport; the dedicated
narrow-pane case constrains the pane to 340px. Native installation qualification
for this layout remains pending.

## Governance header and source

The inspector groups its existing content into Metadata and provenance, Links
and lineage, and Diagnostics and assessment tabs. Exactly one panel is visible.
Arrow keys, Home and End move and activate tabs; ordinary Tab moves into the
selected panel. The selected section stays active when choosing another note.
Each mounted workspace has separate tab/panel IDs. Tabs remain inside the
existing inspector drawer on narrow panes and retain its Escape behavior.
This organization does not add evidence fields or resolve missing references;
those remain separate implementation and qualification requirements.

The note header shows effective epistemic state and sensitivity directly from
the Engine's effective origin. Authored and proposed values do not substitute
for absent effective fields. Missing text is shown as Not recorded. Projection
source details expose the existing source path, version, content hash, profile,
mode and projection capability. The Engine's legacy `conformanceClaim` field
describes reader/assessor capability; it is not a protocol qualification result.
Text is inert and bounded; explicit boolean false remains visible as false.
The five origin records remain separately inspectable. These fields do not
create approval authority or permissions.

Each origin also shows structured supporting and contradicting evidence
declarations from that same projection. Target, source UID, independence group,
strength and relevance remain attributed to their origin; proposed evidence is
not copied into effective evidence by the UI. Zero is displayed as zero, missing
values as Not recorded, invalid numeric values explicitly as invalid, and empty
lists separately from absent lists. At most 50 declarations per direction and
origin are displayed, with an explicit truncation notice. The complete origin
record remains available within its existing preview budget. References are
inert text, not resolved or verified findings. This display does not validate
evidence targets, establish truth, or authorize action.

## Readable lineage

Notes saved state retains a valid authored UUID alongside the canonical path.
Refresh and layout restoration use strict UID lookup when that identity exists;
they do not fall back to a different note occupying the old path. Missing or
ambiguous UIDs refuse restoration. Notes without a valid UID retain path-based
behavior. Successful publication updates the saved path and all source actions
to the current canonical path. Selection clearing/deletion clears both values.
This identity is a selector, not an authorization grant; normal snapshot and
scope checks still apply. The readable spatial view also saves a valid UID,
uses it on refreshed graph publication, and refuses missing or duplicate UID
matches when returning to Notes. Renderer selections and explicit Locate actions
capture the selected node's identity; clearing selection removes both fields.
The mode-switch callback still passes the freshly resolved path, so carrying UID
through the destination's asynchronous read remains a separate integration gate.

Notes captures the existing `qLineage` result with the note, projection and
related links under the same snapshot publication guard. The inspector shows
up to 100 resolved members, marks the selected note, and opens members through
the checked Notes read flow. Counts and members describe only the readable
scope; confidential successors are excluded. Unavailable data is distinct from
an empty chain. This is resolved current lineage, not an approval record,
known-at history.

The candidate pins Engine `fb05e68b08ff60c1f753c5236de4ba0e6b05b6ca`
(Engine PR72, qualification and merge tracked separately). `qLineage` now also
returns scoped declaration inspection from the Engine's parser-owned candidate
tiers. The host supplies its readable node set; hidden candidates behave like
physical absence. The inspector displays field, origin, declaration number,
source line and resolved/unresolved/ambiguous/self status, with at most 100 rows.
It does not expose raw references or create links to unchecked targets.
Declaration resolution does not rewrite the existing canonical chain.

Unavailable receipts are distinct from an available empty declaration list.
Private receipts do not survive graph cloning or transfer between independently
bundled Engine instances; those cases report unavailable. A shared native-bundle
test verifies the Engine/server/host path and hidden-versus-absent equality.
Installed-runtime qualification remains pending. Unresolved means unresolved in
the readable scope, not globally absent; no status implies approval.
