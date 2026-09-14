# Engine native UTF-16 validation candidate

The development dependency advances from `3ed9127fa01685c113470e79f013bde56f1a8441`
to `a6ab4764ba858a1af07333311337230f3a1d4f29`. This replaces the manual UTF-16
scan with `String.isWellFormed`; exact canonical bytes, rejection text and
authority checks remain unchanged. No cache or dependency was added.

The candidate tree is `544e8d48bfe6de9b5d02f4cae11c7ff87b31a5fe`.
Independent review and the added exhaustive single-code-unit regression passed.
[Hosted runtime run 34842144485](https://github.com/Odenknight/GKOS-Engine/actions/runs/34842144485)
completed successfully against that exact commit and tree:

| Runtime | Tests passed | Skips |
| --- | ---: | ---: |
| Windows Node 22.23.2, 24.20.0, 26.8.2 | 1,217 per lane | 0 |
| Ubuntu Node 22.23.2, 24.20.0, 26.8.2 | 1,220 per lane | 0 |
| Native Windows Node 24.18.0 | 1,217 | 0 |
| Native Debian 13.5, Node 24.21.0 | 1,220 | 0 |

The coordinator independently verified all 704 committed source-file hashes,
source snapshot digests, raw logs and counts for the six hosted lanes and both
Debian attempts. Node 26 is informative. Historical macOS replay does not
qualify the current native macOS product.

The first Debian attempt retained four failures because its fixed PATH omitted
`python`. The existing CPython 3.12.14 environment resolved all four focused
cases and the fresh full run without source or assertion changes. The passing
receipt SHA-256 is `1ae906e807e884de4affdc6357d9b13d972d10349723bb8a38c0095f345bd459`;
its raw test log is `ab9e13ac226fcc151d78e9bcebf22aa08424d7361778927d67472059d682d7cc`.
The failed receipt remains `aec67d3d3dae7f1ecc53101574740837162e6a324ef3acfbb27b8de774238577`.
This is not Python 3.11 qualification.

Five alternating watcher pairs measured median edit latency of 10,788.153 ms
before and 10,306.022 ms after. Candidate latency was lower in all five pairs;
median paired latency difference was -466.756 ms and RSS difference -2.871 MiB.
All ten runs still failed the 2,000 ms budget. The comparison receipt SHA-256 is
`6e5f451ad44cff0aec4a261edf4a58a2375be0806c1e821fc35d211fe2fae2e5`.
This bounded synthetic comparison does not qualify scale, soak or release.

## Installed package boundary

The lockfile resolves the exact commit with integrity
`sha512-yHR8V8ZCFoaaNzrmC+vhugv36zRxA4J0jf+kPuWi5vQJNPTZiobQz+Dg1OVq7Un38s4X8jqvSbfPhFxHgZ/fnQ==`.
The installed Windows package has 652 files: 646 match the qualified checkout's
source/build bytes exactly. Its separately compiled native guard differs only
at the COFF and debug-directory timestamp fields; the other differences are
that guard's content-addressed filename, two manifests and three embedded hash
references. Those raw identities and both binaries are retained. The input
source/header hashes match and every installed bundle digest was checked.
This is evidence of the observed difference, not byte-for-byte reproducibility.
Native reproducible-build qualification remains open.

The [changed consumer's integration checks](2026-09-14-effects-inspection-consumer.md)
are recorded separately against its exact signed commit. This
development pin does not alter installed plugin bytes, enable source effects,
close deferred macOS or other release gates, or authorize a main merge.
