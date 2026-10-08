# Local-network collaboration method

Owner clarification after revision 4: JEFFREY is authorized and connected to Kosmos-Oden 0.8.2 in the owner's Obsidian vault. Treat those observations as live client evidence, with the reported caller scope and build metadata. Mailbox formatting failures do not revoke authorization or invalidate observations automatically.

The owner also directs a fresh implementation using the latest MCP protocol and latest Engine, with Hermes treated as a generic MCP client and no historical compatibility requirement. This supersedes revision 4's legacy and migration work packages as requirements for the new build. Preserve useful product features, source authorization, corpus binding, verified citations and temporal honesty. Claude owns current protocol research and README/technical documentation, then coding support. Codex maintains the implementation plans and reviews. JEFFREY supplies inside-the-vault observations and peer findings; further work is agreed explicitly to avoid duplication.

## Transport

Use one authoritative mailbox on the Windows host:

`C:/Users/FAC/Documents/_AI_builds_GPT/Kosmos-Oden/.coordination/v1/`

Claude and Codex access local files. JEFFREY accesses the same folder through the already reported SSH connection to 192.168.5.95 from R720 CT507. Verify that route from JEFFREY's host; this document does not claim an independent SSH test. Transfer payloads using SFTP or the existing authenticated SSH channel and run the sender helper on Windows. Do not interpolate message text into shell commands. No public relay, cloud mailbox, public tunnel, new inbound listener or Kosmos vault note is needed.

Messages go to all named recipients in one append; replies identify the original message_id. Each collaborator owns its own agent card, sender directory, acknowledgement directory and status. Do not write another agent's identity. Shared OS-account access is a coordination convention, not cryptographic per-agent isolation. Separate SSH accounts/ACLs would require an operator configuration change and are not claimed to exist.

The mailbox transport is local/LAN. Agents may independently use cloud-hosted models, and sending mailbox text to such a model is external processing. This method does not promise that all inference stays on the network. A strict all-processing-local requirement would additionally require qualified local model endpoints for every collaborator. Avoid placing secrets or unnecessary vault contents in coordination messages.

## Reliable publication

Reusable PowerShell helper: `_Claude-Code/codex-kosmos-mailbox/Send-Mail.ps1`.

Provide a UTF-8 JSON input file with recipients, task_id, kind, subject, body_markdown and optional in_reply_to. Invoke from the Windows project directory:

```powershell
& './_Claude-Code/codex-kosmos-mailbox/Send-Mail.ps1' -Root './.coordination/v1' -Sender 'jeffrey' -InputFile '<local payload JSON path>'
```

Use only your own registered Sender. The helper serializes same-sender writes with a create-exclusive lock, selects the next sequence, hashes the previous file's exact bytes, writes UTF-8 without a BOM, flushes a temporary file and moves it without overwrite. It never trims trailing whitespace. It creates no network connection. Its lock prevents simultaneous writers, but a process crash can leave the lock: inspect process state before an operator removes a stale lock; do not remove locks merely because a timeout elapsed. A failed send must be checked for an already-published message before retrying.

The helper creates bounded messages without artifact attachments. Larger evidence remains in immutable per-sender artifact files and needs a separately validated artifact publication path; do not claim this helper validates arbitrary attachments. It can append after an existing damaged historical chain, hashing the actual previous bytes, but does not repair or certify that history. A correction must explicitly identify the old message IDs and observed raw digests. Receivers record recovery separately while preserving originals and earlier validation results.

## Receiving and signalling

Existing 15-minute monitors are the baseline. During active collaboration, scan before starting work, when finishing work and before changing shared files. Acknowledgements distinguish receipt from acceptance of a technical claim and completion of work. A monitor checkpoint suppresses repeated alerts but never means the parent accepted or completed work.

No immediate model wake-up is claimed. A local process can later poll directory changes more frequently, but a watcher alone cannot wake a hosted model task. Near-real-time integration requires a supported local inbox/hook in each agent runtime and an observed round trip. Keep the current schedule until that integration is qualified; no new server is necessary to exchange messages now.

## Qualification and next exchange

The local sender smoke test must show two messages with exact-byte chain continuity, Unicode/newline preservation, distinct IDs and sequences, and no leftover successful-send lock. This is transport publication evidence, not a test of SSH or model delivery.

Codex sends the owner directions and this method to Claude and JEFFREY. Each recipient should reply from its own runtime naming the received message ID, the mailbox root resolved on the Windows host, and whether it can use the helper. JEFFREY should include whether its SSH path stays within the LAN; no secret values. Two independently read replies establish the initial three-party round trip. Until replies arrive, record delivery as pending, not guaranteed.

A fresh protocol design should remain separate from this coordination channel: Kosmos is the product being tested, so its MCP connection should not be the sole means of discussing an MCP failure.
