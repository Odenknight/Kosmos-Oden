/**
 * Cosmology classification tests.
 *
 * The classification RULES are pure functions (classifyStar / classifyPlanet)
 * and are tested directly here — decoupled from the degree-based role
 * assignment, which decides *which* notes become stars vs planets and is not
 * what these features change. A lean integration test confirms buildCosmos
 * wires the classes onto real nodes and that the enlarged radii survive layout.
 *
 * Star classes follow the Hertzsprung–Russell main sequence (M→O); planet
 * types follow NASA's four exoplanet classes (science.nasa.gov/exoplanets/planet-types).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph } from "../dist/kosmos-core.mjs";
import {
  buildCosmos,
  positionCosmos,
  classifyStar,
  classifyPlanet,
  starScore,
  SPECTRAL,
  PLANET_COLORS,
} from "../dist/kosmos-layout.mjs";

/* ---------------- H-R stellar classification (pure) ---------------- */

test("classifyStar: score monotonically climbs the main sequence M→O", () => {
  const MAX = 40;
  const seq = [0, 3, 8, 14, 20, 28, 40].map((s) => classifyStar(s, MAX).cls);
  // as score rises, spectral class should move up the sequence (never backwards)
  const ORDER = "MKGFABO";
  for (let i = 1; i < seq.length; i++) {
    assert.ok(ORDER.indexOf(seq[i]) >= ORDER.indexOf(seq[i - 1]), `${seq[i - 1]} -> ${seq[i]} must not go backwards`);
  }
  assert.equal(classifyStar(40, 40).cls, "O", "top score = hottest class");
  assert.equal(classifyStar(0, 40).cls, "M", "zero score = coolest class");
});

test("classifyStar: hotter classes are larger and every class has a color", () => {
  let lastMult = Infinity;
  for (const s of SPECTRAL) {
    assert.match(s.color, /^#[0-9a-f]{6}$/i);
    assert.ok(s.mult <= lastMult, "multiplier decreases M-ward"); lastMult = s.mult;
  }
  assert.ok(classifyStar(40, 40).mult > classifyStar(0, 40).mult, "O bigger than M");
});

test("classifyStar: denominator floor prevents a tiny vault minting an O/B giant", () => {
  // maxScore below the floor (12): even the vault's heaviest star stays modest
  assert.ok(!["O", "B"].includes(classifyStar(3, 3).cls), "3-point vault must not be O/B");
});

test("starScore rises with files, subfolders and bytes", () => {
  assert.ok(starScore(10, 2, 8192) > starScore(3, 1, 512));
  assert.ok(starScore(5, 3, 0) > starScore(5, 0, 0), "more subfolders -> heavier");
  assert.ok(starScore(5, 0, 65536) > starScore(5, 0, 0), "more bytes -> heavier");
});

/* ---------------- NASA exoplanet classification (pure) ---------------- */

test("classifyPlanet: moon count picks the class; rings only on gas giants", () => {
  const gas = classifyPlanet(4, 0, 1000, 0.2);
  assert.equal(gas.name, "Gas giant"); assert.equal(gas.rings, true);
  assert.ok(["jupiter", "saturn"].includes(gas.variant));

  const nep = classifyPlanet(2, 0, 1000, 0.2);
  assert.equal(nep.name, "Neptunian"); assert.equal(nep.rings, false);
  assert.ok(["neptune", "uranus"].includes(nep.variant));

  const sup = classifyPlanet(1, 0, 1000, 0.2);
  assert.equal(sup.name, "Super-Earth"); assert.equal(sup.rings, false);

  const terr = classifyPlanet(0, 0, 1000, 0.9);
  assert.equal(terr.name, "Terrestrial"); assert.equal(terr.rings, false);
});

test("classifyPlanet: a hefty leaf note (>24 KB) becomes a Super-Earth", () => {
  assert.equal(classifyPlanet(0, 0, 40 * 1024, 0.9).name, "Super-Earth");
  assert.equal(classifyPlanet(0, 0, 2 * 1024, 0.9).name, "Terrestrial");
});

test("classifyPlanet: hosted attachments bias water/earth varieties", () => {
  assert.equal(classifyPlanet(0, 2, 1000, 0.9).variant, "earth", "attachment-hosting terrestrial = Earth (water)");
  assert.equal(classifyPlanet(1, 3, 1000, 0.9).variant, "super-water", "attachment-hosting super-Earth = water world");
  assert.equal(classifyPlanet(2, 1, 1000, 0.9).variant, "neptune", "attachment-hosting neptunian = Neptune");
});

test("classifyPlanet: seed selects a deterministic in-class variety; all colors resolve", () => {
  // gas giant flips jupiter/saturn on the hash
  assert.equal(classifyPlanet(4, 0, 0, 0.2).variant, "jupiter");
  assert.equal(classifyPlanet(4, 0, 0, 0.8).variant, "saturn");
  for (const v of Object.keys(PLANET_COLORS)) assert.match(PLANET_COLORS[v], /^#[0-9a-f]{6}$/i);
});

/* ---------------- integration: buildCosmos wires it onto nodes ---------------- */

/** A galaxy with a dominant MOC-hub star and lower-degree children as planets. */
function galaxyWithPlanets() {
  const files = [];
  // Folder manifest -> galactic center. A dominant star note links widely.
  files.push({ relativePath: "Zoo/Zoo.md", content: "# Zoo index\n[[Star]]", size: 512 });
  files.push({ relativePath: "Zoo/Star.md", content: "# Star\n" + ["Pa", "Pb", "Pc", "Pd", "Pe", "Pf", "Pg", "Ph"].map((p) => `[[${p}]]`).join(" "), size: 4096 });
  for (const p of ["Pa", "Pb", "Pc", "Pd", "Pe", "Pf", "Pg", "Ph"]) files.push({ relativePath: `Zoo/${p}.md`, content: `planet ${p}`, size: 900 });
  return buildGraph(files, ["Zoo"]);
}

test("buildCosmos: stars carry a spectral class + color; planets carry a NASA type + color", () => {
  const g = buildCosmos(galaxyWithPlanets(), {});
  const stars = g.nodes.filter((n) => n.role === "star");
  const planets = g.nodes.filter((n) => n.role === "planet");
  assert.ok(stars.length >= 1, "at least one star");
  assert.ok(planets.length >= 1, "at least one planet");
  for (const s of stars) {
    assert.ok(s.__spectral && /^[OBAFGKM]$/.test(s.__spectral.cls));
    assert.match(s.__starColor, /^#[0-9a-f]{6}$/i);
  }
  for (const p of planets) {
    assert.ok(["Terrestrial", "Gas giant", "Neptunian", "Super-Earth"].includes(p.__ptypeName));
    assert.match(p.__pcolor, /^#[0-9a-f]{6}$/i);
    assert.equal(typeof p.__pstyle, "number");
    if (p.__ptypeName !== "Gas giant") assert.equal(p.__rings, false);
  }
});

test("buildCosmos: heavier system → hotter/larger star than a light one", () => {
  // Two galaxies: one heavy (many notes/subfolders/bytes), one light.
  const files = [];
  files.push({ relativePath: "Big/Big.md", content: "# Big\n" + Array.from({ length: 16 }, (_, i) => `[[b${i}]]`).join(" "), size: 8192 });
  for (let i = 0; i < 16; i++) files.push({ relativePath: `Big/${i % 2 ? "S1" : "S2"}/b${i}.md`, content: "x".repeat(4096), size: 4096 });
  files.push({ relativePath: "Small/Small.md", content: "# Small\n[[s1]]", size: 256 });
  files.push({ relativePath: "Small/s1.md", content: "s1", size: 128 });
  const g = buildCosmos(buildGraph(files, ["Big", "Big/S1", "Big/S2", "Small"]), {});
  const big = g.nodes.filter((n) => n.role === "star" && n.galaxyId === "Big").sort((a, b) => b.__spectral.t - a.__spectral.t)[0];
  const small = g.nodes.filter((n) => n.role === "star" && n.galaxyId === "Small")[0];
  assert.ok(big && small, "a star in each galaxy");
  assert.ok(big.__spectral.t > small.__spectral.t, "heavier system scores hotter");
  assert.ok(big.__r > small.__r, "heavier star renders larger");
});

test("buildCosmos: classified radii survive layout with bounded residual collisions", () => {
  const g = positionCosmos(galaxyWithPlanets(), {});
  for (const n of g.nodes) {
    if (n.role === "hidden") continue;
    assert.ok(Array.isArray(n.position) && n.position.every((v) => Number.isFinite(v)), `position for ${n.id}`);
  }
  assert.equal(typeof g.__residualCollisions, "number");
  assert.ok(g.__residualCollisions <= 2, `residual collisions bounded: ${g.__residualCollisions}`);
});
