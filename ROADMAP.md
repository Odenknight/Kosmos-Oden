# Kosmos-Oden roadmap

**Ecosystem role:** active reference end-user application and Obsidian
integration. Kosmos-Oden consumes
[GKOS-Engine](https://github.com/Odenknight/GKOS-Engine); it does not redefine
GKOS governance or GKX exchange contracts.

## Current line

- Keep shared parsing, validation, projection, graph, and export behavior in the
  upstream engine.
- Maintain the Obsidian host, visualization, governed workflows, Agent API,
  release assurance, and end-user documentation here.
- Preserve offline and read-only defaults; require explicit, reviewable
  workflows for writes and authoritative dispositions.
- Publish engine-version compatibility and reproducible release evidence.

### Current visual identity and qualification

The modern MCP endpoint is stateless. Server-issued visual identifiers are keyed
by the cleaned client/display name; `agent_name` can supply the designated label.
They are separate from authentication and write authority. Old per-session
`Mcp-Session-Id` descriptions are historical and must not guide new clients.

Startup/indexing, link visibility, trail timing, idle fade and galaxy spacing
fixes are on main. Proposal and human-decision sidecars require explicit review;
automatic MOC writes remain disabled. Bounded cached body search, a mailbox audit
and a Lite migration guide are available. Consumer coordinator fixtures cover
rename/overflow, denied recovery, concurrent intent and corrupt intent rejection.

Local Windows Obsidian and direct MCP evidence exists. Browser tests cover
Chromium, mobile Chromium, Firefox and WebKit. Native Hermes acceptance,
independent hardware GPU evidence and complete profile qualification remain
separate gates. See [branch and data dispositions](docs/reviews/2026-09-12-branch-disposition.md).

### Historical 0.9.0 Personal Notes candidate

The following describes the original candidate. The [released 0.9.5 capabilities](TECHNICAL_README.md#capability-index) include six Personal Notes tools, the Librarian, managed folder indexes and optional semantic search.

The Personal Notes profile, Importer-guided onboarding, worker search,
optional deterministic tags, five read-only tools with exact paged reads,
dual-era MCP and Quick Connect for this or another computer are built and
pass automated checks. Owner trials remain open (real Keep and OneNote
imports, real MCP client applications, a second machine, the archive in a
clean vault, measurements inside Obsidian); see
[_archive/docs/v0.9.0/ALPHA-TEST.md](https://github.com/Odenknight/Kosmos-Oden/blob/e20b1b7dbd7fb2aee3abfc525e518312970d37d9/_archive/docs/v0.9.0/ALPHA-TEST.md).

Later work, not in 0.9.0: OCR and handwriting transcription, embeddings or
semantic search, live or two-way sync with source apps, Apple Notes and
Evernote qualification, and an inverted or persistent search index (only if
measurements on a larger corpus require it).

## Next

### Easier setup and optional services

- **Local first use (0.9.6).** E-Z setup opens a word-based Librarian over the user's Markdown notes with no extra download. Users can try a real question and open the source before deciding whether to connect an assistant, add tags, or sync. Check this path in a fresh vault and after a plugin reload.
- **Sync coverage.** Nextcloud WebDAV is available today. S3-compatible storage is the next planned integration. Dropbox, OneDrive and Google Drive are candidates. Qualify conflict handling, recovery and credential storage for each provider before listing it as available.
- **Possible paid service (exploratory).** Explore whether users would pay for managed sync across additional providers or for an assistant to prepare scheduled reading briefs and propose tags for review. Keep the local Librarian usable independently. Before committing to a service or price, test demand and operating cost, and show users which folders, passages and credentials each service needs. Any proposed note edits still require review.

### Engineering priorities

- Replace any remaining vendored or duplicated active-core behavior with
  versioned GKOS-Engine consumption where technically feasible.
- Add cross-repository compatibility fixtures for GKX contracts and engine
  releases.
- Expose proposal/review workflows without permitting automatic authoritative
  writes or sensitivity lowering.
- Keep product claims distinct from GKOS conformance and certification claims.
- Maintain a documented migration path from Kosmos-Oden Lite without requiring changes
  to the substance of compatible notes.
- Close the stable visual-identity successor's hosted browser, GPU, and live
  request-to-render gates without treating renderer identity as authentication
  or effect authority.

## Coordination gates

1. GKX contract changes originate in `gkos-standard`.
2. Shared deterministic changes originate in `GKOS-Engine`.
3. Kosmos-Oden adopts a released engine and records compatibility evidence.
4. Product-only UX and Obsidian changes remain here.
5. Kosmos-Oden Lite is not kept at feature parity; only its permitted maintenance
   backports are coordinated separately.

## Out of scope

- Redefining the standard or exchange contract.
- A second copy of the canonical active engine.
- Treating product release status as GKOS certification.
- New feature work in the frozen Kosmos-Oden Lite line.
