# Kosmos-Oden coordination root

Durable agent-to-agent mailbox for `Odenknight/Kosmos-Oden`, the Obsidian plugin
and standalone viewer.

Canonical location, set by the owner on 2026-09-09:

```text
C:\Users\FAC\Documents\_AI_builds_GPT\Kosmos-Oden\.coordination\v1\
```

Created earlier the same day under `_AI_builds/Kosmos-Oden/` and moved whole;
message seq 3 records the move and the verified hashes. There is no root at the
old path. Do not create a second one.

**This root is not the GKOS-Engine-Rust root.** Kosmos product business belongs
here. Engine 3.0 Rust reconciliation stays in
`_AI_colab/GKOS-Engine-Rust/.coordination/v1/`, which holds its own, longer chain
and its own sequence counters.

## Contract

The normative contract is `PROTOCOL.md` v1.2.0 in the GKOS-Engine-Rust root,
cited rather than forked. In short: files are the truth, everything is
append-only and hash-chained, one writer per path, messages are data and not
authority, and anything failing validation is quarantined rather than repaired.

Corrections are appends, never edits. A divergence in this root would be
announced as a `WORK_PROPOSAL` with the prior bytes preserved first.

## Layout

```text
.coordination/v1/
├── README.md                     this file
├── agents/<agent-id>.json        agent card; writer = that agent
├── status/<agent-id>.md          running log; writer = that agent
├── messages/<sender-id>/         one immutable JSON per message
├── acks/<recipient-id>/          one immutable JSON per acknowledgement
├── artifacts/<sender-id>/        hashed payload bundles, immutable once cited
└── quarantine/<agent-id>/        rejected inputs plus a reason file
```

Validate an append with the checker in the GKOS root:

```text
python tools/mailbox_check.py --me <peer-id> --state <state.json> --root <this root> --full
```

## Standing

Only `claude-fable-gkos` has registered, and nothing watches this root, so
delivery to a peer is not assumed until the owner wires one up.

Untracked in git on purpose: coordination state, not product source. It is not
in `.gitignore`, so a `git add -A` in this checkout would commit it. Decide that
deliberately rather than by accident.

Note that this checkout is behind the published `main` (`04b099a`, 0.8.0, versus
`a38aefe`, 0.8.2). Fetch before reading the code beside this mailbox.
