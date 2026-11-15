/**
 * Librarian benchmark (0.9.5).
 *
 *   npm run bench:librarian
 *   node --expose-gc benchmarks/librarian-bench.mjs [--notes 10000] [--mib 50] [--rounds 5] [--json out.json]
 *
 * The same seeded corpus as the search benchmark (default 10,000 notes, about
 * 50 MiB), held in memory, through the real built worker
 * (dist/kosmos-personal-search-worker.txt on worker_threads). Measures the
 * first build (search text plus Librarian vectors), 40 fixed questions
 * (plain words, several words, misspellings, quoted phrases, a name, misses)
 * asked `rounds` times, an edit becoming answerable, and memory. Every
 * question is asked twice and the two answers are compared byte for byte.
 */
import { writeFileSync } from "node:fs";
import { MemoryCorpus, PersonalSearchClient } from "../dist/kosmos-personal-notes.mjs";
import { nodeWorkerFactory } from "../test/helpers/node-search-worker.mjs";
import { generateCorpus, vocabulary } from "./personal-search-corpus.mjs";

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const NOTES = Number(arg("--notes", 10_000));
const MIB = Number(arg("--mib", 50));
const ROUNDS = Number(arg("--rounds", 5));
const JSON_OUT = arg("--json", "");
const SEED = 0x5eed;
const gc = globalThis.gc ?? (() => {});
const now = () => performance.now();
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; };
const ms = (x) => `${x.toFixed(x < 10 ? 2 : 0)} ms`;
const mib = (b) => `${(b / 1048576).toFixed(0)} MiB`;

/** Drop one inner letter: a misspelling one edit away from the word. */
const typo = (w) => w.slice(0, 2) + w.slice(3);

export function librarianQuestions(seed = SEED) {
  const v = vocabulary(seed);
  return [
    // one word: common, mid, rare
    v[0], v[5], v[34], v[350], v[1200], v[2500], v[3900], "zephyrquartz", "tailsentinel", "obsidianmarker",
    // several words
    `${v[0]} ${v[1]} ${v[2]}`, `${v[8]} ${v[13]} ${v[21]} ${v[34]}`, `${v[200]} ${v[500]}`, `${v[800]} ${v[1600]} ${v[2000]}`,
    `how do I ${v[100]} the ${v[150]}`, `where is the ${v[400]} ${v[600]}`, `what replaced the ${v[700]} ${v[900]}`, `${v[1]} keeps failing with ${v[1000]}`,
    `${v[0]} ${v[1]} ${v[2]} ${v[3]} ${v[5]} ${v[8]} ${v[13]} ${v[21]}`, `${v[2500]} ${v[3000]} ${v[3500]}`,
    // natural phrases the corpus contains
    "olive oil and bread", "quarterly budget review", "agenda for the team budget", "remember the zephyrquartz sample", "café near the station",
    // misspellings
    typo(v[350]), `${typo(v[1200])} ${v[5]}`, "zephyrquarts", "quartely budgt review", `${typo(v[2000])} ${typo(v[2500])}`,
    // quoted phrases
    '"olive oil"', '"quarterly budget review" team', `"${v[0]} ${v[1]}"`, '"no such phrase anywhere" bread',
    // names
    "Note 00042", "note 9000", `Note 7 ${v[10]}`,
    // misses
    "nonexistentterm", "qqqqzzzz wwwwyyyy", `${v[3999]} nonexistentterm`,
  ];
}

function memorySource(files) {
  const store = new Map(files.map((f) => [f.path, f.raw]));
  const size = new Map(files.map((f) => [f.path, Buffer.byteLength(f.raw)]));
  const name = (path) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  return {
    store, size,
    listMarkdown: () => [...store.keys()].map((p) => ({ path: p, mtimeMs: 1, sizeBytes: size.get(p) })),
    stat: (p) => (store.has(p) ? { path: p, mtimeMs: 1, sizeBytes: size.get(p) } : null),
    async readRaw(p) { return store.get(p); },
    meta: (p, raw) => ({ title: (/^#\s+(.+)$/m.exec(raw)?.[1] ?? name(p)).trim(), aliases: [], tags: [], supersedes: [], supersededBy: [], links: [], attachments: [] }),
    exists: (p) => store.has(p),
    resolveLink: () => null,
    physicallyContained: () => true,
  };
}

async function main() {
  const files = generateCorpus({ notes: NOTES, targetBytes: MIB * 1024 * 1024, seed: SEED });
  let bytes = 0;
  for (const f of files) bytes += Buffer.byteLength(f.raw);
  const source = memorySource(files);
  files.length = 0;
  gc();
  const rssBefore = process.memoryUsage().rss;

  const corpus = new MemoryCorpus(source, { timers: { setTimeout: () => 0, clearTimeout: () => {} } });
  const client = new PersonalSearchClient({ corpus, createWorker: nodeWorkerFactory() });
  const t0 = now();
  await corpus.build();
  await client.whenApplied();
  const buildMs = now() - t0;
  gc();
  const rssBuilt = process.memoryUsage().rss;

  const questions = librarianQuestions();
  const ask = (question) => client.librarian({ question, allowedPaths: null });
  for (const q of questions.slice(0, 5)) await ask(q); // warm the JIT
  const all = [];
  const perQuestion = new Map();
  let deterministic = true;
  let answered = 0;
  for (let round = 0; round < ROUNDS; round++) {
    for (const q of questions) {
      const t = now();
      const r = await ask(q);
      const dt = now() - t;
      all.push(dt);
      perQuestion.set(q, [...(perQuestion.get(q) ?? []), dt]);
      if (round === 0) {
        if (r.hits.length) answered++;
        if (JSON.stringify(await ask(q)) !== JSON.stringify(r)) deterministic = false;
      }
    }
  }
  const slowest = [...perQuestion].map(([q, xs]) => ({ q, p50: pct(xs, 50) })).sort((a, b) => b.p50 - a.p50).slice(0, 5);

  // An edit becoming answerable: write a note with a new word, flush, ask for it.
  const edits = [];
  for (let i = 0; i < 5; i++) {
    const path = `Area0/Sub0/Bench edit ${i}.md`;
    const raw = `# Bench edit ${i}\n\nThe benchmarkneedle${i} lives here.\n`;
    source.store.set(path, raw); source.size.set(path, Buffer.byteLength(raw));
    const t = now();
    corpus.apply({ modified: [path] });
    await corpus.flush();
    await client.whenApplied();
    const r = await ask(`benchmarkneedle${i}`);
    edits.push(now() - t);
    if (r.hits[0]?.path !== path) throw new Error(`edit ${i} was not found: ${JSON.stringify(r.hits[0]?.path)}`);
  }
  gc();
  const rssEnd = process.memoryUsage().rss;

  const result = {
    node: process.version, notes: NOTES, corpusBytes: bytes, questions: questions.length, rounds: ROUNDS,
    buildMs, askP50: pct(all, 50), askP95: pct(all, 95), askMax: Math.max(...all), askMean: all.reduce((a, b) => a + b, 0) / all.length,
    editP50: pct(edits, 50), answered, deterministic,
    rssBeforeBuild: rssBefore, rssAfterBuild: rssBuilt, rssEnd, slowest,
  };
  console.log(`## Librarian benchmark\n`);
  console.log(`${NOTES.toLocaleString("en-US")} notes, ${mib(bytes)} of Markdown, ${questions.length} questions x ${ROUNDS} rounds, Node ${process.version}\n`);
  console.log(`| Measure | Result |\n| --- | --- |`);
  console.log(`| First build (search text + Librarian vectors) | ${ms(buildMs)} |`);
  console.log(`| Question, median | ${ms(result.askP50)} |`);
  console.log(`| Question, 95th percentile | ${ms(result.askP95)} |`);
  console.log(`| Question, slowest | ${ms(result.askMax)} |`);
  console.log(`| Edit to answerable, median | ${ms(result.editP50)} |`);
  console.log(`| Questions with at least one note | ${answered} of ${questions.length} |`);
  console.log(`| Same question, same answer | ${deterministic ? "yes" : "NO"} |`);
  console.log(`| Memory in this process: before build / after build / end | ${mib(rssBefore)} / ${mib(rssBuilt)} / ${mib(rssEnd)} |`);
  console.log(`\nSlowest questions (median): ${slowest.map((s) => `\`${s.q}\` ${ms(s.p50)}`).join("; ")}`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(result, null, 2) + "\n");
  client.dispose();
  corpus.dispose();
  if (!deterministic) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) await main();
