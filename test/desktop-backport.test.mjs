import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");

// Recovered from PR41's historical desktop suite. This checks retained source
// and provenance markers; it does not qualify Linux runtime memory safety.
test("desktop shell retains the recorded glib 0.18.5 backport and provenance", () => {
  const cargo = read("src-tauri/Cargo.toml");
  const vendoredCargo = read("src-tauri/vendor/glib-0.18.5/Cargo.toml");
  const variantIter = read("src-tauri/vendor/glib-0.18.5/src/variant_iter.rs");
  const provenance = read("src-tauri/vendor/glib-0.18.5/KOSMOS_BACKPORT.md");

  assert.match(cargo, /\[patch\.crates-io\][\s\S]*glib = \{ path = "vendor\/glib-0\.18\.5" \}/);
  assert.match(vendoredCargo, /name = "glib"[\s\S]*version = "0\.18\.5"/);
  assert.match(vendoredCargo, /license = "MIT"/);
  assert.match(variantIter, /let mut p: \*mut libc::c_char = std::ptr::null_mut\(\);/);
  assert.match(variantIter, /g_variant_get_child\([\s\S]*&mut p,/);
  assert.doesNotMatch(variantIter, /g_variant_get_child\([\s\S]*?\n\s*&p,/);
  assert.match(provenance, /233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5/);
  assert.match(provenance, /05dff0ee696f9bcd8617cd48c4b812d046d440cb/);
});
