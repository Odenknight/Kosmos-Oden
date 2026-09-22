# Terminal traversal denial survives callback failure

PR 41 preservation review identified a regression in the current consumer:
the 401/403 traversal branch marked itself closed after invoking callbacks.
If either callback threw, the reconnect catch could schedule another request
with the rejected credential. The historical PR closed and aborted first.

The correction sets `closed` and aborts the request before invoking either
callback. It preserves existing error text and explicit reconnection behavior.

Four regressions cover 401/403 with throwing `onError` and `onState` callbacks.
Against the preserved pre-fix bundle, all four failed because two requests
occurred instead of one. After rebuilding, the complete API-feed file passed
31 tests with no failures, skips or cancellations. Type checking passed.
These checks do not qualify the full consumer or resolve the separate Windows
history instability.

Private evidence is retained under the parent workspace's `_Claude-Code/`:

| Evidence | SHA-256 |
| --- | --- |
| Pre-fix `dist/kosmos-api-feed.mjs` | `a35dabc71b89184792dd08d589affbce873a83f1e760b0e6cb57568da9744da6` |
| `sse-denial-before-20260914.log` | `ad11ad98d5014ed1bd7b8a6aa9581ff25525a08b5f645620632a92023739c6d2` |
| `sse-denial-build-20260914.log` | `fc7c9bd10816e662e6ef95f2070919889178f2d9ddf740a2516856a4bfb9e999` |
| `sse-denial-after-20260914.log` | `8f7eee719d6fbcb13ef556f18d56c11c46a221babbd6e94ceb06ddb62adfecbd` |

The initial static review was independent of the author; the author then
verified the baseline failures and corrected test result. No historical PR,
branch or original evidence was deleted or closed by this fix.
