import { lstat, readdir, readFile, realpath, mkdir, open, rename } from "node:fs/promises";
import { watch } from "node:fs";
import { resolve, relative, isAbsolute, posix, normalize } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { buildVaultNavigationConfig } from "gkos-engine/navigation";
import { ManagedMocCoordinator, planMocApply } from "gkos-engine/navigation-effects";
import { NodeNavigationEffectsExecutor } from "gkos-engine/navigation-effects/node";
export { validateFolder } from "./host.mjs";
import { validateFolder } from "./host.mjs";

export const TARGET_NAME = "Kosmos Index.md";
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const seal = value => hash(JSON.stringify(value));
const text = value => value.replace(/[\\[\]_*`<>]/g, "\\$&");
const link = (label, path) => `[${text(label)}](<${path.split("/").map(encodeURIComponent).join("/")}>)`;
function category(name) {
  const ext = posix.extname(name).toLowerCase();
  if (ext === ".md") return "Markdown notes";
  if ([".pdf", ".doc", ".docx", ".txt", ".rtf", ".odt"].includes(ext)) return "Documents";
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".heic"].includes(ext)) return "Images";
  if ([".mp3", ".wav", ".flac", ".m4a", ".ogg"].includes(ext)) return "Audio";
  if ([".mp4", ".mov", ".mkv", ".webm"].includes(ext)) return "Video";
  if ([".csv", ".xlsx", ".xls", ".ods"].includes(ext)) return "Spreadsheets";
  return "Other files";
}

/** Host catalog rendering; Engine owns effect planning, leases, journal and execution. */
export async function createPrototypeHost({ root, folder, adoptionId, isEnabled, onCommitted = () => {}, faultInjector = undefined }) {
  validateFolder(folder);
  if (!/^[0-9a-f-]{36}$/.test(adoptionId)) throw new Error("Invalid adoption record.");
  const vaultRoot = await realpath(root), target = `${folder}/${TARGET_NAME}`;
  const vaultId = `prototype:${hash(vaultRoot).slice(7, 31)}`;
  const policyRef = { id: "kosmos-tree-copy-test", version: "1", digest: seal({ vaultId, folder, adoptionId, sensitivity: "secret", retention: "operator-confirmed-clear", catalog: "file-metadata-only/1" }) };
  const config = await buildVaultNavigationConfig({ configId: "01990ac0-0000-7000-8000-000000000004", version: 1, vaultId, promotedMocNames: ["Kosmos Index"], createdAt: "2026-09-08T00:00:00.000Z", createdBy: `local-operator:${adoptionId}`, policy: policyRef });
  const expires = Date.now() + 7200000;
  const active = () => isEnabled() && Date.now() < expires;
  let currentDigest = null, targets = new Set(), state = null, stateQueue = Promise.resolve();
  let running = false, timer, watcher, ticking = false, eventQueued = false, errorCode = null;
  const now = () => Math.floor(performance.now());
  async function safe(path, missing = false) {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const abs = resolve(vaultRoot, ...parts.slice(0, i));
      try {
        const stat = await lstat(abs), rel = relative(vaultRoot, await realpath(abs));
        if (stat.isSymbolicLink() || rel.startsWith("..") || isAbsolute(rel)) throw new Error("TREE_LINK_OR_ESCAPE");
        if (i < parts.length && !stat.isDirectory()) throw new Error("TREE_PATH_NOT_DIRECTORY");
      } catch (e) { if (!(missing && e.code === "ENOENT")) throw e; }
    }
    return resolve(vaultRoot, path);
  }
  async function scan() {
    const dirs = [], files = []; let count = 0;
    async function walk(dir, depth) {
      if (depth > 32 || dirs.length >= 500) throw new Error("TREE_FOLDER_LIMIT");
      const absolute = await safe(dir);
      if (!(await lstat(absolute)).isDirectory()) throw new Error("TREE_PATH_NOT_DIRECTORY");
      dirs.push(dir);
      const names = (await readdir(absolute)).sort();
      const seen = new Set();
      for (const name of names) {
        if (name.startsWith(".") || name === "_archive") continue;
        const key = name.normalize("NFC").toLowerCase();
        if (seen.has(key)) throw new Error("TREE_NAME_COLLISION"); seen.add(key);
        if (++count > 10000) throw new Error("TREE_FILE_LIMIT");
        if (/[\r\n]/.test(name)) throw new Error("TREE_UNSUPPORTED_NAME");
        const path = `${dir}/${name}`, abs = await safe(path), stat = await lstat(abs);
        if (stat.isDirectory()) await walk(path, depth + 1);
        else if (stat.isFile()) {
          if (key === TARGET_NAME.toLowerCase()) {
            if (name !== TARGET_NAME) throw new Error("TREE_TARGET_CASE_COLLISION");
            continue;
          }
          files.push({ path, size: stat.size, modified: stat.mtimeMs, type: category(name) });
        } else throw new Error("TREE_UNSUPPORTED_FILE");
      }
    }
    await walk(folder, 0);
    return { dirs: dirs.sort(), files: files.sort((a, b) => a.path < b.path ? -1 : 1) };
  }
  const executor = new NodeNavigationEffectsExecutor({ vaultRoot, pathThreatModel: "cooperative-vault", preconditionValidator: async plan => {
    if (!active() || !targets.has(plan.targetPath) || plan.vaultId !== vaultId || plan.authority.grantId !== adoptionId || plan.authority.allowedRoot !== folder || plan.authority.actor.actorId !== `local-operator:${adoptionId}` || plan.authority.capability !== "moc:apply" || plan.authority.sensitivityCeiling !== "secret" || plan.policyRef.digest !== policyRef.digest || plan.configDigest !== config.digest || plan.precondition.retentionHold !== "clear") return ["TREE_AUTHORITY_DENIED"];
    if (seal(await scan()) !== currentDigest) return ["TREE_SOURCE_CHANGED"];
    return [];
  } });
  const stateName = `.gkx/effects/kosmos-tree-${hash(folder).slice(7, 31)}.json`;
  function save(update) {
    const task = stateQueue.then(async () => {
      const next = structuredClone(state); update(next);
      const dest = await safe(stateName, true);
      await mkdir(resolve(vaultRoot, ".gkx/effects"), { recursive: true });
      const tmp = await safe(`${stateName}.${randomUUID()}.tmp`, true);
      const handle = await open(tmp, "wx", 0o600);
      try { await handle.writeFile(JSON.stringify({ state: next, digest: seal(next) }) + "\n"); await handle.sync(); } finally { await handle.close(); }
      await rename(tmp, dest); state = next;
    });
    stateQueue = task.catch(() => {}); return task;
  }
  async function initialize() {
    await executor.acquireVaultLease();
    try {
      const envelope = JSON.parse(await readFile(await safe(stateName), "utf8"));
      if (seal(envelope.state) !== envelope.digest || envelope.state.version !== 1 || envelope.state.folder !== folder || envelope.state.adoptionId !== adoptionId || !envelope.state.ownership) throw new Error("TREE_STATE_INVALID");
      state = envelope.state;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = { version: 1, folder, adoptionId, ownership: {}, pending: null, intent: null };
      await save(() => {});
    }
  }
  async function recoverOwnership() {
    if (!state.pending) return;
    const pending = state.pending;
    const entries = await executor.journal.load();
    const last = entries.filter(e => e.effectId === pending.effectId).at(-1);
    if (last?.state === "COMMITTED") {
      const bytes = await executor.readSource(pending.path);
      if (bytes === null || hash(bytes) !== pending.digest) throw new Error("TREE_RECOVERY_TARGET_CONFLICT");
      await save(s => { s.ownership[pending.path] = pending.digest; s.pending = null; });
      await onCommitted(pending.path, pending.digest, pending.effectId);
    } else if (!last || ["ABORTED", "STALE"].includes(last.state)) await save(s => { s.pending = null; });
    else throw new Error("TREE_RECOVERY_REQUIRED");
  }
  function render(dir, snapshot) {
    const lines = [`# ${text(posix.basename(dir))}`, "", "<!-- gkos-navigation:managed:start -->", "Folder and file listing. Attachment contents are not indexed.", ""];
    if (dir !== folder) lines.push(`Parent: ${link(posix.basename(posix.dirname(dir)), `../${TARGET_NAME}`)}`, "");
    const children = snapshot.dirs.filter(d => posix.dirname(d) === dir);
    if (children.length) lines.push("## Folders", "", ...children.map(d => `- ${link(posix.basename(d), `${posix.basename(d)}/${TARGET_NAME}`)}`), "");
    const direct = snapshot.files.filter(f => posix.dirname(f.path) === dir);
    for (const type of ["Markdown notes", "Documents", "Images", "Audio", "Video", "Spreadsheets", "Other files"]) {
      const group = direct.filter(f => f.type === type);
      if (group.length) lines.push(`## ${type}`, "", ...group.map(f => `- ${link(posix.basename(f.path), posix.basename(f.path))}`), "");
    }
    if (!direct.length && !children.length) lines.push("This folder has no listed files.", "");
    lines.push("<!-- gkos-navigation:managed:end -->", ""); return lines.join("\n");
  }
  const coordinator = new ManagedMocCoordinator({
    loadIntent: async () => { await initialize(); return state.intent; },
    saveIntent: intent => save(s => { s.intent = intent; }),
    recover: async () => { if (!(await executor.recoverStartup()).safeToEnableWrites) return false; await recoverOwnership(); return true; },
    reconcile: async () => {
      if (!active()) throw new Error("TREE_AUTHORIZATION_PAUSED_OR_EXPIRED");
      await recoverOwnership();
      const snapshot = await scan(); currentDigest = seal(snapshot);
      targets = new Set(snapshot.dirs.map(dir => `${dir}/${TARGET_NAME}`));
      const plans = [], timestamp = new Date().toISOString();
      const authority = { actor: { actorId: `local-operator:${adoptionId}`, actorType: "human" }, grantId: adoptionId, allowedRoot: folder, capability: "moc:apply", sensitivityCeiling: "secret", policyRef, expiresAt: new Date(expires).toISOString() };
      for (const dir of snapshot.dirs) {
        const path = `${dir}/${TARGET_NAME}`, bytes = render(dir, snapshot), d = hash(bytes);
        const candidate = { artifactKind: "engine.moc-candidate", candidateId: `moc-candidate:${d.slice(7, 39)}`, directory: dir, targetPath: path, candidateBytes: bytes, digest: d, sourceSnapshotDigest: currentDigest, configRef: { id: config.configId, version: config.version, digest: config.digest }, policy: policyRef, sourceRefs: [] };
        const result = await planMocApply({ candidate, currentBytes: await executor.readSource(path), ownership: { targetPath: path, ownership: "fully-managed", creationAuthorized: true, ...(state.ownership[path] ? { adoptedDigest: state.ownership[path] } : {}) }, vaultId, corpusDigest: currentDigest, policyRef, authority, authorityEvaluatedAt: timestamp, archiveDate: timestamp.slice(0, 10), runId: randomUUID() });
        if (!["planned", "no-op"].includes(result.status)) throw new Error(`TREE_TARGET_CONFLICT: ${path}`);
        if (result.status === "planned") plans.push(result);
      }
      for (const result of plans) {
        await save(s => { s.pending = { path: result.plan.targetPath, effectId: result.plan.effectId, digest: result.plan.proposedDigest }; });
        const applied = await executor.execute({ plan: result.plan, proposedBytes: result.proposedBytes });
        if (!["committed", "no-op"].includes(applied.status)) throw new Error(`TREE_EFFECT_${applied.status.toUpperCase().replaceAll("-", "_")}`);
        await faultInjector?.("after-effect-before-ownership");
        await recoverOwnership();
      }
      errorCode = null;
    },
  });
  const fail = e => { errorCode = typeof e?.message === "string" && /^TREE_[A-Z_]+(?:: [^\r\n]+)?$/.test(e.message) ? e.message : "TREE_RECONCILIATION_FAILED"; };
  const runtime = {
    async start() {
      try {
        if (!await coordinator.start(now())) return false;
        running = true;
        try { watcher = watch(normalize(await safe(folder)), { recursive: true }, () => {
          if (!running || eventQueued) return;
          eventQueued = true;
          void coordinator.requestReconciliation(now()).catch(fail).finally(() => { eventQueued = false; });
        }); watcher.on("error", () => { errorCode = "TREE_WATCHER_FAILED"; }); }
        catch { errorCode = "TREE_WATCHER_UNAVAILABLE"; }
        timer = setInterval(() => { if (!running || ticking) return; ticking = true; void coordinator.tick(now()).catch(fail).finally(() => { ticking = false; }); }, 250);
        return true;
      } catch (e) { fail(e); await runtime.shutdown(); throw e; }
    },
    async reconcileNow() { await coordinator.requestReconciliation(now()); await coordinator.tick(now(), true); },
    async shutdown() {
      running = false; watcher?.close(); if (timer) clearInterval(timer);
      try { await coordinator.stop(); await coordinator.tick(now()); await stateQueue; await executor.shutdown(); return { clean: true }; }
      catch { return { clean: false }; }
    },
    get status() { return { ...coordinator.status, running, watcherActive: !!watcher && running, errorCode }; },
  };
  return { runtime, target, preview: async () => { const s = await scan(); return [...s.dirs.map(d => `INDEX: ${d}/${TARGET_NAME}`), ...s.files.map(f => `${f.type}: ${f.path}`)]; } };
}
