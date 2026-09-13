# Native synthetic publication

Source candidate: Kosmos `d246bf1`, with Engine `885b0b3`.

A separate synthetic corpus was exported through the native vault provider.
It contains one note and one managed episode.
The isolated Observatory worker ingested it, verified persistence, and found
the expected relay/test-chamber fact before publishing the ledger record.
The provisioning job exited successfully. Transferred payload hashes matched.

A newly created native provider then reproduced the published manifest using
the retained projection time. Original source-byte digests matched.
The native semantic client accepted the actual published ledger receipt.
This local validation did not issue a live HTTP query.

The plugin was also rebuilt and packaged from a clean checkout at `d246bf1`.
Artifact checks passed before staging it in the separate synthetic test vault.
The normal vault's installed plugin was not replaced.

Engine `72689af` adds the authenticated three-field `POST /search` route.
Its 19 focused tests passed on Windows and Observatory Linux with matching
source hashes. A new native publication was qualified for this changed runtime;
the earlier generation was preserved.

The new loopback service passed five live queries with the expected fact and
exact published citations. They took approximately 31–122 milliseconds.
Unauthenticated requests and caller-supplied bindings were rejected.

The isolated vault is now open in actual Obsidian. Its loaded plugin reproduced
the native manifest exactly. The visible Notes view displayed the readable
source. A DOM-driven check also confirmed unconfigured semantic fallback.
The first UI probe expected a frontmatter title; it was corrected to select
the actual filename label. The initial failed probe was retained locally.

Still required: connect the native profile to the live service, verify visible
semantic results and source navigation, then qualify source/configuration
invalidation and restart/outage recovery through that installation.

No production vault ingestion or full release qualification is claimed.
Private deployment receipts and credentials remain outside this repository.
