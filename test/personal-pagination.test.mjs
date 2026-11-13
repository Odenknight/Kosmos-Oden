/** Personal Notes exact pages and hashes, contract kosmos-personal-notes/1 (0.9.0): acceptance row R01. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PersonalError, isSha256Hex, readPage, sha256Hex, slicePage, splitsSurrogatePair } from "../dist/kosmos-personal-notes.mjs";

const code = (c) => (e) => e instanceof PersonalError && e.code === c;
const nodeSha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

async function readAll(raw, limit) {
  const pages = [];
  let page = await readPage(raw, { limitChars: limit });
  pages.push(page);
  while (page.truncated) {
    page = await readPage(raw, { offsetChars: page.next_offset_chars, limitChars: limit, expectedHash: page.content_hash });
    pages.push(page);
  }
  return pages;
}

const NOTE = "---\r\ntitle: Café\r\ntags: [a]\r\n---\r\nLine one 😀 two 𝄞\r\n\r\n- [ ] x 😀😀\r\nend";

test("SHA-256 is over the raw string's UTF-8 bytes", async () => {
  for (const s of ["", "abc", NOTE, "Café"]) assert.equal(await sha256Hex(s), nodeSha(s));
  assert.equal(await sha256Hex(new TextEncoder().encode("abc")), nodeSha("abc"));
  assert.ok(isSha256Hex(await sha256Hex("x")));
  assert.equal(isSha256Hex("A".repeat(64)), false, "uppercase is not the contract format");
});

test("concatenated pages reproduce the note exactly at every page size, never splitting a pair", async () => {
  for (let limit = 2; limit <= 12; limit++) {
    const pages = await readAll(NOTE, limit);
    assert.equal(pages.map((p) => p.content).join(""), NOTE, `limit ${limit}`);
    for (const p of pages) {
      assert.equal(p.total_chars, NOTE.length);
      assert.equal(p.content_hash, nodeSha(NOTE));
      assert.equal(p.returned_chars, p.content.length);
      assert.ok(p.returned_chars <= limit && p.returned_chars > 0);
      assert.equal(splitsSurrogatePair(NOTE, p.offset_chars + p.returned_chars), false);
      assert.ok(!/[\uD800-\uDBFF]$/.test(p.content) && !/^[\uDC00-\uDFFF]/.test(p.content), "no half pair at a page edge");
    }
    const last = pages[pages.length - 1];
    assert.equal(last.truncated, false);
    assert.equal(last.next_offset_chars, null);
  }
});

test("a page that would end inside a pair is shortened by one code unit", async () => {
  const raw = "a😀b"; // a, high, low, b
  const page = await readPage(raw, { limitChars: 2 });
  assert.equal(page.content, "a");
  assert.equal(page.next_offset_chars, 1);
  assert.equal(page.truncated, true);
});

test("defaults, empty notes, end and beyond-end offsets", async () => {
  const long = "x".repeat(40_000);
  const first = await readPage(long);
  assert.equal(first.returned_chars, 32_000, "default page is 32,000 code units");
  assert.equal(first.next_offset_chars, 32_000);
  const empty = await readPage("");
  assert.deepEqual({ ...empty, content_hash: undefined }, { content: "", content_hash: undefined, offset_chars: 0, returned_chars: 0, total_chars: 0, truncated: false, next_offset_chars: null });
  const hash = await sha256Hex("abc");
  const atEnd = await readPage("abc", { offsetChars: 3, expectedHash: hash });
  assert.equal(atEnd.content, "");
  assert.equal(atEnd.truncated, false, "offset at the end is an empty complete page");
  await assert.rejects(readPage("abc", { offsetChars: 4, expectedHash: hash }), code("invalid_argument"));
  await assert.rejects(readPage("a😀", { offsetChars: 2, expectedHash: await sha256Hex("a😀") }), code("invalid_argument"), "offset inside a pair");
});

test("hash rules: required after page zero, honored on page zero, mismatch is note_changed", async () => {
  await assert.rejects(readPage(NOTE, { offsetChars: 4 }), code("invalid_argument"));
  const page0 = await readPage(NOTE, { limitChars: 10 });
  assert.equal((await readPage(NOTE, { limitChars: 10, expectedHash: page0.content_hash })).content, page0.content);
  await assert.rejects(readPage(NOTE, { expectedHash: "0".repeat(64) }), code("note_changed"));
  // An intervening edit between pages is detected.
  const edited = NOTE.replace("one", "ONE");
  await assert.rejects(readPage(edited, { offsetChars: page0.next_offset_chars, limitChars: 10, expectedHash: page0.content_hash }), code("note_changed"));
});

test("slice limits are enforced even when called directly", () => {
  for (const [offset, limit] of [[-1, 10], [1.5, 10], [0, 1], [0, 64_001], [0, 2.5], [Number.MAX_SAFE_INTEGER + 1, 10]]) {
    assert.throws(() => slicePage("abc", offset, limit), code("invalid_argument"), `${offset}/${limit}`);
  }
  assert.equal(slicePage("abc", 0, 64_000).content, "abc");
});

test("hashing fails explicitly when WebCrypto is unavailable", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true, writable: true });
  try {
    await assert.rejects(sha256Hex("x"), code("hash_unavailable"));
    await assert.rejects(readPage("abc"), code("hash_unavailable"), "never an empty hash that disables the check");
  } finally {
    Object.defineProperty(globalThis, "crypto", descriptor);
  }
  assert.ok(isSha256Hex(await sha256Hex("x")));
});
