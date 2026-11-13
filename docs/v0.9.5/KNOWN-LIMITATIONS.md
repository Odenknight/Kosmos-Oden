# v0.9.5 — known limitations

## The Librarian (`ask_librarian`, `GET /librarian`, `/ui`)

- **Lexical, not semantic.** There is no embedding model, so a question that
  shares no words with the right note will not find it. On the owner's vault
  (~3.9k notes) a paraphrase such as "sharing a graphics card with containers"
  returns lexically plausible but often wrong notes. `confidence` is the honest
  signal: `weak` means the top note does not carry the question's rarest words
  in its title, aliases, tags or file name, and `none` means no note matched.
- **A sentence is no longer an AND filter**, which raises recall and lowers
  precision compared with `search_notes`. Use `search_notes` for exact words or
  a tag; use `ask_librarian` when the question is a sentence and you want
  passages, steps and links.
- **Stemming is deliberately shallow**: plurals, `-ly`, `-ing`, `-ed`, `-ation`,
  `-ion` and a final `e`. Irregular forms (`ran` / `run`) do not meet. There are
  no synonyms beyond what the notes themselves share.
- **Typos are only corrected for words absent from the corpus** (edit distance
  1–2, same first letter, at least four characters, no digits). A typo that
  happens to exist as a word elsewhere is not corrected.
- **Passages scan the first 200 000 characters** of a note; text beyond that is
  never quoted, though it is still indexed for matching.
- **Forms are detected heuristically**: known form hosts, or wording such as
  request / apply / sign-up / order / booking in the link text or its line. An
  unusual form service is reported as `link`, and a link in prose that merely
  mentions "request" may be flagged `form`.
- **Expansion can add noise.** Pseudo-relevance feedback helps recall, but a top
  hit that is off-topic can seed off-topic words. Expansion terms are weighted
  below the caller's own and are reported in `expanded`.
- **One corpus per scope**: the first question in a new policy generation
  recomputes document frequencies for that scope (milliseconds, not seconds, at
  3.9k notes). Very large vaults will see the cost grow linearly.
- **No OCR, PDFs or images**: only Markdown is searched; attachments stay
  references. The Python prototype covered PDF pages and OCR.

## `/ui`

- The page keeps the access token in `sessionStorage` for the tab; it is the
  same bearer token agents use. Serve it over loopback or a trusted network, and
  rotate the token if the machine is shared.
- It is a search box, not a note reader: it renders the brief, and note paths
  are text, not clickable vault links. Open the note in Obsidian.
- Plain HTTP, like the rest of the Personal listener.

## The MoC generator

- **One folder per run, Markdown only**, and the vault root (`""` or `"/"`) is
  refused. Notes include subfolders only with `recursive`.
- **A file without the managed block is refused**, never adopted, so a
  hand-written index is safe but also never taken over. Deleting either marker
  line makes the file unmanaged.
- **Index-like base names are never listed**: `index`, `_index`, `readme`, `moc`,
  `contents` (any case), because that is usually the MoC itself or a README.
- **Over 2 000 listed notes refuses** (`too_many_notes`) rather than truncating.
- Summaries come from authored frontmatter only (`summary`); there is no
  generated summary, so entries are one line of title plus optional summary.
- Aliases and tags reach the generator but the v1 layout does not render them.

## Both

- Determinism is per corpus revision and per input. A note changing between two
  runs changes the output; that is the point, not a bug.
- No feature writes on behalf of the Librarian. Only the MoC command writes, and
  only inside its managed block.