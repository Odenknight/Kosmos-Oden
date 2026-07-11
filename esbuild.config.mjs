import esbuild from "esbuild";

const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "cjs",
  target: "es2018",
  platform: "browser",
  // Provided by Obsidian at runtime — never bundle these:
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", "node:*"],
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
}).catch(() => process.exit(1));
