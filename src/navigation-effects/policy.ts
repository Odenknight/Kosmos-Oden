import { canonicalJson, sha256Bytes } from "gkos-engine";

import type { NavigationEffectsPolicyRef } from "./types";

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const POLICY_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;
export const NAVIGATION_EFFECTS_MAX_POLICY_BYTES = 256 * 1024;

export type NavigationEffectsPolicyValidationCode =
  | "policy-valid"
  | "policy-reference-missing"
  | "policy-reference-invalid"
  | "policy-bytes-missing"
  | "policy-bytes-too-large"
  | "policy-bytes-invalid"
  | "policy-identity-invalid"
  | "policy-identity-mismatch"
  | "policy-digest-mismatch";

export interface NavigationEffectsPolicyValidation {
  valid: boolean;
  code: NavigationEffectsPolicyValidationCode;
  policyId: string | null;
  policyVersion: string | null;
  expectedDigest: string | null;
  canonicalDigest: string | null;
}

function result(
  code: NavigationEffectsPolicyValidationCode,
  values: Partial<Omit<NavigationEffectsPolicyValidation, "valid" | "code">> = {},
): NavigationEffectsPolicyValidation {
  return Object.freeze({
    valid: code === "policy-valid",
    code,
    policyId: values.policyId ?? null,
    policyVersion: values.policyVersion ?? null,
    expectedDigest: values.expectedDigest ?? null,
    canonicalDigest: values.canonicalDigest ?? null,
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validIdentity(id: unknown, version: unknown): id is string {
  return typeof id === "string"
    && typeof version === "string"
    && POLICY_ID.test(id)
    && POLICY_VERSION.test(version);
}

function validReference(value: unknown): value is NavigationEffectsPolicyRef {
  if (!isPlainRecord(value)) return false;
  if (Object.keys(value).length !== 3 || !("id" in value) || !("version" in value) || !("digest" in value)) return false;
  return validIdentity(value.id, value.version)
    && typeof value.digest === "string"
    && SHA256_DIGEST.test(value.digest);
}

function decodePolicyBytes(bytes: string | Uint8Array): string | null {
  if (typeof bytes === "string") return bytes.length > 0 ? bytes : null;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Compute the policy digest over the Engine's canonical JSON representation.
 * Formatting and object-key order therefore do not change the binding.
 */
export async function canonicalNavigationEffectsPolicyDigest(policy: unknown): Promise<string> {
  return sha256Bytes(canonicalJson(policy));
}

/**
 * Purely validate configured policy identity and digest against supplied JSON
 * bytes. This function performs no lookup, persistence, authority decision, or
 * write. Callers must supply the bytes obtained through their own trusted
 * configuration boundary.
 */
export async function validateNavigationEffectsPolicy(
  policyRef: NavigationEffectsPolicyRef | null | undefined,
  suppliedBytes: string | Uint8Array | null | undefined,
): Promise<NavigationEffectsPolicyValidation> {
  if (policyRef === null || policyRef === undefined) return result("policy-reference-missing");
  if (!validReference(policyRef)) return result("policy-reference-invalid");

  if (suppliedBytes === null || suppliedBytes === undefined || suppliedBytes === ""
    || (suppliedBytes instanceof Uint8Array && suppliedBytes.byteLength === 0)) {
    return result("policy-bytes-missing", { expectedDigest: policyRef.digest });
  }
  const byteLength = typeof suppliedBytes === "string"
    ? new TextEncoder().encode(suppliedBytes).byteLength
    : suppliedBytes.byteLength;
  if (byteLength > NAVIGATION_EFFECTS_MAX_POLICY_BYTES) {
    return result("policy-bytes-too-large", { expectedDigest: policyRef.digest });
  }

  const decoded = decodePolicyBytes(suppliedBytes);
  if (decoded === null) return result("policy-bytes-invalid", { expectedDigest: policyRef.digest });

  let policy: unknown;
  try {
    policy = JSON.parse(decoded);
  } catch {
    return result("policy-bytes-invalid", { expectedDigest: policyRef.digest });
  }
  if (!isPlainRecord(policy)) return result("policy-bytes-invalid", { expectedDigest: policyRef.digest });

  const id = policy.id;
  const version = policy.version;
  if (!validIdentity(id, version)) return result("policy-identity-invalid", { expectedDigest: policyRef.digest });
  if (id !== policyRef.id || version !== policyRef.version) {
    return result("policy-identity-mismatch", {
      policyId: id,
      policyVersion: version as string,
      expectedDigest: policyRef.digest,
    });
  }

  let digest: string;
  try {
    digest = await canonicalNavigationEffectsPolicyDigest(policy);
  } catch {
    return result("policy-bytes-invalid", {
      policyId: id,
      policyVersion: version as string,
      expectedDigest: policyRef.digest,
    });
  }

  return result(digest === policyRef.digest ? "policy-valid" : "policy-digest-mismatch", {
    policyId: id,
    policyVersion: version as string,
    expectedDigest: policyRef.digest,
    canonicalDigest: digest,
  });
}
