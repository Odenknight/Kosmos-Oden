# glib 0.18.5 security backport

This directory begins with the crates.io source for glib 0.18.5. Product code differs only by the two line correction in `src/variant_iter.rs` described below. The same module contains a focused regression test, and this provenance file plus `Cargo.lock` support repeatable verification.

The original `glib-0.18.5.crate` SHA256 is `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`. This matches the checksum in the preoverride `Cargo.lock` entry.

Upstream source: https://crates.io/crates/glib/0.18.5

Upstream correction: https://github.com/gtk-rs/gtk-rs-core/pull/1343

Upstream correction commit: https://github.com/gtk-rs/gtk-rs-core/commit/05dff0ee696f9bcd8617cd48c4b812d046d440cb

The correction makes the output pointer passed to `g_variant_get_child` mutable. No crate metadata, version, dependency, or license has been changed.
