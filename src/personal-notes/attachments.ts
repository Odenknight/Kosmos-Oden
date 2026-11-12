/**
 * Personal Notes (0.9.0) — attachment references for an agent-visible note.
 *
 * Input is the host-resolved `meta.attachments` (Obsidian metadata/link
 * APIs), never a regex over the body. Each reference is checked against the
 * read policy and for existence. Reading a note never reads or returns its
 * attachments' bytes; only these references are reported.
 */
import { PERSONAL_LIMITS } from "./types";
import type { PersonalAttachmentRef, PersonalReadPolicy, PersonalVaultSource } from "./types";

export type AttachmentStatus =
  /** Resolved, inside the shared folders and present. Contents are not included. */
  | "available"
  /** Resolved inside the shared folders, but no file exists there. */
  | "missing"
  /** The link could not be resolved to a single vault file. */
  | "unresolved"
  /** Resolves outside the folders shared with agents. The path is not reported. */
  | "not_shared";

export interface AttachmentView {
  /** Link target exactly as written in the note (note content, already visible to the agent). */
  target: string;
  kind: "embed" | "link";
  status: AttachmentStatus;
  /** Present only when status is "available" or "missing". */
  path?: string;
}

export interface AttachmentReport {
  attachments: AttachmentView[];
  /** More references existed than PERSONAL_LIMITS.attachmentRefs. */
  truncated: boolean;
  /** Local-only diagnostics (missing/unresolved files in the selection). Never sent to an agent. */
  diagnostics: string[];
}

const REMOTE = /^[a-z][a-z0-9+.-]*:|^\/\//i;

export function resolveAttachments(
  notePath: string,
  refs: readonly PersonalAttachmentRef[],
  policy: PersonalReadPolicy,
  source: Pick<PersonalVaultSource, "exists" | "physicallyContained">,
  max: number = PERSONAL_LIMITS.attachmentRefs,
): AttachmentReport {
  const attachments: AttachmentView[] = [];
  const diagnostics: string[] = [];
  const byTarget = new Map<string, AttachmentView>();
  let truncated = false;
  for (const ref of refs) {
    if (!ref || typeof ref.target !== "string" || REMOTE.test(ref.target)) continue;
    const kind = ref.kind === "embed" ? "embed" : "link";
    const seen = byTarget.get(ref.target);
    if (seen) { if (kind === "embed") seen.kind = "embed"; continue; }
    if (attachments.length >= max) { truncated = true; continue; }
    let view: AttachmentView;
    if (ref.path === null || typeof ref.path !== "string") {
      view = { target: ref.target, kind, status: "unresolved" };
      diagnostics.push(`${notePath}: attachment link ${JSON.stringify(ref.target)} does not resolve to a vault file.`);
    } else if (!policy.allowsPath(ref.path) || !source.physicallyContained(ref.path)) {
      // Scope before existence: never reveal whether a hidden file exists.
      view = { target: ref.target, kind, status: "not_shared" };
    } else if (source.exists(ref.path)) {
      view = { target: ref.target, kind, status: "available", path: ref.path };
    } else {
      view = { target: ref.target, kind, status: "missing", path: ref.path };
      diagnostics.push(`${notePath}: attachment ${JSON.stringify(ref.path)} is missing.`);
    }
    byTarget.set(ref.target, view);
    attachments.push(view);
  }
  return { attachments, truncated, diagnostics };
}

/**
 * @deprecated Regex text scan kept only because the starting patch's `qNote`
 * in agent-server.ts still imports it. Personal reads use resolveAttachments.
 * Remove when the integrator replaces that call.
 */
export interface AttachmentRef {
  target: string;
  kind: "embed" | "link";
}

const NOTE_EXTENSIONS = new Set(["md", "markdown"]);

function extensionOf(target: string): string {
  const clean = target.split("#")[0].split("?")[0];
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function decode(target: string): string {
  try { return decodeURI(target); } catch { return target; }
}

/** @deprecated See AttachmentRef. */
export function attachmentRefs(body: unknown, max: number = PERSONAL_LIMITS.attachmentRefs): AttachmentRef[] {
  if (typeof body !== "string" || !body) return [];
  const found = new Map<string, AttachmentRef>();
  const order: string[] = [];
  const add = (rawTarget: string, embed: boolean) => {
    const target = rawTarget.trim();
    if (!target || REMOTE.test(target) || target.startsWith("#")) return;
    const ext = extensionOf(target);
    if (!ext || NOTE_EXTENSIONS.has(ext) || !/^[a-z0-9]{1,8}$/.test(ext)) return;
    const key = target.toLowerCase();
    const existing = found.get(key);
    if (existing) { if (embed) existing.kind = "embed"; return; }
    if (order.length >= max) return;
    found.set(key, { target, kind: embed ? "embed" : "link" });
    order.push(key);
  };
  const wiki = /(!?)\[\[([^\]\n|#]+)(?:#[^\]\n|]*)?(?:\|[^\]\n]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = wiki.exec(body)) !== null) add(m[2], m[1] === "!");
  const md = /(!?)\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"\n]*")?\s*\)/g;
  while ((m = md.exec(body)) !== null) add(decode(m[2] !== undefined ? m[2] : m[3]), m[1] === "!");
  return order.map((key) => found.get(key)!);
}
