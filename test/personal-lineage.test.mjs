// Personal Notes 0.9.0 — supersession lineage adapter (T07).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lineageView, checkSupersedesProposal, lineageLinkText, planTagging, PersonalError } from "../dist/kosmos-personal-notes.mjs";
import { parseFrontmatter, formatTimestamp } from "../dist/kosmos-core.mjs";

const n = (path, supersedes = [], supersededBy = [], extra = {}) => ({ path, supersedes, supersededBy, ...extra });
/** Resolve by base name or full path (without .md), like a tiny link resolver. */
function resolverFor(paths, extra = {}) {
  return (text) => {
    if (text in extra) return extra[text];
    const hits = paths.filter((p) => p.replace(/\.md$/, "") === text || p.replace(/\.md$/, "").split("/").pop() === text);
    return hits.length === 1 ? hits[0] : hits.length > 1 ? "ambiguous" : null;
  };
}

test("explicit supersedes builds an edge; reverse is derived for display only", () => {
  const notes = [n("Plans/New.md", ["[[Plans/Old]]"], [], { uid: "u-new", updatedAt: "2026-11-12T10:00:00Z" }), n("Plans/Old.md")];
  const before = JSON.stringify(notes);
  const view = lineageView(notes, resolverFor(notes.map((x) => x.path)), { focus: "Plans/Old.md" });
  assert.deepEqual(view.edges, [{ from: "Plans/New.md", to: "Plans/Old.md", source: "declared" }]);
  const old = view.nodes.find((x) => x.path === "Plans/Old.md");
  assert.deepEqual(old.supersededBy, ["Plans/New.md"]);
  assert.deepEqual(view.heads, ["Plans/New.md"]);
  assert.equal(view.nodes[0].path, "Plans/Old.md", "focus first");
  assert.equal(view.nodes[1].uid, "u-new");
  assert.equal(JSON.stringify(notes), before, "inputs (and so the older note) are never modified");
});

test("authored reverse declarations are preserved; contradictions flagged", () => {
  const notes = [n("A.md"), n("B.md", [], ["[[A]]"])];
  const view = lineageView(notes, resolverFor(["A.md", "B.md"]), { focus: "A.md" });
  assert.deepEqual(view.edges, [{ from: "A.md", to: "B.md", source: "reverse" }]);
  const contra = [n("A.md", ["[[B]]"], ["[[B]]"]), n("B.md")];
  const v2 = lineageView(contra, resolverFor(["A.md", "B.md"]), { focus: "A.md" });
  assert.equal(v2.contradictions.length, 1);
  assert.equal(v2.contradictions[0].path, "A.md");
  assert.deepEqual(v2.cycles, [["A.md", "B.md"]]);
});

test("branches report multiple heads; newest timestamp is not picked as the truth", () => {
  const notes = [n("Old.md"), n("X.md", ["[[Old]]"], [], { updatedAt: "2026-01-01T00:00:00Z" }), n("Y.md", ["[[Old]]"], [], { updatedAt: "2026-12-01T00:00:00Z" })];
  const view = lineageView(notes, resolverFor(notes.map((x) => x.path)), { focus: "Old.md" });
  assert.deepEqual(view.heads, ["X.md", "Y.md"]);
});

test("cycles, self-links, ambiguous, unresolved and hidden targets", () => {
  const paths = ["A.md", "B.md", "C.md", "dir1/Dup.md", "dir2/Dup.md"];
  const notes = [n("A.md", ["[[B]]", "[[A]]", "[[Dup]]", "[[Missing]]", "[[Hidden]]"]), n("B.md", ["[[C]]"]), n("C.md", ["[[A]]"]), n("dir1/Dup.md"), n("dir2/Dup.md")];
  const view = lineageView(notes, resolverFor(paths, { Hidden: "Private/Secret.md" }), { focus: "A.md" });
  assert.deepEqual(view.cycles, [["A.md", "B.md", "C.md"]]);
  assert.deepEqual(view.unresolved.map((u) => [u.declared, u.reason]), [["[[A]]", "self"], ["[[Dup]]", "ambiguous"], ["[[Hidden]]", "unresolved"], ["[[Missing]]", "unresolved"]]);
  assert.ok(!JSON.stringify(view).includes("Secret"), "a target outside the visible notes never appears");
  assert.deepEqual(view.heads, [], "a pure cycle has no head");
});

test("bounded pages with a stable opaque cursor and deterministic order", () => {
  const notes = [n("N0.md")];
  for (let i = 1; i < 7; i++) notes.push(n(`N${i}.md`, [`[[N${i - 1}]]`]));
  const resolve = resolverFor(notes.map((x) => x.path));
  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = lineageView(notes, resolve, { focus: "N3.md", limit: 2, cursor });
    assert.ok(page.nodes.length <= 2);
    seen.push(...page.nodes.map((x) => x.path));
    assert.deepEqual(lineageView(notes, resolve, { focus: "N3.md", limit: 2, cursor }), page, "same input, same page");
    cursor = page.nextCursor;
    assert.equal(page.truncated, cursor !== null);
    pages++;
  } while (cursor);
  assert.equal(pages, 4);
  assert.deepEqual(seen, ["N3.md", "N2.md", "N4.md", "N1.md", "N5.md", "N0.md", "N6.md"]);
  const first = lineageView(notes, resolve, { focus: "N3.md", limit: 2 });
  assert.throws(() => lineageView(notes, resolve, { focus: "N3.md", limit: 2, cursor: "garbage" }), (e) => e instanceof PersonalError && e.code === "invalid_argument");
  assert.throws(() => lineageView(notes.slice(0, 6), resolve, { focus: "N3.md", limit: 2, cursor: first.nextCursor }), (e) => e.code === "invalid_argument", "lineage changed");
  assert.throws(() => lineageView(notes, resolve, { focus: "N3.md", limit: 201 }), (e) => e.code === "invalid_argument");
  assert.throws(() => lineageView(notes, resolve, { focus: "N3.md", limit: 1.5 }), (e) => e.code === "invalid_argument");
  assert.equal(lineageView(notes, resolve, { focus: "N3.md" }).nodes.length, 7);
  assert.deepEqual(lineageView(notes, resolve, { focus: "Nope.md" }).nodes, []);
});

test("works on partial Personal metadata without any GKX envelope", () => {
  const view = lineageView([{ path: "a.md", supersedes: ["b"], supersededBy: [] }, { path: "b.md", supersedes: [], supersededBy: [] }], resolverFor(["a.md", "b.md"]), { focus: "a.md" });
  assert.equal(view.edges.length, 1);
  assert.equal(lineageLinkText("[[Plans/Old#Heading|alias]]"), "Plans/Old");
});

test("checkSupersedesProposal rejects self, cycle, ambiguous, unresolved; similarity is not evidence", () => {
  const paths = ["A.md", "B.md", "x/Twin.md", "y/Twin.md", "Plan v2.md", "Plan.md"];
  const notes = [n("A.md"), n("B.md", ["[[A]]"]), n("x/Twin.md"), n("y/Twin.md"), n("Plan v2.md", [], [], { updatedAt: "2026-11-12T00:00:00Z" }), n("Plan.md")];
  const resolve = resolverFor(paths);
  assert.equal(checkSupersedesProposal("A.md", "A", notes, resolve).reason, "self");
  assert.equal(checkSupersedesProposal("A.md", "B", notes, resolve).reason, "cycle");
  assert.equal(checkSupersedesProposal("A.md", "Twin", notes, resolve).reason, "ambiguous");
  assert.equal(checkSupersedesProposal("A.md", "Nothing", notes, resolve).reason, "unresolved");
  assert.equal(checkSupersedesProposal("A.md", "  ", notes, resolve).reason, "empty");
  assert.equal(checkSupersedesProposal("A.md", "Hidden", notes, resolverFor(paths, { Hidden: "Private/h.md" })).reason, "unresolved");
  assert.equal(checkSupersedesProposal("Plan v2.md", "Plan v", notes, resolve).reason, "unresolved", "a similar title is not a target");
  assert.deepEqual(checkSupersedesProposal("Plan v2.md", "Plan", notes, resolve), { ok: true, target: "Plan.md", link: "[[Plan]]", alreadyDeclared: false });
  assert.equal(checkSupersedesProposal("B.md", "[[A]]", notes, resolve).alreadyDeclared, true);
});

test("planner routes supersession through the checks; requests in one plan cannot form a cycle", () => {
  const sha = (t) => createHash("sha256").update(t).digest("hex");
  const parse = (y) => parseFrontmatter(`---\n${y}\n---\n`).data;
  const raw = { "A.md": "a", "B.md": "b" };
  const notes = Object.entries(raw).map(([path, r]) => ({ path, raw: r, hash: sha(r) }));
  const lineage = [n("A.md"), n("B.md")];
  const plan = planTagging({
    notes, options: { timestamps: false, uniqueIds: true, supersession: true }, proposalTimeMs: Date.UTC(2026, 10, 12),
    newUid: (() => { let i = 0; return () => `019a72b0-0000-7000-8000-00000000000${++i}`; })(), formatTimestamp, parse,
    supersedes: { notes: lineage, resolve: resolverFor(["A.md", "B.md"]), requests: [{ path: "A.md", target: "B" }, { path: "B.md", target: "A" }, { path: "A.md", target: "A" }, { path: "Other.md", target: "A" }] },
  });
  assert.deepEqual(plan.findings.map((f) => [f.path, f.reason]), [["B.md", "cycle"], ["A.md", "self"], ["Other.md", "not_selected"]]);
  const a = plan.notes.find((x) => x.path === "A.md");
  assert.equal(a.proposedRaw, "---\nuid: \"019a72b0-0000-7000-8000-000000000001\"\nsupersedes:\n  - \"[[B]]\"\n---\na");
  const b = plan.notes.find((x) => x.path === "B.md");
  assert.ok(!b.proposedRaw.includes("supersedes"), "B gets only its own selected uid, no lineage write");
});
