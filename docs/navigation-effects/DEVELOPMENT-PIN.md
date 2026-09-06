# Engine 2.2 development coordinate

Updated September 6, 2026 for K2 library adoption.

| Field | Value |
| --- | --- |
| Repository | Odenknight/GKOS-Engine |
| Source branch inspected | main |
| Commit | f1a95f8f3933f834eb4030f0f0d143051e6eecc2 |
| Package version | 2.2.0 candidate |
| Dependency and allowScripts | github:Odenknight/GKOS-Engine#f1a95f8f3933f834eb4030f0f0d143051e6eecc2 |
| Lock resolution | git+ssh://git@github.com/Odenknight/GKOS-Engine.git#f1a95f8f3933f834eb4030f0f0d143051e6eecc2 |
| Lock integrity | sha512-NEG6yQLGFl36B+YZDEMwXmpHqYjoqP75zOdCHeLXECVCvF94FHrOQuvuxnOgp+1ntMbaqQpSD4NmFq4gNJVdWQ== |
| Lockfile SHA256 | e540167ff166c2e3f475a8580e76163ca3f8a56483ba4f30f732be79f883d9a3 |

npm install --package-lock-only --ignore-scripts resolved the coordinate;
npm ci installed it cleanly on Windows Node 24.18.0. npm reported that Git
installation skips its integrity check, so the lock integrity is recorded
metadata, not a claim that npm verified a release signature. Source identity
is also checked by the exact commit assertions in the lock guard and tests.

The previous coordinate was 41172b91970aac869c161f4842e3526a62fd1fd9,
package 2.1.2. Its package hashes remain historical evidence in Git history;
they do not qualify this installation.

Navigation 1.0 remains read only. Effects 1.0 is experimental integration.
The public neutral adapter remains isolated from navigation-effects/node.
The Engine package includes managed MOC APIs, but Kosmos does not yet wire
the host runtime. Package adoption is not activation or service qualification.

No packaged sidecar is selected by this document. Sidecar artifact identity
and native distribution qualification are separate K2 work. Rollback restores
the previous dependency, lock, allowance, tests and documentation together;
no source-note migration is required for this library update.
