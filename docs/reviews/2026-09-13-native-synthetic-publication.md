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

Still required: the native HTTP connection profile, visible Obsidian interaction,
source/configuration invalidation through that installation, and restart/outage
acceptance. The backend adapter currently accepts the complete query envelope;
the native client sends only query, request ID, and limit. Its connection must
use a host-authorized route that supplies the published binding.

No production vault ingestion or full release qualification is claimed.
Private deployment receipts and credentials remain outside this repository.
