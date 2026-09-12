# Observatory synthetic Graphiti staging

Owner authorized an isolated synthetic-only service on Observatory on September
12, 2026. This staging work is separate from the adapter qualification in
[the runtime report](2026-09-12-graphiti-runtime-upgrade.md).

## Installed and observed

- Dedicated `kosmos-graphiti` service account, runtime at `/opt/kosmos-graphiti`,
  data at `/mnt/data/kosmos-graphiti`; no source-vault mounts.
- Python 3.13.5, Graphiti 0.30.2, FalkorDB Python 1.4.0, FalkorDBLite 0.10.0,
  OpenAI SDK 2.32.0, HTTPX 0.28.1 and Redis Python 7.1.0. Runtime constraints
  come from Graphiti's [v0.30.2 lockfile](https://github.com/getzep/graphiti/blob/eaa4128681bc53487138a4bbc22d58336ebe70d2/uv.lock).
- `kosmos-graphiti-db.service` runs the packaged database with append-only
  persistence, a 512 MiB no-eviction database limit, 768 MiB service memory limit
  and one CPU quota. A mode-0700 Unix socket grants only the dedicated account
  access; no new TCP listener or writable Graphiti MCP endpoint was opened.
- A generated JSON episode passed Graphiti `EpisodicNode.save` and exact
  content/group readback, then passed readback after the database service was
  restarted. Existing Engine, Observatory and Caddy services remained active.

## Compatibility findings retained

A fresh unconstrained install selected OpenAI SDK 3.13.0 and Graphiti imports
failed because `httpx` was missing. Mixing newer FalkorDB Python with upstream's
Redis pin also failed. Applying the upstream runtime constraints resolved those
import failures; `pip check` passed.

The embedded asynchronous client's cleanup emitted an unawaited-shutdown warning.
The managed database service avoids that lifecycle path. FalkorDB Python 1.4.0's
Unix-socket cluster detector forwarded an unsupported `path` constructor argument.
The persistence fixture instead supplied its public `AsyncGraph` API with an
explicit Redis Unix-socket connection. No third-party package source was patched.
This fixture adapter is not a qualified general-purpose ingestion connection.

The privileged LXC rejects systemd mount namespaces (exit 226/NAMESPACE).
The service uses the host's documented dedicated-account compatibility pattern,
retaining no-new-privileges, an empty capability set and Unix-only address family;
host confinement was not changed.

## Remaining boundary and rollback

This is **storage staging**, not a running semantic retrieval broker. Extraction,
embedding, search, revocation, recovery and corpus benchmarks were not run on
this new instance. The model endpoint remains to be selected. The plugin keeps
native retrieval and reports export-ready/searchable=false. Prior fixture search
receipts from the adapter review do not qualify this new instance.

Stop staging with `sudo systemctl disable --now kosmos-graphiti-db.service`.
Preserve the runtime, synthetic data and receipts for review; no deletion or
shared-service rollback is needed. Re-enable only for the authorized synthetic
qualification work.
