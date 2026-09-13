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
