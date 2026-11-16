# v0.9.5 — MCP compatibility

Applies to the Personal Notes profile. The existing (governed) profile is
unchanged by 0.9.5.

## Revisions served

`2026-07-28` (modern), and — when **Accept older MCP clients** is on — the
initialize-era revisions `2025-11-25`, `2025-06-18` and `2025-03-26`. Protocol
metadata rules are unchanged from 0.9.0 (`MCP-Protocol-Version` header,
`params._meta` for the modern revision, `MCP_META_*` keys).

## Tool surface

`tools/list` returns exactly six tools, in this order:

```
search_notes, ask_librarian, get_note, get_related, get_lineage, vault_overview
```

- Modern revisions receive `name`, `title`, `description`, `inputSchema`,
  `outputSchema: { "type": "object", "additionalProperties": true }` and
  `annotations` (`readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true`, `openWorldHint: false`).
- Initialize-era revisions receive `name`, `description` and `inputSchema` only
  (`. /mcp-compat` reduction), as in 0.9.0.
- `ask_librarian` is read-only and idempotent in the same sense as the others:
  the same question over the same corpus revision returns the same response.

## Arguments

`ask_librarian`: `question` (string, required, ≤500 code points, ≤32 distinct
words), `limit` (integer 1–25, default 8), `format` (`both` | `brief` |
`structured`, default `both`). Unknown arguments are rejected; nothing is
coerced. MCP integers must be JSON integers; REST integers must be plain
decimal digits.

## Results

Every result carries `contract`. The five 0.9.0 tools keep
`kosmos-personal-notes/1` and their 0.9.0 fields exactly (additive changes
only). `ask_librarian` carries `kosmos-librarian/1`; its fields are documented
in [AGENT-API.md](../../AGENT-API.md#ask_librarian).

`format: "brief"` returns `results: []` and a markdown `brief`;
`format: "structured"` returns `results` with no `brief`. A client that ignores
`format` still gets the full structured answer.

## REST

`GET /librarian?question=&limit=&format=` mirrors the tool, with the same
validation and error codes. `GET /ui` serves the static page. Both are listed in
`GET /` and in `vault_overview`'s `protocols.rest`.

## Compatibility notes for 0.9.0 clients

- A client that asserted "five tools" must accept six. Nothing was removed or
  renamed.
- `search_notes` behaviour, paging and hashes are unchanged.
- A 0.9.0 client that never calls `ask_librarian` sees no difference except the
  extra tool in `tools/list` and `vault_overview`.