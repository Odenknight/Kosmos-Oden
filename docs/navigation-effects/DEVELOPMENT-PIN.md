# Navigation Effects development pin

Status: exact development-only integration coordinate. This is not a released
Engine 2.2 artifact, production compatibility claim, write authorization, or
release qualification.

## Exact coordinate

| Field | Value |
| --- | --- |
| Engine repository | `Odenknight/GKOS-Engine` |
| Engine branch | `integration/navigation-effects-reconciliation-20260827` |
| Engine commit | `41172b91970aac869c161f4842e3526a62fd1fd9` |
| Declared package version | `2.1.2` |
| Navigation contract | `1.0.0`, read-only |
| Navigation Effects contract | `ENGINE-NAV-EFFECTS-CONTRACT-1.0.0` |
| Effects standing | `integration-only`; Node executor experimental; GKOS conformance false |
| Kosmos dependency specifier | `github:Odenknight/GKOS-Engine#41172b91970aac869c161f4842e3526a62fd1fd9` |
| Resolved lock coordinate | `git+ssh://git@github.com/Odenknight/GKOS-Engine.git#41172b91970aac869c161f4842e3526a62fd1fd9` |
| Lock entry integrity | `sha512-GISF5ltiO9d9RiFJTdgR0VFFaE8BJntbNwi9/bWojZhLFeNQDZLxjt7/Vn7vF5NqLsspY1JDGU8NOvzbbmAkXQ==` |
| `package-lock.json` SHA-256 | `fc9618601825896ba103bb1b4c0a2a5c82f01bbd3c4a81ab5eff14be1be186a3` |
| Source-tree `npm pack --dry-run` shasum | `342368faeb5722291bcbe8dd30ba2bafdae68c28` |
| Source-tree `npm pack --dry-run` integrity | `sha512-ygyxtEydZk+fenjTPGjiP3sAX8sV44O6ANSRqUDcMbc5XIsG9DlPcIbgo+XrVIt0FWSMhprso5J6Iz9KD2Bd7w==` |

The installed package exports `gkos-engine/navigation-effects` and the
optional host-specific `gkos-engine/navigation-effects/node`. Kosmos source
must isolate framework-neutral imports behind its Engine adapter. Browser and
Obsidian bundles must never import the Node executor.

## Replacement gate

Before release qualification, replace this Git commit dependency with the
owner-authorized immutable Engine 2.2 version and integrity value. Then rerun
all cross-repository, platform, path-security, crash, recovery,
reconciliation, scale, and soak gates. Until then, every automatic write mode
remains off and the dependency must be described as experimental integration
work only.
