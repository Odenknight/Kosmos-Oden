# Startup timestamp write feedback

The owner observed that Obsidian indexing and the Kosmos loading screen remained
active together. Direct HTTP MCP discovery stayed responsive; vault search
returned `provider_unavailable` or timed out at 20 seconds. A full app restart
did not recover. Starting with Kosmos disabled, allowing indexing to finish,
then enabling Kosmos restored search, retrieval and relationship queries on the
same installed `0ed5268` bundle. Timestamping was enabled; Nextcloud sync was not.

## Reproduced defects and correction

Vault create notifications during startup discovery scheduled timestamp writes
before `onLayoutReady`, even though the existing view event gate was still closed.
Both timestamp scheduling and execution now require that gate to be open. Startup
discovery is not a user edit and is not queued for a later bulk rewrite.

The old suppression deadline expired 2.5 seconds after starting a frontmatter
write. A slower write could schedule another stamp from its own modify event.
An in-flight file-object set now suppresses reentry through physical completion;
the existing trailing suppression window starts again at completion. File-object
identity also covers a rename while writing. Unload closes timestamp admission.

These defects provide a plausible feedback mechanism for the observed disk writes
and indexing failure. Tests reproduce both defects; they do not prove that every
host indexing stall has this cause. Shared read-pool contention still fails closed
and is not removed by this change. Existing sensitivity rules remain in force.

## Validation

- Both focused assertions failed by name before the implementation change.
- Both pass after the change, including later edit scheduling.
- `npm run verify`: 365 tests pass, typecheck/build and all five checks pass.
- Desktop/mobile Chromium suite: 24 cases pass.
- Live reload/startup qualification is recorded separately against the installed
  artifact hash. Direct HTTP does not qualify the native Hermes client.

Based on `codex/release-reliability` at `6d3417a`; this is a local repair candidate,
not a stable release or a claim that the reliability branch is merged into main.
