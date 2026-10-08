/** Audit: can each of the five verify checks actually reject a planted violation?
 *  Method per check -- record GREEN baseline, plant one realistic violation,
 *  re-run, record exit code and message, restore the file byte-for-byte, confirm
 *  GREEN again. A check that stays green under its own violation cannot fail. */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const run = (script) => {
  try {
    const out = execSync(`npm run check:${script} --silent 2>&1`, { encoding: "utf8" });
    return { exit: 0, out: out.trim().split("\n").slice(-1)[0] };
  } catch (e) {
    const out = ((e.stdout || "") + (e.stderr || "")).trim().split("\n");
    return { exit: e.status ?? 1, out: out.filter(l => /check-|FAIL/.test(l)).slice(0, 2).join(" | ") || out.slice(-1)[0] };
  }
};

const CASES = [
  {
    check: "versions",
    file: "manifest.json",
    what: "manifest.json version bumped to 0.8.4, disagreeing with KOSMOS_VERSION/package.json",
    mutate: (s) => s.replace(/"version":\s*"0\.8\.3"/, '"version": "0.8.4"'),
  },
  {
    check: "lockfile",
    file: "package-lock.json",
    what: "a git dependency's resolved ref changed from a 40-hex commit SHA to a branch name",
    mutate: (s) => s.replace(/(#)[0-9a-f]{40}/, "$1main"),
  },
  {
    check: "invariants",
    file: "src/plugin/agent-server.ts",
    what: "DEFAULT_AGENT_SETTINGS.agentEnabled flipped false -> true (Agent API on by default)",
    mutate: (s) => s.replace(/agentEnabled:\s*false/, "agentEnabled: true"),
  },
  {
    check: "renderer-provenance",
    file: "kosmos-oden-stand-alone.html",
    what: "an external CDN <script src> injected into the single-file standalone build",
    mutate: (s) => s.replace(/<\/body>/i, '<script src="https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.min.js"></script></body>'),
  },
  {
    check: "artifacts",
    file: "kosmos-mcp-stdio.mjs",
    what: "session termination reintroduced: { method: \"DELETE\" } planted in the stdio adapter",
    mutate: (s) => s + '\nconst _planted = { method: "DELETE", url: "/mcp" };\n',
  },
];

const results = [];
for (const c of CASES) {
  const before = run(c.check);
  const original = readFileSync(c.file, "utf8");
  const mutated = c.mutate(original);
  const applied = mutated !== original;
  let after = { exit: null, out: "MUTATION DID NOT APPLY" };
  if (applied) {
    writeFileSync(c.file, mutated);
    after = run(c.check);
    writeFileSync(c.file, original);
  }
  const restored = run(c.check);
  const verdict = !applied ? "INCONCLUSIVE (mutation not applied)"
    : after.exit !== 0 && before.exit === 0 && restored.exit === 0 ? "CAN FAIL"
    : after.exit === 0 ? "*** CANNOT FAIL ***"
    : "ANOMALY";
  results.push({ check: c.check, verdict, before: before.exit, planted: after.exit, restored: restored.exit, what: c.what, msg: after.out });
  console.log(`${c.check.padEnd(20)} baseline=${before.exit} planted=${after.exit} restored=${restored.exit}  ${verdict}`);
  console.log(`  violation: ${c.what}`);
  console.log(`  response : ${String(after.out).slice(0, 150)}\n`);
}

writeFileSync("../audit-results.json", JSON.stringify(results, null, 2) + "\n");
const cannot = results.filter(r => r.verdict.includes("CANNOT") || r.verdict.includes("INCONCLUSIVE"));
console.log("=".repeat(60));
console.log(`${results.filter(r => r.verdict === "CAN FAIL").length}/${results.length} checks demonstrably reject their own violation.`);
if (cannot.length) console.log("NEEDS ATTENTION: " + cannot.map(r => `${r.check} (${r.verdict})`).join(", "));
