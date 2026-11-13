/**
 * Personal Notes (0.9.0) — the one Personal read policy.
 *
 * Every agent-facing path (REST, every MCP transport, search filter, counts,
 * related/lineage, attachment references, highlights, graph exports) asks the
 * same policy. Local-human views do not use it.
 */
import type { PersonalNoteMeta, PersonalNotesSettings, PersonalReadDenial, PersonalReadPolicy, PersonalVaultSource } from "./types";
import { PersonalError } from "./types";
import { inPersonalScope, isUnderFolder, isValidVaultPath, parseFolderList } from "./scope";

/** Credential guide written by the existing profile; it can contain a token. Matched by base name at any case. */
export const CREDENTIAL_GUIDE_NAMES: ReadonlySet<string> = new Set(["agent-api.md"]);

export interface PersonalPolicyInput {
  settings: Pick<PersonalNotesSettings, "includeFolders" | "excludeFolders" | "importReportPaths">;
  generation: number;
  /** The vault's actual configuration directory (Obsidian `vault.configDir`, e.g. ".obsidian"). */
  configDir: string;
  /** Inject `isKosmosOperationalPath` from src/operational-paths.ts. */
  isOperationalPath: (path: string) => boolean;
  /** Further exact files or folders that are never agent content. */
  extraDenied?: readonly string[];
}

/**
 * Build an immutable policy snapshot. Settings lists are copied; a later
 * settings change must bump the generation and build a new policy. An
 * invalid entry in any deny list (exclusions, reports, extra) or an invalid
 * config dir fails closed: the policy allows nothing.
 */
export function createPersonalReadPolicy(input: PersonalPolicyInput): PersonalReadPolicy {
  const include = [...(input.settings.includeFolders ?? [])];
  const exclude = [...(input.settings.excludeFolders ?? [])];
  const denied = parseFolderList([...(input.settings.importReportPaths ?? []), ...(input.extraDenied ?? [])], Number.MAX_SAFE_INTEGER);
  const configDir = input.configDir;
  const broken = denied.rejected.length > 0 || !isValidVaultPath(configDir);
  const isOperational = input.isOperationalPath;
  const generation = input.generation;
  return Object.freeze({
    generation,
    allowsPath(path: string): boolean {
      if (broken || !isValidVaultPath(path)) return false;
      const segments = path.split("/");
      if (segments.includes(".git")) return false;
      if (isUnderFolder(path, configDir)) return false;
      if (CREDENTIAL_GUIDE_NAMES.has(segments[segments.length - 1].toLowerCase())) return false;
      if (isOperational(path)) return false;
      if (denied.folders.some((entry) => isUnderFolder(path, entry))) return false;
      return inPersonalScope(path, include, exclude);
    },
  });
}

export type PersonalReadDecision =
  | { allowed: true }
  | { allowed: false; reason: PersonalReadDenial; /** Local-only explanation; never sent to an agent. */ diagnostic?: string };

export interface PersonalReadContext {
  policy: PersonalReadPolicy;
  source: Pick<PersonalVaultSource, "physicallyContained">;
  /** The existing sensitivity vocabulary and ranks (inject the Engine's SENSITIVITY_RANK). */
  sensitivityRank: Readonly<Record<string, number>>;
  /** The existing agent sensitivity ceiling. */
  ceiling: string;
}

const hasOwn = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * The Personal read decision (§4): out of scope → deny; not physically
 * contained → deny; no authored sensitivity → allow; authored valid label →
 * apply the existing ceiling; authored invalid label (or unparseable
 * frontmatter, where a label cannot be ruled out) → deny with a diagnostic.
 * The Engine's default-derived projection is never consulted.
 */
export function decidePersonalRead(path: string, meta: Pick<PersonalNoteMeta, "authoredSensitivity" | "frontmatterError">, ctx: PersonalReadContext): PersonalReadDecision {
  if (!ctx.policy.allowsPath(path)) return { allowed: false, reason: "out_of_scope" };
  if (!ctx.source.physicallyContained(path)) return { allowed: false, reason: "not_contained" };
  if (meta.frontmatterError) {
    return { allowed: false, reason: "invalid_sensitivity", diagnostic: `${path}: frontmatter could not be parsed, so a sensitivity label cannot be ruled out; the note is not shared until it is fixed.` };
  }
  const authored = meta.authoredSensitivity;
  if (authored === undefined) return { allowed: true };
  if (typeof authored !== "string" || !hasOwn(ctx.sensitivityRank, authored)) {
    return { allowed: false, reason: "invalid_sensitivity", diagnostic: `${path}: sensitivity label ${JSON.stringify(authored)} is not a recognised value; the note is not shared.` };
  }
  if (!hasOwn(ctx.sensitivityRank, ctx.ceiling)) {
    return { allowed: false, reason: "sensitivity", diagnostic: `Agent sensitivity ceiling ${JSON.stringify(ctx.ceiling)} is not a recognised value; labelled notes are not shared.` };
  }
  if (ctx.sensitivityRank[authored] > ctx.sensitivityRank[ctx.ceiling]) {
    return { allowed: false, reason: "sensitivity", diagnostic: `${path}: labelled "${authored}", above the agent ceiling "${ctx.ceiling}".` };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------ generations */

/** Monotonic policy generation. Bump on any profile, scope, token or bind change. */
export class PolicyGeneration {
  private value = 0;
  get current(): number { return this.value; }
  bump(): number { return ++this.value; }
}

/** Throw `policy_changed` unless the generation captured at request entry is still current. */
export function assertPolicyCurrent(captured: number, current: number): void {
  if (captured !== current) throw new PersonalError("policy_changed", "sharing settings changed while the request was running; retry");
}
