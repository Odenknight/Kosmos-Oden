/**
 * Personal Notes (0.9.0): start the embedded search worker from a Blob URL.
 * The worker source is bundled into main.js as text; nothing is downloaded.
 */
import WORKER_SOURCE from "../../dist/kosmos-personal-search-worker.txt";
import type { WorkerLike } from "../personal-notes/worker-client";

export interface SearchWorkerFactory {
  create(): WorkerLike;
  /** Revoke the Blob URL. Pass as PersonalSearchClient's `release`. */
  release(): void;
}

export function personalSearchWorkerFactory(): SearchWorkerFactory {
  let url: string | null = null;
  return {
    create() {
      url ??= URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
      return new Worker(url, { name: "kosmos-personal-search" });
    },
    release() {
      if (url) URL.revokeObjectURL(url);
      url = null;
    },
  };
}
