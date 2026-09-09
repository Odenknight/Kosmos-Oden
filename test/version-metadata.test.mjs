import assert from "node:assert/strict";
import test from "node:test";

import { engineIdentity, retrievalCapabilities } from "../dist/kosmos-version-metadata.mjs";

test("unconfigured and disconnected service reports do not share mutable extensions", () => {
  const first = engineIdentity("2.2.0");
  first.service.extensions.push("synthetic-unadvertised-extension");
  assert.deepEqual(engineIdentity("2.2.0").service.extensions, []);
  const disconnected = engineIdentity("2.2.0", { configured: true });
  assert.deepEqual(disconnected.service.extensions, []);
  disconnected.service.extensions.push("another-synthetic-extension");
  assert.deepEqual(engineIdentity("2.2.0", { configured: true }).service.extensions, []);
});

/* The whole point of R3 is that these are separate axes. The defect class this
   guards against is a consumer reading one number and believing it describes
   another component. */

test("no configured service reports not_configured, never the library version", () => {
  const id = engineIdentity("2.2.0");
  assert.equal(id.library.version, "2.2.0");
  assert.equal(id.library.source, "bundled-package");
  assert.equal(id.service.status, "not_configured");
  assert.equal(id.service.version, null);
  assert.equal(id.service.name, null);
  assert.equal(id.service.protocolVersion, null);
  assert.equal(id.service.contract, null);
  assert.deepEqual(id.service.extensions, []);
  assert.equal(id.service.selfReported, false);
});

test("the library version never leaks into any service field", () => {
  // The exact bug: an agent reading a service version that was really the
  // bundled library's number, or vice versa.
  for (const negotiation of [null, { configured: true }]) {
    const id = engineIdentity("2.2.0", negotiation);
    const serviceValues = Object.values(id.service).flatMap((v) => (Array.isArray(v) ? v : [v]));
    assert.ok(
      !serviceValues.includes("2.2.0"),
      `library version leaked into service block: ${JSON.stringify(id.service)}`,
    );
  }
});

test("configured but un-negotiated is distinct from not configured", () => {
  const id = engineIdentity("2.2.0", { configured: true });
  assert.equal(id.service.status, "not_connected");
  assert.equal(id.service.selfReported, false);
  assert.equal(id.service.version, null);
});

test("a negotiated service reports exactly what the peer said, and is marked self-reported", () => {
  const id = engineIdentity("2.2.0", {
    name: "gkos-engine",
    version: "2.1.2",
    protocolVersion: "2025-11-25",
    contract: "1.0.0-draft.2",
    extensions: ["observatory.mcp-content.v0"],
    observedAt: "2026-09-09T09:00:00Z",
  });
  assert.equal(id.service.status, "connected");
  assert.equal(id.service.selfReported, true);
  // Service says 2.1.2 while the bundled library is 2.2.0. Both are reported,
  // side by side, and neither is rewritten to agree with the other.
  assert.equal(id.service.version, "2.1.2");
  assert.equal(id.library.version, "2.2.0");
  assert.equal(id.service.protocolVersion, "2025-11-25");
  assert.equal(id.service.contract, "1.0.0-draft.2");
  assert.deepEqual(id.service.extensions, ["observatory.mcp-content.v0"]);
});

test("the contract generation tracks neither the library nor the service", () => {
  const id = engineIdentity("2.2.0", {
    name: "gkos-engine", version: "2.1.2", protocolVersion: "2025-11-25",
    contract: "1.0.0-draft.2", extensions: [], observedAt: null,
  });
  assert.equal(id.profile.engineContractGeneration, "GKOS-Engine 2.1");
  assert.equal(id.profile.gkx, "2.3");
});

test("the returned extensions array is a copy, so a caller cannot mutate our state", () => {
  const extensions = ["a"];
  const id = engineIdentity("2.2.0", {
    name: null, version: null, protocolVersion: null, contract: null,
    extensions, observedAt: null,
  });
  extensions.push("b");
  assert.deepEqual(id.service.extensions, ["a"]);
});

test("retrieval capabilities do not claim body search before a bridge exists", () => {
  const caps = retrievalCapabilities({ maxSearchResults: 200, maxNoteCharacters: 200_000 });
  assert.deepEqual(caps.searchModes, ["metadata"]);
  assert.equal(caps.bodyCoverage, "none");
  // An agent must be able to tell "searched the body and found nothing" from
  // "never searched the body at all".
  assert.ok(!caps.searchModes.includes("body"));
  assert.deepEqual(caps.matchModes, ["substring"]);
  assert.equal(caps.maxPathDepth, 1);
  assert.deepEqual(caps.timeAxes, ["valid_at"]);
  assert.deepEqual(caps.limits, { maxSearchResults: 200, maxNoteCharacters: 200_000 });
});

test("body search is disclosed only when actually available", () => {
  const caps = retrievalCapabilities({ maxSearchResults: 50, maxNoteCharacters: 16_384 }, true);
  assert.deepEqual(caps.searchModes, ["metadata", "body"]);
  assert.equal(caps.bodyCoverage, "partial");
});

test("known_at is not claimed; graph_at_time is valid-at only", () => {
  const caps = retrievalCapabilities({ maxSearchResults: 200, maxNoteCharacters: 200_000 });
  assert.ok(!caps.timeAxes.includes("known_at"));
});
