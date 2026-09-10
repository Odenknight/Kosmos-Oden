import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BS = String.fromCharCode(92);
const guardSource = readFileSync(resolve(root, "scripts/check-artifacts.mjs"), "utf8");

/** Pull the session-termination guard's own regex literal out of the checker and
 *  exercise it. Testing the shipped pattern rather than a copy is the point: the
 *  bug this guards against was `s*` where `\s*` was meant -- one missing
 *  backslash, which left the check reporting green while matching nothing a real
 *  adapter would contain. A copied pattern here would have rotted with it. */
function extractDeleteGuard() {
  const m = guardSource.match(/!(\/method:[^/]*"DELETE"\/)\.test\(source\)/);
  assert.ok(m, "session-termination guard not found in scripts/check-artifacts.mjs");
  return new RegExp(m[1].slice(1, -1));
}

test("artifact guard: session-termination check", async (t) => {
  await t.test("matches the reintroduced DELETE handler as actually written", () => {
    const guard = extractDeleteGuard();
    // How the removed code looked, and how anyone reintroducing it would write
    // it. The pre-fix `s*` pattern missed every one of these except the
    // space-free form.
    for (const sample of [
      'const _x = { method: "DELETE", url: "/mcp" };',
      '  method: "DELETE",',
      'method:  "DELETE"',
      'method:\t"DELETE"',
      'method:"DELETE"',
    ]) {
      assert.equal(guard.test(sample), true, `guard must catch: ${JSON.stringify(sample)}`);
    }
  });

  await t.test("does not fire on the adapter as shipped", () => {
    const guard = extractDeleteGuard();
    const adapter = readFileSync(resolve(root, "kosmos-mcp-stdio.mjs"), "utf8");
    assert.equal(guard.test(adapter), false, "guard fires on the clean adapter (false positive)");
  });

  await t.test("the guard uses a whitespace class, not a literal 's'", () => {
    // Regression lock on the exact defect: `s*` is a literal 's' repeated and
    // is never what this check wants. Needles are built from a char code so no
    // escaping in this file can quietly collapse them the way the bug did.
    const good = 'method:' + BS + 's*"DELETE"';
    const bad = 'method:s*"DELETE"';
    assert.ok(guardSource.includes(good), `guard must use ${BS}s*, not a bare s*`);
    assert.ok(!guardSource.includes(bad), "guard reverted to the inert bare-s pattern");
  });
});
