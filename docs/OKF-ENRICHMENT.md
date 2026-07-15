# OKF+ Content-Assisted Enrichment

## What this feature does

After structural onboarding to OKF+ 2.2, **Propose OKF+ metadata from bounded
note evidence** can create pending suggestions for descriptions, note types,
tags, and explicitly evidenced relationships. It never changes note
frontmatter. The preview may be saved to `.okf/review-queue.jsonl` for a later
human or governed-agent review.

The deterministic pass always runs first. A second OpenAI-compatible local or
cloud LLM pass is optional and disabled by default.

## “Meaningful” is not an objective automation guarantee

The selector does not claim to find the author's most meaningful paragraphs.
It uses reproducible, auditable proxies:

- exclude YAML, code fences, tables, task lists, images, callouts, and common
  navigation headings;
- require minimum prose length and letter density;
- prefer explicit `supersedes`, `replaces`, `updated version of`, or
  `successor to` language;
- rank qualifying blocks with a small early-position preference; and
- enforce paragraph, per-note character, total-run character, and note caps.

Each record carries a deterministic evidence-quality score and reasons. That
score measures visible structure only. It is not semantic truth, author skill,
or permission to accept a proposal. Sparse, list-first, template-heavy, or
poorly structured notes may legitimately receive weak/insufficient results.
Automation should surface that limitation, not manufacture a purpose the
author did not express.

## LLM safety controls

The optional model is a bounded proposal generator, not an agent with write
authority:

- provider is explicitly `none`, loopback-only `local`, or HTTPS-only `cloud`;
- cloud runs require fresh confirmation showing their maximum exposure;
- confidential and PHI notes are never sent to cloud; the configurable cloud
  ceiling is otherwise public-only by default;
- the API key is read from a named environment variable and never stored in
  plugin settings or the review queue;
- notes are processed sequentially with hard note, paragraph, per-note input,
  total-run input, suggestion, response-size, output-token, and timeout caps;
- temperature is zero, tools are an empty list, no automatic retry occurs,
  failure never falls back from local to cloud, and three consecutive provider
  errors stop the second-pass run;
- note excerpts are marked untrusted and embedded instructions are not
  followed;
- output is parsed as JSON and validated against a narrow field schema;
- the model cannot propose `sensitivity`, `scope`, or `epistemic_state`;
- `supersedes` is accepted only when the cited evidence explicitly names the
  exact wikilink after replacement/version language;
- `related_to` is accepted only for a wikilink present in cited evidence; and
- no deterministic or LLM suggestion is written to frontmatter automatically.

Provider retention, account, billing, and privacy policies still apply to a
confirmed cloud run. A timeout stops waiting and prevents retry; the remote
provider may still finish a request already received.

## Review record

The JSONL record contains the source path and hash, provider/model identity,
all active caps, evidence line ranges/rules/hashes (not excerpt text), evidence
quality reasons, and every suggestion's source, confidence, reason, and cited
block IDs. Proposal IDs are content-derived and duplicate queue entries are
suppressed.

Before accepting a suggestion in any later workflow, recheck that the note hash
still matches and that relationship direction is correct. Confidence is for
review ordering only; it is never approval or epistemic authority.
