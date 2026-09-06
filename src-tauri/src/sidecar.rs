use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const PORT: u16 = 4814;
const MAX_RESTARTS: u8 = 5;
const RESTART_BACKOFF_MS: [u64; 5] = [250, 500, 1_000, 2_000, 4_000];

#[derive(Clone)]
pub struct Supervisor {
    inner: Arc<Mutex<Inner>>,
    sidecar_path: Option<PathBuf>,
}

struct Inner {
    child: Option<Child>,
    corpus: Option<PathBuf>,
    state_root: Option<PathBuf>,
    desired_running: bool,
    generation: u64,
    restart_count: u8,
    last_exit: Option<i32>,
    last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub available: bool,
    pub running: bool,
    pub service_url: &'static str,
    pub restart_count: u8,
    pub last_exit: Option<i32>,
    pub last_error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedactedDiagnostics {
    schema_version: u8,
    shell_version: &'static str,
    release_status: &'static str,
    sidecar_available: bool,
    sidecar_running: bool,
    service_url: &'static str,
    restart_count: u8,
    last_exit: Option<i32>,
    error_class: Option<&'static str>,
    redaction: &'static str,
}

impl Supervisor {
    pub fn discover(app: &AppHandle, state_root: &Path) -> Self {
        let sidecar_path = discover_sidecar(app, state_root);
        Self {
            inner: Arc::new(Mutex::new(Inner {
                child: None,
                corpus: None,
                state_root: None,
                desired_running: false,
                generation: 0,
                restart_count: 0,
                last_exit: None,
                last_error: None,
            })),
            sidecar_path,
        }
    }

    #[cfg(test)]
    fn with_sidecar(sidecar_path: Option<PathBuf>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                child: None,
                corpus: None,
                state_root: None,
                desired_running: false,
                generation: 0,
                restart_count: 0,
                last_exit: None,
                last_error: None,
            })),
            sidecar_path,
        }
    }

    pub fn sidecar_path(&self) -> Option<&Path> {
        self.sidecar_path.as_deref()
    }

    pub fn start(&self, corpus: PathBuf, app_state_root: &Path) -> Result<SidecarStatus, String> {
        let executable = self.sidecar_path.as_ref().ok_or_else(|| {
            "gkos-agent is not installed beside the app; offline folder mode remains available"
                .to_string()
        })?;
        let sidecar_state = app_state_root.join("sidecar");
        fs::create_dir_all(&sidecar_state)
            .map_err(|error| format!("cannot prepare sidecar state: {error}"))?;
        owner_only_directory(&sidecar_state)
            .map_err(|error| format!("cannot protect sidecar state: {error}"))?;

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "sidecar state lock failed".to_string())?;
        terminate_child(&mut inner);
        inner.generation = inner.generation.wrapping_add(1);
        inner.corpus = Some(corpus);
        inner.state_root = Some(sidecar_state);
        inner.desired_running = true;
        inner.restart_count = 0;
        inner.last_exit = None;
        inner.last_error = None;
        spawn_locked(&mut inner, executable)?;
        let generation = inner.generation;
        drop(inner);
        self.monitor(generation);
        Ok(self.status())
    }

    pub fn stop(&self) -> Result<SidecarStatus, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "sidecar state lock failed".to_string())?;
        inner.desired_running = false;
        inner.generation = inner.generation.wrapping_add(1);
        terminate_child(&mut inner);
        drop(inner);
        Ok(self.status())
    }

    pub fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.desired_running = false;
            inner.generation = inner.generation.wrapping_add(1);
            terminate_child(&mut inner);
        }
    }

    pub fn reconnect(&self, app_state_root: &Path) -> Result<SidecarStatus, String> {
        let corpus = self
            .inner
            .lock()
            .map_err(|_| "sidecar state lock failed".to_string())?
            .corpus
            .clone()
            .ok_or_else(|| "choose a corpus before reconnecting".to_string())?;
        self.start(corpus, app_state_root)
    }

    pub fn status(&self) -> SidecarStatus {
        let mut inner = self.inner.lock().expect("sidecar state lock poisoned");
        let running = inner
            .child
            .as_mut()
            .is_some_and(|child| child.try_wait().ok().flatten().is_none());
        SidecarStatus {
            available: self.sidecar_path.is_some(),
            running,
            service_url: "http://127.0.0.1:4814",
            restart_count: inner.restart_count,
            last_exit: inner.last_exit,
            last_error: inner.last_error.clone(),
        }
    }

    pub fn sidecar_version(&self) -> Option<String> {
        let executable = self.sidecar_path.as_ref()?;
        let output = Command::new(executable).arg("--version").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let value = String::from_utf8(output.stdout).ok()?.trim().to_string();
        (!value.is_empty() && value.len() <= 200).then_some(value)
    }

    fn monitor(&self, generation: u64) {
        let supervisor = self.clone();
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(250));
                let restart_delay = {
                    let mut inner = match supervisor.inner.lock() {
                        Ok(value) => value,
                        Err(_) => return,
                    };
                    if inner.generation != generation || !inner.desired_running {
                        return;
                    }
                    let Some(child) = inner.child.as_mut() else {
                        return;
                    };
                    match child.try_wait() {
                        Ok(None) => continue,
                        Ok(Some(status)) => {
                            inner.last_exit = status.code();
                            inner.child = None;
                            if inner.restart_count >= MAX_RESTARTS {
                                inner.desired_running = false;
                                inner.last_error =
                                    Some("sidecar restart limit reached".to_string());
                                return;
                            }
                            let delay = RESTART_BACKOFF_MS[usize::from(inner.restart_count)];
                            inner.restart_count += 1;
                            delay
                        }
                        Err(_) => {
                            inner.desired_running = false;
                            inner.last_error =
                                Some("sidecar process status unavailable".to_string());
                            return;
                        }
                    }
                };
                thread::sleep(Duration::from_millis(restart_delay));
                let mut inner = match supervisor.inner.lock() {
                    Ok(value) => value,
                    Err(_) => return,
                };
                if inner.generation != generation || !inner.desired_running {
                    return;
                }
                let Some(executable) = supervisor.sidecar_path.as_ref() else {
                    return;
                };
                if let Err(error) = spawn_locked(&mut inner, executable) {
                    inner.desired_running = false;
                    inner.last_error = Some(error);
                    return;
                }
            }
        });
    }
}

fn discover_sidecar(app: &AppHandle, state_root: &Path) -> Option<PathBuf> {
    let binary = if cfg!(windows) {
        "gkos-agent.exe"
    } else {
        "gkos-agent"
    };
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(binary));
    }
    if let Ok(current_exe) = std::env::current_exe()
        && let Some(parent) = current_exe.parent()
    {
        candidates.push(parent.join(binary));
    }
    // Development-only placement; package assembly never writes credentials here.
    candidates.push(state_root.join("bin").join(binary));
    candidates.into_iter().find(|path| path.is_file())
}

fn spawn_locked(inner: &mut Inner, executable: &Path) -> Result<(), String> {
    let corpus = inner
        .corpus
        .as_ref()
        .ok_or_else(|| "corpus is unavailable".to_string())?;
    let state_root = inner
        .state_root
        .as_ref()
        .ok_or_else(|| "sidecar state root is unavailable".to_string())?;
    let status_file = state_root.join("desktop-agent.status.json");
    let log_path = state_root.join("desktop-agent.log");
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("cannot open sidecar log: {error}"))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("cannot duplicate sidecar log: {error}"))?;
    owner_only_file(&log_path).map_err(|error| format!("cannot protect sidecar log: {error}"))?;
    let mut command = Command::new(executable);
    command
        .arg("--notes")
        .arg(corpus)
        .arg("--status-file")
        .arg(status_file)
        .arg("--port")
        .arg(PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    inner.child = Some(
        command
            .spawn()
            .map_err(|error| format!("cannot start gkos-agent: {error}"))?,
    );
    Ok(())
}

fn terminate_child(inner: &mut Inner) {
    if let Some(mut child) = inner.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn owner_only_directory(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

fn owner_only_file(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

pub fn redacted_diagnostics(status: &SidecarStatus) -> RedactedDiagnostics {
    RedactedDiagnostics {
        schema_version: 1,
        shell_version: env!("CARGO_PKG_VERSION"),
        release_status: "internal-alpha",
        sidecar_available: status.available,
        sidecar_running: status.running,
        service_url: status.service_url,
        restart_count: status.restart_count,
        last_exit: status.last_exit,
        error_class: status.last_error.as_ref().map(|_| "sidecar-error"),
        redaction: "No credentials, note bodies, corpus paths, process arguments, or raw logs are included.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_sidecar_reports_offline_without_write_authority() {
        let supervisor = Supervisor::with_sidecar(None);
        let status = supervisor.status();
        assert!(!status.available);
        assert!(!status.running);
        assert!(supervisor.sidecar_version().is_none());
    }

    #[test]
    fn diagnostics_are_redacted_and_truthful() {
        let status = SidecarStatus {
            available: true,
            running: false,
            service_url: "http://127.0.0.1:4814",
            restart_count: MAX_RESTARTS,
            last_exit: Some(1),
            last_error: Some("secret token corpus C:/private".to_string()),
        };
        let encoded = serde_json::to_string(&redacted_diagnostics(&status)).unwrap();
        assert!(!encoded.contains("secret token"));
        assert!(!encoded.contains("C:/private"));
        assert!(encoded.contains("sidecar-error"));
        assert!(encoded.contains("internal-alpha"));
    }

    #[test]
    fn restart_policy_is_bounded() {
        assert_eq!(RESTART_BACKOFF_MS.len(), usize::from(MAX_RESTARTS));
        assert_eq!(RESTART_BACKOFF_MS, [250, 500, 1_000, 2_000, 4_000]);
    }

    #[test]
    fn shutdown_terminates_child_even_while_supervisor_is_cloned() {
        let supervisor = Supervisor::with_sidecar(None);
        let clone = supervisor.clone();
        #[cfg(windows)]
        let child = Command::new("cmd")
            .args(["/C", "ping 127.0.0.1 -n 30 >NUL"])
            .spawn()
            .unwrap();
        #[cfg(not(windows))]
        let child = Command::new("sh").args(["-c", "sleep 30"]).spawn().unwrap();
        let generation = {
            let mut inner = supervisor.inner.lock().unwrap();
            inner.child = Some(child);
            inner.desired_running = true;
            inner.generation
        };

        supervisor.shutdown();

        let inner = clone.inner.lock().unwrap();
        assert!(!inner.desired_running);
        assert!(inner.child.is_none());
        assert_ne!(inner.generation, generation);
    }
}
