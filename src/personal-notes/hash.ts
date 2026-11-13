/**
 * Personal Notes (0.9.0) — SHA-256 content hashes for exact note reads.
 *
 * Uses WebCrypto (`globalThis.crypto.subtle`), available in Obsidian/Electron
 * and Node 24. A missing or failing implementation is an explicit
 * `hash_unavailable` error: an empty hash would silently disable the
 * continuation check.
 */
import { PersonalError } from "./types";

export const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value);
}

/** Lowercase hex SHA-256 of a string's UTF-8 encoding, or of the given bytes. */
export async function sha256Hex(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") throw new PersonalError("hash_unavailable", "SHA-256 is unavailable in this runtime");
  let digest: ArrayBuffer;
  try {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    digest = await subtle.digest("SHA-256", bytes);
  } catch {
    throw new PersonalError("hash_unavailable", "SHA-256 hashing failed");
  }
  let hex = "";
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, "0");
  if (!SHA256_HEX.test(hex)) throw new PersonalError("hash_unavailable", "SHA-256 produced an unexpected digest");
  return hex;
}
