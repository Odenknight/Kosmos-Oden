/**
 * Separately sourced Engine version metadata (retrieval plan R3).
 *
 * An agent talking to Kosmos-Oden can see several different "Engine versions",
 * and conflating them has already caused real misreports:
 *
 *  - the **library** bundled into this plugin (`gkos-engine`, `ENGINE_VERSION`);
 *  - a remote Engine **service**, which self-reports its own `serverInfo`
 *    version, contract version and extensions, and which may be an entirely
 *    different build from the bundled library;
 *  - the **contract generation** ("GKOS-Engine 2.1") naming the GKX/Navigation
 *    profile, which is versioned on its own axis and tracks neither of the above.
 *
 * These are reported as three distinct fields that are never derived from one
 * another. In particular the library version is NEVER used to fill in a service
 * version: if no service has been negotiated, that is reported as such rather
 * than guessed. A service self-report is also only ever evidence of what the
 * peer said, not proof of which executable is running.
 *
 * This module is deliberately free of Obsidian, network and Engine imports so
 * it can be unit-tested directly.
 */

/** Why the service block holds no negotiated identity, or that it does. */
export type EngineServiceStatus =
  /** No remote Engine service is configured. This is the current shipped state. */
  | "not_configured"
  /** Configured, but no successful negotiation has happened yet. */
  | "not_connected"
  /** Configured and reachable; fields below carry what the peer reported. */
  | "connected";

/** What a negotiated MCP peer told us about itself. Self-reported, unverified. */
export interface EngineServiceNegotiation {
  /** `serverInfo.name` exactly as the peer reported it. */
  name: string | null;
  /** `serverInfo.version` exactly as the peer reported it. Never inferred. */
  version: string | null;
  /** Negotiated MCP protocol revision, e.g. "2025-11-25". */
  protocolVersion: string | null;
  /** Engine contract version, e.g. "1.0.0-draft.2". */
  contract: string | null;
  /** Advertised extension identifiers. */
  extensions: string[];
  /** When this negotiation was observed, ISO 8601. */
  observedAt: string | null;
}

export interface EngineServiceReport extends EngineServiceNegotiation {
  status: EngineServiceStatus;
  /**
   * True only when every field above came from an actual negotiated response.
   * A consumer that needs to know "may I quote this version?" reads this, not
   * the presence of a string.
   */
  selfReported: boolean;
}

export interface EngineIdentity {
  /** The `gkos-engine` package compiled into this plugin. Authoritative here. */
  library: { version: string; source: "bundled-package" };
  /** A remote Engine service, if one has been negotiated. */
  service: EngineServiceReport;
  /** Contract generations, versioned independently of both of the above. */
  profile: { gkx: string; engineContractGeneration: string };
}

const NO_SERVICE: Omit<EngineServiceReport, "status"> = {
  name: null,
  version: null,
  protocolVersion: null,
  contract: null,
  extensions: [],
  observedAt: null,
  selfReported: false,
};

/**
 * Build the Engine identity block.
 *
 * @param libraryVersion `ENGINE_VERSION` from the bundled `gkos-engine`.
 * @param negotiation    What a remote service reported, when one is connected.
 *                       Pass `null` when none is configured, and
 *                       `{ configured: true }` when one is configured but has
 *                       not been negotiated yet.
 *
 * Deliberately takes the library version as an argument rather than importing
 * it, so a test can prove the two never cross-contaminate.
 */
export function engineIdentity(
  libraryVersion: string,
  negotiation: EngineServiceNegotiation | { configured: true } | null = null,
  profile: { gkx: string; engineContractGeneration: string } = {
    gkx: "2.3",
    engineContractGeneration: "GKOS-Engine 2.1",
  },
): EngineIdentity {
  let service: EngineServiceReport;
  if (negotiation === null) {
    service = { status: "not_configured", ...NO_SERVICE, extensions: [] };
  } else if ("configured" in negotiation) {
    service = { status: "not_connected", ...NO_SERVICE, extensions: [] };
  } else {
    service = {
      status: "connected",
      name: negotiation.name ?? null,
      version: negotiation.version ?? null,
      protocolVersion: negotiation.protocolVersion ?? null,
      contract: negotiation.contract ?? null,
      extensions: [...(negotiation.extensions ?? [])],
      observedAt: negotiation.observedAt ?? null,
      selfReported: true,
    };
  }
  return {
    library: { version: libraryVersion, source: "bundled-package" },
    service,
    profile: { ...profile },
  };
}

/** Retrieval capabilities an agent can rely on right now (R3 disclosure). */
export interface RetrievalCapabilities {
  /** Search modes this deployment can actually serve. */
  searchModes: ("metadata" | "body")[];
  /** How search matches terms. Legacy default is whole-string substring. */
  matchModes: ("substring" | "terms")[];
  /** Whether note *bodies* are searchable. False until an Engine bridge lands. */
  bodyCoverage: "none" | "partial" | "full";
  /** Maximum hops `get_related` will traverse. */
  maxPathDepth: number;
  /** Hard response bounds, so an agent can plan instead of discovering them. */
  limits: { maxSearchResults: number; maxNoteCharacters: number };
  /** Which time axes the temporal tools actually implement. */
  timeAxes: ("valid_at" | "known_at")[];
}

/**
 * Report only what this build can serve. `bodyCoverage` stays "none" and
 * `searchModes` stays metadata-only until an Engine retrieval bridge exists;
 * claiming otherwise would tell an agent that a body answer was searched for
 * and absent, when in fact it was never searched at all.
 */
export function retrievalCapabilities(
  limits: { maxSearchResults: number; maxNoteCharacters: number },
  bodySearchAvailable = false,
): RetrievalCapabilities {
  return {
    searchModes: bodySearchAvailable ? ["metadata", "body"] : ["metadata"],
    matchModes: ["substring"],
    bodyCoverage: bodySearchAvailable ? "partial" : "none",
    maxPathDepth: 1,
    limits: { ...limits },
    timeAxes: ["valid_at"],
  };
}
