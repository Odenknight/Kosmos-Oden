/**
 * Deterministic synthetic Personal Notes corpus for the search benchmark
 * (Node) and the Chromium worker harness (browser). Pure ESM, no Node APIs.
 *
 * Default: 10,000 notes, about 50 MiB of UTF-8 Markdown, fixed seed. Mostly
 * ASCII prose from a skewed synthetic vocabulary, with frontmatter on some
 * notes, a few very long notes, phrases, rare markers and Unicode text
 * (NFD/NFC, İ, ß, CJK, Cyrillic, Greek, emoji).
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYLLABLES = ["ka", "lo", "mi", "ra", "ven", "tor", "sel", "dan", "qui", "phe", "bro", "sta", "al", "or", "em", "un", "tri", "gal", "ner", "os", "pa", "lu", "ze", "fin"];

export function vocabulary(seed = 0x5eed, size = 4000) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const words = new Set();
  while (words.size < size) {
    const n = 2 + Math.floor(rng() * 3);
    let w = "";
    for (let i = 0; i < n; i++) w += SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
    words.add(w);
  }
  return [...words];
}

const UNICODE_SNIPPETS = [
  "Meet at the café near the station.",
  "Lunch at a café with Ana.",
  "Trip to İSTANBUL MixedCASE itinerary.",
  "Die Straße war lang.",
  "東京タワーに行きました。",
  "Привет МИР, как дела?",
  "Η ΟΔΟΣ είναι μακριά.",
  "Party 🎉 planning for the 👩‍👩‍👧 family.",
];

/**
 * @returns {{ path: string, raw: string }[]} notes in creation order
 */
export function generateCorpus({ notes = 10_000, targetBytes = 50 * 1024 * 1024, seed = 0x5eed } = {}) {
  const rng = mulberry32(seed);
  const vocab = vocabulary(seed);
  // Skewed (Zipf-like) word choice: low indices are common.
  const word = () => vocab[Math.floor(vocab.length * rng() * rng() * rng())];
  const avg = targetBytes / notes;
  const sizes = Array.from({ length: notes }, (_, i) => (i % 1000 === 7 ? avg * 60 : avg * (0.25 + 1.5 * rng())));
  const scale = targetBytes / sizes.reduce((a, b) => a + b, 0);
  const out = [];
  for (let i = 0; i < notes; i++) {
    const want = Math.max(200, Math.floor(sizes[i] * scale));
    const parts = [];
    let len = 0;
    if (i % 3 === 0) {
      const fm = `---\ntags: [${word()}, area${i % 20}]\ncreated_at: "2026-01-${String(1 + (i % 28)).padStart(2, "0")}T10:00:00Z"\n---\n`;
      parts.push(fm);
      len += fm.length;
    }
    parts.push(`# Note ${i} ${word()}\n\n`);
    if (i % 20 === 0) parts.push("We need more olive oil and bread.\n");
    if (i % 97 === 0) parts.push("Agenda: quarterly budget review with the team.\n");
    if (i % 50 === 0) parts.push(UNICODE_SNIPPETS[(i / 50) % UNICODE_SNIPPETS.length] + "\n");
    if (i % 1000 === 3) parts.push("Remember the zephyrquartz sample.\n");
    if (i % 1000 === 500) parts.push("obsidianmarker appears here.\n");
    while (len < want) {
      let line = "";
      const n = 8 + Math.floor(rng() * 14);
      for (let w = 0; w < n; w++) line += (w ? " " : "") + word();
      line += rng() < 0.15 ? ".\n\n" : ". ";
      parts.push(line);
      len += line.length;
    }
    if (i % 1000 === 7) parts.push("\nThe tailsentinel closes this long note.\n");
    out.push({ path: `Area${i % 20}/Sub${i % 7}/Note ${String(i).padStart(5, "0")}.md`, raw: parts.join("") });
  }
  return out;
}

/** 50 fixed queries: common/mid/rare single terms, AND, phrases, Unicode and misses. */
export function benchmarkQueries(seed = 0x5eed) {
  const v = vocabulary(seed);
  return [
    // common single terms
    v[0], v[1], v[2], v[3], v[5], v[8], v[13], v[21], v[34], v[55],
    // mid-frequency single terms
    v[200], v[350], v[500], v[800], v[1200], v[1600], v[2000], v[2500],
    // rare single terms
    "zephyrquartz", "obsidianmarker", "tailsentinel", v[3900], v[3950], v[3999],
    // multi-term AND
    `${v[0]} ${v[1]}`, `${v[2]} ${v[3]} ${v[5]}`, `${v[8]} ${v[13]}`, `${v[21]} ${v[34]} ${v[55]}`,
    `${v[100]} ${v[150]}`, `${v[1]} ${v[400]}`, `${v[0]} ${v[1]} ${v[2]} ${v[3]}`, `${v[600]} ${v[700]}`,
    `${v[0]} zephyrquartz`, `${v[1]} obsidianmarker`, `${v[2]} tailsentinel`,
    // phrases
    '"olive oil"', '"quarterly budget review"', `"${v[0]} ${v[1]}"`, '"more olive oil and bread"', `"${v[3]} ${v[5]}"`, "olive bread",
    // Unicode
    "café", "İstanbul", "straße", "東京", "мир", "🎉", "οδος",
    // misses
    "nonexistentwordxyz", `${v[0]} nonexistentwordxyz`,
  ];
}
