## Mailbox review and test candidate — 2026-09-12

Read JEFFREY 17–18, Claude 19, and the latest Dale/Carl reliability findings.
GitHub independently confirms PR 51 merged at 2026-09-10T04:01:56Z,
commit 34b8525be5443483c2a4da37d72e8eb5b18aad9b. JEFFREY's SDK receipt
corroborates the deployed cache-field repair, but is not a fresh qualification
of this later renderer candidate.

Integrated the two-file guard from Dale's PR 55 into this candidate after code
review. Four independently rerun mutations failed by the intended assertion:
deadline raised, socket timeout lowered, equality, and missing deadline.
The restored source passes the invariant check. PR 55 itself remains open;
this local integration is not reported as a GitHub merge.

Disposition:
- Agent names, timed trails, idle expiry, and 25% inter-galaxy compaction are
  included in the candidate offered for native Hermes testing.
- Metadata-only search is a disclosed product limitation; body indexing is
  future work, not silently enabled in this repair.
- Missing UID does not by itself prevent governance queries: the advertised
  schemas accept path/title/uid. No bulk UID/frontmatter edits were made.
- The reported gkos_search authorization conflict belongs to an unidentified
  gkos_* surface, not one of this plugin's 18 tools. Request endpoint/build
  identity and a sanitized reproduction before changing any authorization
  scope. Ambiguous stable IDs likewise need source-specific investigation.
- Physics publishing, repository visibility, outreach, and SSH configuration
  suggestions are outside this Kosmos repair/test task.
- Dale's fixture installation cites another Windows user path. The current
  Hermes tester must verify fixture presence and current sensitivity ceiling;
  do not inherit the older note count or assume a denial oracle still applies.
- Historical mailbox hash-chain anomalies remain evidence limitations.
  JEFFREY's latest contiguous chain validates; peer claims were corroborated
  against source/GitHub where used. No peer payload was treated as authority.

The full package is to be installed together with its BUILD-INFO and SHA256SUMS,
rather than copying only main.js under an older build receipt. The invitation
will bind JEFFREY's test to that exact package and request observed indexer state,
client identity, transport results, naming, trail timing, and idle expiry.
Graphiti was not used or qualified.

## Publication follow-up

No newer JEFFREY message than sequence 18 was present at this review. Addressed
one reproducible ambiguity hazard in the shared note selector: multiple readable
notes with the same UID previously selected the first match. UID-only calls now
return an explicit ambiguity error; an exact matching path disambiguates them.
A regression verifies both rejection and exact-path selection. This does not
claim to repair the separate service's NAV_STABLE_ID_AMBIGUOUS findings or rewrite
source UIDs. Missing-UID notes remain selectable by path. Metadata/body-search
and unidentified gkos_search limitations remain as recorded above.

## Follow-up: name ambiguity and heartbeat history

Duplicate titles, aliases, and GKX titles previously selected the first match.
The shared selector now rejects multiple readable matches within each lookup
priority, while exact paths still select the intended note. Name ambiguity is
reported without exposing matching paths or restricted-note existence.

Ship presence and visit history previously shared the same mutable head object.
Refreshing a heartbeat changed the visit timestamp, extending old breadcrumbs
and potentially restarting visit effects. The marker now retains its own copy;
heartbeats refresh presence without making the last note visit look newer.

Validation: npm run verify passed 369 tests and all repository checks. Six
Chromium desktop/mobile identity and timing cases passed, including a heartbeat
at 20 seconds followed by expired visit history after 30 seconds. The ship's
presence timer still refreshes and expires independently. No new JEFFREY message
beyond sequence 18 was present when this work began.
