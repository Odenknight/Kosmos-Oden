# Sidecar identity candidate

`src-tauri/sidecar-release.json` is compiled into the shell. Its default `null`
disables sidecar discovery and launch. Packaging must supply a reviewed manifest
with schema `1`, version, 40-character source commit, OS, architecture, byte length
and lowercase SHA-256. A colocated runtime manifest cannot grant trust.

Discovery, version display and launch verify the binary against that embedded
record. Version display reads the verified manifest rather than running an
unbounded `--version` subprocess. The manifest's source commit is a build claim;
release qualification must establish its relationship to the executable bytes.

Verification streams at most the declared size (maximum 1 GiB), rejects a final
symlink and retains an open file through process creation. Windows opens deny
write/delete sharing. The synthetic Windows test confirms write-open refusal
while the handle is held and rejects modified bytes and a wrong target.

This is an isolated implementation candidate, not desktop acceptance. Packaging
manifest generation, actual executable launch, ancestor replacement/reparse-point
tests, non-Windows race behavior, hash-work responsiveness, Windows state ACLs,
and the canonical viewer build remain unqualified. The temporary generated
frontend used for Rust tests is explicitly a test fixture, not the viewer.
