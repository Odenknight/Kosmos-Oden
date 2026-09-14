# Windows private history qualification

The local intermittent `HISTORY_STORAGE_UNAVAILABLE` refusal has a directly observed privacy failure. In the fourth bounded diagnostic trial, the initial database creation, write, and capability checks succeeded. Reopening failed when the protected directory contained an additional explicit read/execute grant. The retained fixture ACL identified that principal as `CodexSandboxUsers`, alongside the intended current user, SYSTEM, and Administrators. The diagnostic returned shared-directory rejection, status 91, without a timeout.

This establishes the reason for that observed refusal. It does not identify the process that added the grant or establish the cause of every historical failure. Production ACL validation remains unchanged and must continue refusing this directory.

Private evidence: `native-history-v6-trial-4-20260914.log`, SHA-256 `7e81d76b6ee75218b448aafb9b199cdb26826d6d0dd9677a11871ec727625a78`, and the retained synthetic fixture ACL. Trials 1–3 passed; trial 4 failed and stopped the bounded diagnostic. Earlier failures remain preserved.

The Windows CI job runs the existing focused database tests using the default PowerShell checker, the built executable checker, and the built Node-API checker. Separate profiles activate their conditional test branches, including executable modification and Node-API replacement checks. It reuses the existing Visual C++ build and vendored Node-API headers. Hosted results are pending; adding the job is not qualification evidence.

This job qualifies the storage component only. Installed Obsidian acceptance, production enablement, other native integration gates, and deferred macOS qualification remain open.
