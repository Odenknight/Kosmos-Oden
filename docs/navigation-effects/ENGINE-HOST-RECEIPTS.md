# Engine to host receipt mapping

`src/navigation-effects/engine-host-receipts.ts` maps the new Engine recovery
inspection and shutdown results to the existing Kosmos host contract.
It imports no Node executor and performs no filesystem or recovery operation.
The production host adapters are not yet connected to these mappings.

`mapEngineRecoveryInspection(profile, result)` validates the Engine report,
recomputes its digest, and returns both the Engine digest and Kosmos inspection.
Keep this complete binding together. The Kosmos inspection digest covers its
fields, excluding its own digest, plus `engineInspectionDigest`. This prevents
two reports with identical classifications but different journal evidence from
sharing the same host binding. The Engine digest is the value passed to
`recoverInspected`; it is never an authorization grant.

An empty result is classified as safe to inspect. Pending work requires action.
Ambiguous or conflicting results are blocked. Every mapped inspection keeps
`engineWriteCapabilityMayEnable` and `automaticWriteEnabled` false.
Neither a classification nor a digest enables source writes.

`mapEngineShutdownResult(profile, result)` preserves complete, blocked, and
deadline-exceeded states. A complete result requires verified checkpoint and
lease release. Lease release without checkpoint verification is rejected.
The receipt digest covers all receipt fields except itself.

Both mappings reject unknown fields, malformed digests, source-bearing payloads,
invalid reason codes, and contradictory states. Recovery mapping also rejects
duplicate effect identities and inspection results that claim write authority.
Hidden and symbol-keyed fields are also rejected. Arrays must be ordinary,
dense data arrays without custom fields or iterators. The reader copies property
descriptors before validation and never invokes record or array getters. This is
a data-schema boundary, not a sandbox for arbitrary JavaScript proxies.
Returned evidence is copied and frozen. The functions reuse the existing
canonical JSON and Web Crypto digest implementation.

Unit checks cover digest binding, changed journal identities, refusal cases,
input mutation, completion contradictions, and browser-safe imports. A separate
synthetic check used a real Engine instance at the Effects branch's `b609c11`
revision for empty-vault inspection and completed shutdown. This does not prove
live recovery, native installation, policy binding, or complete host execution.

Next, retain the binding in the configured host instance, resolve the actor and
current grant independently, and connect the inspection-bound Engine operation.
Source snapshots, path-safety receipts, prepared handles, and durability gates
must also be supplied before the native adapter can report execution available.


The consumer pin now includes Engine `c8a6348`. The repository test imports the
installed `gkos-engine/navigation-effects/node` package and maps its actual
empty-vault inspection and completed shutdown. Earlier checks against a sibling
Engine checkout remain historical evidence. The native adapter now identifies
missing host bindings instead of claiming that the new Engine APIs are absent.
Its capabilities and every production operation remain unavailable until the
complete host authority, path-safety and durability contract is implemented.
