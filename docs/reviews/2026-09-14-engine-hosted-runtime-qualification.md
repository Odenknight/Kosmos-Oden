# Engine hosted runtime qualification

Engine candidate `3ed9127fa01685c113470e79f013bde56f1a8441` completed [runtime run 34833599603](https://github.com/Odenknight/GKOS-Engine/actions/runs/34833599603) successfully. The executed PR merge was `a8ca0d71c8b8ffc7a1932cb01c984f365142f709`; its tree `155bb7cd05c4338cc47236782ce401891c848910` equals the candidate tree. The coordinator verified all six source-snapshot hashes and all twelve raw build/test log hashes, including the reported test counts.

| Host | Node | Passed / total | Failed / skipped | Receipt SHA-256 |
| --- | --- | --- | --- | --- |
| Ubuntu 24.04 | 22.23.2 | 1219 / 1219 | 0 / 0 | `b55e5c6bedac57de1a9b3f5347ee46c5b8ac693e2302942561e961ef37ef7e81` |
| Ubuntu 24.04 | 24.20.0 | 1219 / 1219 | 0 / 0 | `786e6696eeed27b49e13570521cffe284b49260c4c3413a1fea2e56586d87f0a` |
| Ubuntu 24.04 | 26.8.2 | 1219 / 1219 | 0 / 0 | `76056458103864354ba8561b0e47a2a0209af6e388684977f9ce2c74b8ad2d33` |
| Windows | 22.23.2 | 1216 / 1216 | 0 / 0 | `601e980916c7a6a62e7c18dbc5eaf7f3320ded3b03cc72e1bd6f35d500d5ad26` |
| Windows | 24.20.0 | 1216 / 1216 | 0 / 0 | `9e7cc7350a085d9c85193ffe8eb98d0c58378be17d2100d469c68c9ad5c259cd` |
| Windows | 26.8.2 | 1216 / 1216 | 0 / 0 | `417ca3f3f8fb78ce38d3f24f31dcba89a31da08bc99210193c147ca75fbbf3cd` |

Node 22 and 24 are blocking runtime lanes; Node 26 remains informative. Ubuntu coverage is not native Debian acceptance. Historical replay jobs are separate from current-platform qualification, including the deferred native macOS gate.

Earlier failures remain preserved. Candidate `23ae00b` passed Linux but failed ten Windows tests per lane because positive fixtures encountered short temporary-path aliases. Candidate `d06dbf8` used canonical workspace temp paths and left one failure per Windows lane: that volume did not expose the required distinct 8.3 alias. The final candidate canonicalizes temporary paths on the original temporary volume. Production path guards and deliberate alias-rejection tests remain unchanged.

This evidence supports the candidate consumer dependency update from `13ff119` to `3ed9127`. It does not erase the older Node 22 failure, qualify installed Kosmos artifacts, enable production history or effects, establish the indexing speed target or soak, complete Rust, or authorize a main merge. Every runtime receipt still records `release_qualified: false`.

Kosmos consumer verification with the updated pin passed all 633 tests, with zero failures or skips, and the full required verification chain. Raw log SHA-256: 38fb00e49961a9a059ae566560fd4346e490f9cb27df51a58c9bc09bed3ebdd7. Independent Terra review confirmed matching package, lock, allowScripts, installed hidden-lock, guard and test identities, with no unrelated dependency or security-assertion changes.

The updated consumer also passed the complete four-browser suite: 246 checks, with two declared platform context-loss skips, in 2.1 minutes. Snapshot updates were disabled. Raw log SHA-256: 55bc16e052186693d28909e28e020250fa8c3508c92a1cddf614d627557a828b. Installed native acceptance remains separate.
