#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { NodeManagedMocRuntime } from "gkos-engine/navigation-effects/node";

/** Node host entry point. The trusted host supplies live authority and snapshots. */
export async function startKosmosManagedMocs(options) {
  if (options?.enabled !== true || options?.pathThreatModel !== "cooperative-vault" || typeof options?.vaultRoot !== "string" || !options.vaultRoot || typeof options?.snapshot !== "function" || typeof options?.validatePreconditions !== "function") {
    throw new Error("Managed MOCs require explicit enablement, a vault, a snapshot provider and live precondition validation.");
  }
  const runtime = new NodeManagedMocRuntime(options);
  try {
    if (!await runtime.start()) throw new Error("Managed MOC recovery or reconciliation is not ready.");
    return runtime;
  } catch {
    await runtime.shutdown().catch(() => {});
    throw new Error("Managed MOC startup failed. Review the host's recovery state before retrying.");
  }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--help") {
    console.log("Usage: node kosmos-moc.mjs --host <trusted-host-module.mjs> --once|--watch\nThe module exports createHostOptions(). It is trusted local code, not vault content.\nNo host or authority is discovered automatically. --watch performs automatic maintenance only for explicitly registered targets.");
    return 0;
  }
  if (args.length !== 3 || args[0] !== "--host" || !["--once", "--watch"].includes(args[2])) throw new Error("Use --host <trusted-host-module.mjs> and exactly one of --once or --watch.");
  const host = await import(pathToFileURL(realpathSync(resolve(args[1]))).href);
  if (typeof host.createHostOptions !== "function") throw new Error("Host module must export createHostOptions().");
  const options = await host.createHostOptions();
  let runtime;
  const stop = new AbortController();
  const onSignal = () => stop.abort();
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  try {
    runtime = await startKosmosManagedMocs(options);
    console.log(JSON.stringify({ managedMocs: "ready", mode: args[2].slice(2), status: runtime.status }));
    if (args[2] === "--watch" && !stop.signal.aborted) await new Promise(done => stop.signal.addEventListener("abort", done, { once: true }));
  } finally {
    process.removeListener("SIGINT", onSignal); process.removeListener("SIGTERM", onSignal);
    if (runtime && !(await runtime.shutdown()).clean) throw new Error("Managed MOC shutdown needs recovery.");
  }
  return 0;
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, () => {
    console.error("Managed MOC host failed. Check the trusted configuration and recovery evidence; no raw host error is exported.");
    process.exitCode = 1;
  });
}
