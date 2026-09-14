# Windows private history qualification

The local intermittent `HISTORY_STORAGE_UNAVAILABLE` refusal has a directly observed privacy failure. In the fourth bounded diagnostic trial, the initial database creation, write, and capability checks succeeded. Reopening failed when the protected directory contained an additional explicit read/execute grant. The retained fixture ACL identified that principal as `CodexSandboxUsers`, alongside the intended current user, SYSTEM, and Administrators. The diagnostic returned shared-directory rejection, status 91, without a timeout.

This establishes the reason for that observed refusal. It does not identify the process that added the grant or establish the cause of every historical failure. Production ACL validation remains unchanged and must continue refusing this directory.

Private evidence: `native-history-v6-trial-4-20260914.log`, SHA-256 `7e81d76b6ee75218b448aafb9b199cdb26826d6d0dd9677a11871ec727625a78`, and the retained synthetic fixture ACL. Trials 1–3 passed; trial 4 failed and stopped the bounded diagnostic. Earlier failures remain preserved.

The Windows CI job runs the existing focused database tests using the default PowerShell checker, the built executable checker, and the built Node-API checker. Separate profiles activate their conditional test branches, including executable modification and Node-API replacement checks. It reuses the existing Visual C++ build and vendored Node-API headers. Hosted results are pending; adding the job is not qualification evidence.

This job qualifies the storage component only. Installed Obsidian acceptance, production enablement, other native integration gates, and deferred macOS qualification remain open.

## Hosted database creation failure and correction

Hosted run `34830579636` at `812b655` failed five of eleven tests. A bounded read-only diagnostic found current-user ownership rejection on the existing database; directory and file canonical checks and the single-link check passed. The prior directory-only diagnostic passed. This differs from the separately observed local extra-grant failure.

Database initialization now uses Windows PowerShell's existing .NET `FileStream` overload with `CreateNew`, an explicit current-user owner, and a protected file ACL limited to current user, SYSTEM, and Administrators. Ownership is set atomically when the file is created. Existing files are never repaired or overwritten. All subsequent ownership, path, link, authority, and live-capability checks remain in force. This adds one PowerShell launch at initialization, including when steady-state ACL checks use the native helper.

The new protected-ACL assertion fails against the unchanged pre-fix source (`false !== true`). The coordinator's corrected-source run passed creation, ownership, reopening, exclusive preservation, and the other assertions except one initial-open refusal in the linked-journal fixture: 11 passed, 1 failed. That failure remains recorded and is not attributed without direct evidence. A separate coordinator run of the two changed creation tests passed 2/2. The subagent also reported a 12/12 local pass, but these results do not substitute for the pending hosted run or close native acceptance. Helper-installation ownership has its own unchanged admission checks.
