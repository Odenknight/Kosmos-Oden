import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "kosmos-oden-stand-alone.html");
const generated = resolve(root, "src-tauri", "generated");
const output = resolve(generated, "index.html");

if (!existsSync(source)) {
  console.error("prepare-desktop: missing kosmos-oden-stand-alone.html; run npm run build:standalone first");
  process.exit(1);
}

const bridge = `<script data-kosmos-desktop-bridge>
(() => {
  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  window.__KOSMOS_DESKTOP_IPC__ = Object.freeze({
    takeViewerToken: () => invoke("take_viewer_token")
  });
  addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("aside");
    bar.id = "kosmos-desktop-controls";
    bar.setAttribute("aria-label", "Desktop engine controls");
    bar.innerHTML = '<button data-action="choose">Choose corpus</button><button data-action="start" disabled>Start engine</button><button data-action="stop">Stop</button><button data-action="reconnect">Reconnect</button><button data-action="diagnostics">Export diagnostics</button><span role="status">Offline folder mode</span>';
    Object.assign(bar.style, { position: "fixed", right: "12px", bottom: "12px", zIndex: "2147483647", padding: "8px", borderRadius: "8px", background: "rgba(5,12,19,.92)", color: "#d8f6ea", display: "flex", gap: "6px", alignItems: "center", font: "12px system-ui" });
    let corpus = "";
    const status = bar.querySelector('[role="status"]');
    const start = bar.querySelector('[data-action="start"]');
    const show = (message) => { status.textContent = message; };
    bar.addEventListener("click", async (event) => {
      const action = event.target?.dataset?.action;
      try {
        if (action === "choose") { corpus = await invoke("choose_corpus") || ""; start.disabled = !corpus; show(corpus ? "Corpus selected" : "Offline folder mode"); }
        if (action === "start") { const value = await invoke("start_sidecar", { corpus }); show(value.running ? "Engine starting on 127.0.0.1:4814" : "Engine unavailable — offline mode"); if (value.running) location.replace(location.pathname + "?api=http%3A%2F%2F127.0.0.1%3A4814"); }
        if (action === "stop") { await invoke("stop_sidecar"); show("Engine stopped — offline folder mode"); }
        if (action === "reconnect") { const value = await invoke("reconnect_sidecar"); show(value.running ? "Engine reconnected" : "Engine unavailable — offline mode"); }
        if (action === "diagnostics") { const path = await invoke("export_redacted_diagnostics"); show(path ? "Redacted diagnostics exported" : "Export cancelled"); }
      } catch (error) { show(String(error)); }
    });
    document.body.appendChild(bar);
  });
})();
</script>`;

const html = readFileSync(source, "utf8");
if (!html.includes("</head>")) {
  console.error("prepare-desktop: standalone viewer has no </head> boundary");
  process.exit(1);
}
rmSync(generated, { recursive: true, force: true });
mkdirSync(generated, { recursive: true });
writeFileSync(output, html.replace("</head>", `${bridge}\n</head>`));
console.log(`prepare-desktop: generated ${output} from the canonical standalone viewer`);
