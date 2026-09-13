#[path = "../src/sidecar_release.rs"]
mod sidecar_release;
#[path = "../src/viewer_credential.rs"]
mod viewer_credential;
#[cfg(windows)]
#[path = "../src/windows_state.rs"]
mod windows_state;

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use std::os::windows::process::CommandExt;
    use std::{
        fs,
        io::Read,
        net::TcpListener,
        path::PathBuf,
        process::{Child, Command, Stdio},
        time::{Duration, Instant},
    };
    struct Reap(Child);
    impl Drop for Reap {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
    let binary = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .ok_or("binary argument required")?,
    );
    let release =
        sidecar_release::Release::embedded().ok_or("explicit qualification manifest required")?;
    let _verified = release.verify(&binary).ok_or("binary mismatch")?;
    let root = std::env::temp_dir().join(format!(
        "kosmos-process-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_nanos()
    ));
    fs::create_dir(&root)?;
    let notes = root.join("notes");
    fs::create_dir(&notes)?;
    fs::write(
        notes.join("synthetic.md"),
        "# Synthetic startup fixture\nNo vault data.\n",
    )?;
    let state = root.join("state");
    let guard = windows_state::ensure(&state)?;
    let log = windows_state::open_log(&state.join("desktop-agent.log"))?;
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    let mut child = Reap(
        Command::new(binary)
            .args(["--notes"])
            .arg(&notes)
            .arg("--status-file")
            .arg(state.join("desktop-agent.status.json"))
            .arg("--port")
            .arg(port.to_string())
            .env_remove("GKOS_CODEX_MCP_ENABLED")
            .env_remove("GKOS_LOCAL_EMBEDDING_CONFIG")
            .env_remove("GKOS_MCP_CONTENT_LIMITS")
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stderr(Stdio::from(log.try_clone()?))
            .stdout(Stdio::from(log))
            .spawn()?,
    );
    drop(guard); // Match the production spawn boundary.
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if let Some(exit) = child.0.try_wait()? {
            return Err(
                format!("synthetic child exited: {exit}; fixture {}", root.display()).into(),
            );
        }
        if let Ok(file) = fs::File::open(state.join("desktop-agent.status.json")) {
            let mut bytes = Vec::new();
            file.take(65537).read_to_end(&mut bytes)?;
            if bytes.len() <= 65536
                && let Ok(status) = serde_json::from_slice::<serde_json::Value>(&bytes)
                && status["state"] == "serving"
            {
                windows_state::read_credential(&state.join("desktop-agent.token"))?;
                println!(
                    "PASS: verified Engine reached serving and native credential validation succeeded; synthetic fixture {}",
                    root.display()
                );
                return Ok(());
            }
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!("synthetic startup timed out; fixture {}", root.display()).into())
}

#[cfg(not(windows))]
fn main() {
    panic!("Windows qualification example");
}
