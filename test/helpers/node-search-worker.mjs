/**
 * Runs the built browser search worker (dist/kosmos-personal-search-worker.txt)
 * on node:worker_threads behind the WorkerLike interface the client expects.
 * A few lines of shim give the IIFE the `self.onmessage` / `postMessage` it
 * would have in a dedicated Web Worker; the worker code itself is unchanged.
 */
import { Worker } from "node:worker_threads";
import { readFileSync } from "node:fs";

export const WORKER_SOURCE = readFileSync(new URL("../../dist/kosmos-personal-search-worker.txt", import.meta.url), "utf8");

const SHIM = `
const { parentPort } = require("node:worker_threads");
globalThis.self = globalThis;
globalThis.postMessage = (message) => parentPort.postMessage(message);
parentPort.on("message", (data) => { if (typeof globalThis.onmessage === "function") globalThis.onmessage({ data }); });
`;

export class NodeWorkerLike {
  constructor(source = WORKER_SOURCE) {
    this.onmessage = null;
    this.onerror = null;
    this.onmessageerror = null;
    this.terminated = false;
    this.worker = new Worker(SHIM + source, { eval: true });
    this.worker.on("message", (data) => this.onmessage?.({ data }));
    this.worker.on("error", (error) => this.onerror?.(error));
    this.worker.on("messageerror", (error) => this.onmessageerror?.(error));
    this.worker.on("exit", (code) => { if (!this.terminated) this.onerror?.(new Error(`search worker exited with code ${code}`)); });
  }
  postMessage(message) { this.worker.postMessage(message); }
  terminate() { this.terminated = true; void this.worker.terminate(); }
}

/** Factory for PersonalSearchClient; records every worker it made so tests can inspect/kill them. */
export function nodeWorkerFactory(source = WORKER_SOURCE) {
  const made = [];
  const create = () => { const w = new NodeWorkerLike(source); made.push(w); return w; };
  create.made = made;
  return create;
}
