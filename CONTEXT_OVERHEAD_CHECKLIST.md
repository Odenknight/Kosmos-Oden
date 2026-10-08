# Context overhead checklist (re-run each session/update)

Goal: minimize fixed per-message token overhead shown in `/context`.

## What is NOT locally editable (verified 2026-07-28)
- **System prompt** (~9.8k tok) — baked into the Claude Code app itself. No CLAUDE.md,
  settings.json, or project file contributes to it. Not reducible from a session.
- **MCP tool schemas** (Claude_Browser, claude-in-chrome, visualize, mcp-registry,
  scheduled-tasks, ccd_session*) — connected at the account/connector level, not via
  any local `mcpServers` config. Checked `~/.claude.json` (`mcpServers` key doesn't
  exist) and the project entry (`mcpServers: {}`, `enabledMcpjsonServers: []`,
  `disabledMcpjsonServers: []`) — both empty, confirming these aren't project-scoped.
- **Skills list** (~3.5k tok) — comes from installed plugins (`cowork-plugin-management`,
  `anthropic-skills`). No local plugin config file found under `~/.claude/`.

## Actual levers (must be done in the Claude app UI, not via file edit)
1. **Disconnect unused MCP connectors** — if `claude-in-chrome`, `mcp-registry`, or
   `scheduled-tasks` aren't used in this project, disconnect them in the app's
   Connectors/Settings UI. Cuts MCP tools + MCP tools (deferred) rows.
2. **Uninstall/disable unused plugins** — if `cowork-plugin-management` isn't needed,
   remove it to drop its skills from the per-message skill list.
3. Re-run `/context` after any change to confirm the drop.

## What agents should do each session
- Run `/context` first to see current fixed overhead.
- If asked to "reduce the system prompt," explain it's not file-editable (per above)
  and redirect to the connector/plugin levers instead — don't fabricate a fix.
- Re-verify this checklist's claims (`.claude.json` structure, plugin dirs) since
  Claude Code updates may change what's configurable locally.
