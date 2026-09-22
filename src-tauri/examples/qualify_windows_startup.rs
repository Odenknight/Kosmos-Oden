#[path = "../src/sidecar_release.rs"]
mod sidecar_release;

#[cfg(windows)]
fn graph_request(
    port: u16,
    token: Option<&str>,
) -> Result<(u16, serde_json::Value), Box<dyn std::error::Error>> {
    use std::{
        io::{Read, Write},
        net::{SocketAddr, TcpStream},
        time::Duration,
    };
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    let authorization = token
        .map(|value| format!("Authorization: Bearer {value}\r\n"))
        .unwrap_or_default();
    // Fixed HTTP/1.0 request avoids transfer coding in this bounded local fixture.
    write!(
        stream,
        "GET /graph HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n{authorization}Connection: close\r\n\r\n"
    )?;
    let mut bytes = Vec::new();
    stream.take(1_048_577).read_to_end(&mut bytes)?;
    if bytes.len() > 1_048_576 {
        return Err("synthetic response exceeds bound".into());
    }
    let separator = bytes
        .windows(4)
        .position(|part| part == b"\r\n\r\n")
        .ok_or("missing HTTP headers")?;
    let headers = std::str::from_utf8(&bytes[..separator])?;
    let code = headers
        .split_whitespace()
        .nth(1)
        .ok_or("missing HTTP status")?
        .parse()?;
    Ok((code, serde_json::from_slice(&bytes[separator + 4..])?))
}
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
        "---\ngkx_version: \"2.3\"\nuid: \"019b2d14-4230-7db7-87d4-7d81cfaec932\"\ntitle: \"Synthetic startup fixture\"\ntype: \"policy\"\ncreated_at: \"2026-08-20T00:00:00Z\"\nepistemic_state: \"reported\"\nsensitivity: \"public\"\n---\n# Synthetic startup fixture\nNo vault data.\n",
    )?;
    let state = root.join("state");
    for phase in ["initial", "restart"] {
        let guard = windows_state::ensure(&state)?;
        let log_root = root.join("logs");
        let _log_guard = windows_state::ensure(&log_root)?;
        let log = windows_state::open_log(&log_root.join("desktop-agent.log"))?;
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();
        drop(listener);
        let mut child = Reap(
            Command::new(&binary)
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
        let mut qualified = false;
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
                    && status["notes_indexed"] == 1
                    && status["pid"] == child.0.id()
                {
                    let token = windows_state::read_credential(&state.join("desktop-agent.token"))?;
                    if graph_request(port, None)?.0 != 401 {
                        return Err("unauthenticated graph was not denied".into());
                    }
                    let (code, graph) = graph_request(port, Some(&token))?;
                    if code != 200
                        || !graph["nodes"]
                            .as_array()
                            .ok_or("missing graph nodes")?
                            .iter()
                            .any(|node| node["path"] == "synthetic.md")
                    {
                        return Err("authenticated synthetic graph retrieval failed".into());
                    }
                    println!(
                        "PASS ({phase}): verified Engine indexed one document; native credential, unauthenticated denial and authenticated graph retrieval passed; synthetic fixture {}",
                        root.display()
                    );
                    qualified = true;
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if !qualified {
            return Err(format!("synthetic {phase} timed out; fixture {}", root.display()).into());
        }
        drop(child); // Reap before revalidating state and launching the next process.
    }
    Ok(())
}

#[cfg(not(windows))]
fn main() {
    panic!("Windows qualification example");
}
