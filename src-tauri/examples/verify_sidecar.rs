#[path = "../src/sidecar_release.rs"]
mod sidecar_release;

fn main() {
    let mut args = std::env::args_os().skip(1);
    let binary = args.next().expect("usage: verify_sidecar BINARY");
    assert!(args.next().is_none(), "usage: verify_sidecar BINARY");
    let release = sidecar_release::Release::embedded().expect("no valid embedded release manifest");
    let _verified = release.verify(std::path::Path::new(&binary)).expect("binary identity mismatch");
    println!("Verified sidecar bytes for version {}", release.version);
}
