import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
const OBSIDIAN_STUB = String.raw`
const opts = (el, o = {}) => {
  if (o.text !== undefined) el.textContent = o.text;
  if (o.cls) el.classList.add(...String(o.cls).split(/\s+/).filter(Boolean));
  for (const [key, value] of Object.entries(o.attr || {})) el.setAttribute(key, String(value));
  return el;
};
for (const [name, value] of Object.entries({
  empty() { this.replaceChildren(); },
  createEl(tag, o) { return this.appendChild(opts(document.createElement(tag), o)); },
  createDiv(o) { return this.createEl("div", o); },
  addClass(...names) { this.classList.add(...names); },
  removeClass(...names) { this.classList.remove(...names); },
})) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, value });

export class App {}
export class Modal {
  constructor(app) {
    this.app = app;
    this.containerEl = document.body.createDiv({ cls: "modal-container" });
    this.modalEl = this.containerEl.createDiv({ attr: { role: "dialog", "aria-modal": "true" } });
    this.titleEl = this.modalEl.createEl("h2", { attr: { id: "modal-title" } });
    this.modalEl.setAttribute("aria-labelledby", "modal-title");
    this.contentEl = this.modalEl.createDiv();
  }
  setTitle(text) { this.titleEl.textContent = text; return this; }
  open() { this.onOpen(); }
  close() { this.onClose(); this.containerEl.remove(); }
}
class Button {
  constructor(parent) { this.buttonEl = parent.createEl("button", { attr: { type: "button" } }); }
  setButtonText(v) { this.buttonEl.textContent = v; return this; }
  setDisabled(v) { this.buttonEl.disabled = v; return this; }
  setCta() { return this; }
  onClick(fn) { this.buttonEl.addEventListener("click", fn); return this; }
}
class Dropdown {
  constructor(parent) { this.selectEl = parent.createEl("select"); }
  addOption(v, label) { const o = this.selectEl.createEl("option", { text: label }); o.value = v; return this; }
  setValue(v) { this.selectEl.value = v; return this; }
  onChange(fn) { this.selectEl.addEventListener("change", () => fn(this.selectEl.value)); return this; }
}
class Text {
  constructor(parent) { this.inputEl = parent.createEl("input", { attr: { type: "text" } }); }
  setValue(v) { this.inputEl.value = v; return this; }
  setPlaceholder(v) { this.inputEl.placeholder = v; return this; }
  onChange(fn) { this.inputEl.addEventListener("input", () => fn(this.inputEl.value)); return this; }
}
export class Setting {
  constructor(parent) {
    this.settingEl = parent.createDiv(); this.infoEl = this.settingEl.createDiv();
    this.nameEl = this.infoEl.createDiv(); this.descEl = this.infoEl.createDiv();
    this.controlEl = this.settingEl.createDiv();
  }
  setName(v) { this.nameEl.textContent = v; return this; }
  setDesc(v) { this.descEl.textContent = v; return this; }
  addButton(fn) { fn(new Button(this.controlEl)); return this; }
  addDropdown(fn) { fn(new Dropdown(this.controlEl)); return this; }
  addText(fn) { fn(new Text(this.controlEl)); return this; }
}`;

const result = await build({
  stdin: { contents: 'import { App } from "obsidian"; import { MocAdoptionModal } from "./src/ui/moc-adoption-modal.ts"; window.__adoptionExports={App,MocAdoptionModal};', resolveDir: ROOT, loader: "ts" },
  bundle: true, format: "iife", platform: "browser", target: "es2022", write: false, logLevel: "silent",
  plugins: [{ name: "obsidian-stub", setup(builder) {
    builder.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "stub" }));
    builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: OBSIDIAN_STUB, loader: "js" }));
  } }],
});
const browserBundle = result.outputFiles[0].text;

const sha = (c: string): string => `sha256:${c.repeat(64)}`;
const configDigest = sha("a");
const preview = {
  artifactKind: "kosmos.navigation-effects-adoption-preview", previewDigest: sha("f"), operationId: "operation-1",
  targetPath: "MOCs/Alpha.md", ownership: "region-managed", currentDigest: sha("1"), proposedDigest: sha("2"),
  policyDigest: sha("3"), configDigest, actorDigest: sha("4"), priorRegistryDigest: sha("5"), priorRegistryGeneration: 7,
  binding: { schemaVersion: 1, targetPath: "MOCs/Alpha.md", ownership: "region-managed", adoptedDigest: sha("1"),
    generatedRegion: { markerVersion: "1", configDigest, startOffset: 13, endOffset: 185, bodyDigest: sha("6") } },
  preservedHumanPrefix: "Human prefix\r\n", preservedHumanSuffix: "\r\nHuman suffix\r\n",
  exactDiff: "--- current\n+++ candidate\n@@ exact bytes @@\n-current\n+candidate",
  semanticSummary: "Adopt exactly one generated region; preserve surrounding bytes.", confirmable: true, reasonCodes: [],
};

async function load(page: Page): Promise<void> {
  await page.setContent('<button id="opener" type="button">Open adoption review</button>');
  await page.addScriptTag({ content: browserBundle });
}

async function open(page: Page, value: typeof preview, options: { recordError?: string; noFreshness?: boolean } = {}): Promise<void> {
  await page.evaluate(({ value, options }) => {
    const api = (window as any).__adoptionExports;
    document.querySelector<HTMLButtonElement>("#opener")!.focus();
    let release: (value: unknown) => void = () => undefined;
    let latest: unknown = { current: true };
    const initial = new Promise((resolve) => { release = resolve; });
    let calls = 0;
    const state: any = { recorded: 0, freshnessCalls: 0 };
    const check = options.noFreshness ? undefined : async () => {
      state.freshnessCalls = ++calls;
      return calls === 1 ? initial : latest;
    };
    const modal = new api.MocAdoptionModal(new api.App(), async () => structuredClone(value), async () => {
      state.recorded += 1;
      if (options.recordError) throw new Error(options.recordError);
    }, check);
    state.modal = modal;
    state.release = (result: unknown) => { latest = result; release(result); };
    (window as any).__adoptionHarness = state;
    modal.open();
  }, { value, options });
}

async function reachReview(page: Page): Promise<void> {
  await page.getByLabel("Ownership mode").selectOption("region-managed");
  await page.getByRole("button", { name: "Generate candidate preview" }).click();
  await page.getByRole("button", { name: "Review exact diff" }).click();
}

test("trusted modal is freshness and phrase gated, focuses errors, and restores its opener", async ({ page }) => {
  await load(page);
  await open(page, preview, { recordError: "registry persistence failed" });
  await expect(page.getByRole("heading", { name: "Adopt MOC ownership — step 1 of 2" })).toBeFocused();
  await page.getByLabel("Ownership mode").selectOption("region-managed");
  await page.getByRole("button", { name: "Generate candidate preview" }).click();
  await expect(page.locator("[data-adoption-validation]")).toBeFocused();
  await expect(page.getByText("Validated generated region")).toBeVisible();
  await page.getByRole("button", { name: "Review exact diff" }).click();

  const confirm = page.getByRole("button", { name: "Record adoption only" });
  await expect(page.getByRole("heading", { name: "Confirm exact MOC adoption — step 2 of 2" })).toBeFocused();
  await expect(page.getByText("Checking exact current state…")).toBeVisible();
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => (window as any).__adoptionHarness.release({ current: true }));
  await expect(page.getByText("Exact current-state check passed")).toBeVisible();
  await expect(confirm).toBeDisabled();

  const phrase = page.getByLabel("Type ADOPT MOCs/Alpha.md to confirm adoption");
  await phrase.fill("ADOPT MOCs/Wrong.md");
  await expect(confirm).toBeDisabled();
  await phrase.fill("ADOPT MOCs/Alpha.md");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  const error = page.getByRole("alert");
  await expect(error).toContainText("registry persistence failed");
  await expect(error).toContainText("No MOC bytes were changed");
  await expect(error).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__adoptionHarness.recorded)).toBe(1);
  await page.evaluate(() => (window as any).__adoptionHarness.modal.close());
  await expect(page.locator("#opener")).toBeFocused();
});

test("blocked marker state cannot reach confirmation", async ({ page }) => {
  await load(page);
  const blocked = { ...preview, binding: undefined, confirmable: false, reasonCodes: ["MARKER_NESTED"], semanticSummary: "Marker review required." };
  await open(page, blocked as typeof preview);
  await page.getByLabel("Ownership mode").selectOption("region-managed");
  await page.getByRole("button", { name: "Generate candidate preview" }).click();
  const blocker = page.getByRole("alert");
  await expect(blocker).toContainText("Candidate is blocked");
  await expect(blocker).toContainText("MARKER_NESTED");
  await expect(blocker).toBeFocused();
  await expect(page.getByRole("button", { name: "Review exact diff" })).toBeDisabled();
});

test("missing freshness provider fails closed", async ({ page }) => {
  await load(page);
  await open(page, preview, { noFreshness: true });
  await reachReview(page);
  await expect(page.getByText("Current-state verification unavailable")).toBeVisible();
  await page.getByLabel("Type ADOPT MOCs/Alpha.md to confirm adoption").fill("ADOPT MOCs/Alpha.md");
  await expect(page.getByRole("button", { name: "Record adoption only" })).toBeDisabled();
});
