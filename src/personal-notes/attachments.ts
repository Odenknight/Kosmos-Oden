/**
 * Personal Notes (0.9.0) — attachment references found in a note body.
 *
 * Pure text scan. It reports the link targets exactly as written; it does not
 * resolve them to vault paths and does not read the files. Reading a note
 * never reads its attachments, and the Agent API says so through this list.
 */
export interface AttachmentRef {
  /** Link target as written in the note, without alias, heading or size. */
  target: string;
  /** "embed" for ![[x]] and ![](x); "link" for [[x]] and [](x). */
  kind: "embed" | "link";
}

export const MAX_ATTACHMENT_REFS = 200;

const NOTE_EXTENSIONS = new Set(["md", "markdown"]);

function extensionOf(target: string): string {
  const clean = target.split("#")[0].split("?")[0];
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//") || target.startsWith("#");
}

function decode(target: string): string {
  try { return decodeURI(target); } catch { return target; }
}

/** List non-note files a note embeds or links to, in order of first appearance. */
export function attachmentRefs(body: unknown, max = MAX_ATTACHMENT_REFS): AttachmentRef[] {
  if (typeof body !== "string" || !body) return [];
  const found = new Map<string, AttachmentRef>();
  const order: string[] = [];
  const add = (rawTarget: string, embed: boolean) => {
    const target = rawTarget.trim();
    if (!target || isExternal(target)) return;
    const ext = extensionOf(target);
    if (!ext || NOTE_EXTENSIONS.has(ext) || !/^[a-z0-9]{1,8}$/.test(ext)) return;
    const key = target.toLowerCase();
    const existing = found.get(key);
    if (existing) { if (embed) existing.kind = "embed"; return; }
    if (order.length >= max) return;
    found.set(key, { target, kind: embed ? "embed" : "link" });
    order.push(key);
  };

  // Obsidian wikilinks and embeds: [[file.pdf]], ![[image.png|300]], [[a/b.pdf#page=2]]
  const wiki = /(!?)\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wiki.exec(body)) !== null) add(m[2], m[1] === "!");

  // Markdown links and images: ![alt](path.png), [text](<path with spaces.pdf>), [t](p.pdf "title")
  const md = /(!?)\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"\n]*")?\s*\)/g;
  while ((m = md.exec(body)) !== null) add(decode(m[2] !== undefined ? m[2] : m[3]), m[1] === "!");

  return order.map((key) => found.get(key)!);
}
