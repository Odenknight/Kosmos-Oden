use serde::Serialize;
use std::fs;
#[cfg(not(windows))]
use std::fs::OpenOptions;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const PORT: u16 = 4814;
const MAX_RESTARTS: u8 = 5;
const RESTART_BACKOFF_MS: [u64; 5] = [250, 500, 1_000, 2_000, 4_000];

#[derive(Clone)]
pub struct Supervisor {
    inner: Arc<Mutex<Inner>>,
    sidecar_path: Arc<OnceLock<PathBuf>>,
}

struct Inner {
    closed: bool,
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
        let candidates = sidecar_candidates(app, state_root);
        let supervisor = Self {
            inner: Arc::new(Mutex::new(Inner {
                closed: false,
                child: None,
                corpus: None,
                state_root: None,
                desired_running: false,
                generation: 0,
                restart_count: 0,
                last_exit: None,
                last_error: None,
            })),
            sidecar_path: Arc::new(OnceLock::new()),
        };
        if let Some(release) = crate::sidecar_release::Release::embedded() {
            let worker = supervisor.clone();
            thread::spawn(move || {
                if let Some(path) = candidates
                    .into_iter()
                    .find(|path| release.verify(path).is_some())
                {
                    worker.publish_discovery(path);
                }
            });
        }
        supervisor
    }

    fn publish_discovery(&self, path: PathBuf) {
        if let Ok(inner) = self.inner.lock() {
            if !inner.closed {
                let _ = self.sidecar_path.set(path);
            }
        }
    }

    #[cfg(test)]
    fn with_sidecar(sidecar_path: Option<PathBuf>) -> Self {
        let cell = OnceLock::new();
        if let Some(path) = sidecar_path {
            let _ = cell.set(path);
        }
        Self {
            inner: Arc::new(Mutex::new(Inner {
                closed: false,
                child: None,
                corpus: None,
                state_root: None,
                desired_running: false,
                generation: 0,
                restart_count: 0,
                last_exit: None,
                last_error: None,
            })),
            sidecar_path: Arc::new(cell),
        }
    }

    pub fn sidecar_path(&self) -> Option<&Path> {
        self.sidecar_path.get().map(PathBuf::as_path)
    }

    pub fn start(&self, corpus: PathBuf, app_state_root: &Path) -> Result<SidecarStatus, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "sidecar state lock failed".to_string())?;
        if inner.closed {
            return Err("sidecar supervisor is shut down".to_string());
        }
        let executable = self.sidecar_path.get().ok_or_else(|| {
            "Engine unavailable or still being verified; offline folder mode remains available"
                .to_string()
        })?;
        let sidecar_state = app_state_root.join("sidecar");

        terminate_child(&mut inner);
        inner.generation = inner.generation.wrapping_add(1);
        inner.corpus = Some(corpus);
        inner.state_root = Some(sidecar_state);
        inner.desired_running = true;
        inner.restart_count = 0;
        inner.last_exit = None;
        inner.last_error = None;
        if let Err(error) = spawn_locked(&mut inner, executable) {
            inner.desired_running = false;
            inner.last_error = Some(error.clone());
            return Err(error);
        }
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
            inner.closed = true;
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
            available: !inner.closed && self.sidecar_path.get().is_some(),
            running,
            service_url: "http://127.0.0.1:4814",
            restart_count: inner.restart_count,
            last_exit: inner.last_exit,
            last_error: inner.last_error.clone(),
        }
    }

    pub fn sidecar_version(&self) -> Option<String> {
        let executable = self.sidecar_path.get()?;
        let release = crate::sidecar_release::Release::embedded()?;
        let _verified = release.verify(executable)?;
        Some(release.version)
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
                let Some(executable) = supervisor.sidecar_path.get() else {
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

fn sidecar_candidates(app: &AppHandle, state_root: &Path) -> Vec<PathBuf> {
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
    candidates
}

fn spawn_locked(inner: &mut Inner, executable: &Path) -> Result<(), String> {
    let release = crate::sidecar_release::Release::embedded()
        .ok_or_else(|| "sidecar release identity is unavailable".to_string())?;
    let _verified = release
        .verify(executable)
        .ok_or_else(|| "sidecar release identity does not match".to_string())?;
    let corpus = inner
        .corpus
        .as_ref()
        .ok_or_else(|| "corpus is unavailable".to_string())?;
    let state_root = inner
        .state_root
        .as_ref()
        .ok_or_else(|| "sidecar state root is unavailable".to_string())?;
    #[cfg(windows)]
    let _state_guard = {
        fs::create_dir_all(
            state_root
                .parent()
                .ok_or("sidecar state parent is unavailable")?,
        )
        .map_err(|error| format!("cannot prepare sidecar parent: {error}"))?;
        crate::windows_state::ensure(state_root)
            .map_err(|error| format!("cannot protect sidecar state: {error}"))?
    };
    #[cfg(not(windows))]
    fs::create_dir_all(state_root)
        .map_err(|error| format!("cannot prepare sidecar state: {error}"))?;
    owner_only_directory(state_root)
        .map_err(|error| format!("cannot protect sidecar state: {error}"))?;
    let status_file = state_root.join("desktop-agent.status.json");
    let log_path = state_root.join("desktop-agent.log");
    #[cfg(windows)]
    let stdout = crate::windows_state::open_log(&log_path)
        .map_err(|error| format!("cannot open sidecar log: {error}"))?;
    #[cfg(not(windows))]
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
    fn discovery_publishes_once_and_never_after_shutdown() {
        let supervisor = Supervisor::with_sidecar(None);
        let worker = supervisor.clone();
        assert!(!supervisor.status().available);
        worker.publish_discovery(PathBuf::from("first"));
        worker.publish_discovery(PathBuf::from("second"));
        assert_eq!(supervisor.sidecar_path(), Some(Path::new("first")));
        let closed = Supervisor::with_sidecar(None);
        let late_worker = closed.clone();
        closed.shutdown();
        late_worker.publish_discovery(PathBuf::from("late"));
        assert!(closed.sidecar_path().is_none());
        assert!(!closed.status().available);
    }

    #[test]
    fn admitted_clone_cannot_start_after_shutdown_or_create_state() {
        let supervisor = Supervisor::with_sidecar(Some(PathBuf::from("unused-sidecar.exe")));
        let admitted = supervisor.clone();
        let root = std::env::temp_dir().join(format!(
            "kosmos-closed-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(!root.exists());
        let (resume, wait) = std::sync::mpsc::channel();
        let worker_root = root.clone();
        let worker = thread::spawn(move || {
            wait.recv().unwrap();
            admitted.start(PathBuf::from("unused-corpus"), &worker_root)
        });
        supervisor.shutdown();
        resume.send(()).unwrap();
        assert_eq!(
            worker.join().unwrap().unwrap_err(),
            "sidecar supervisor is shut down"
        );
        assert!(!root.exists());
        assert!(!supervisor.status().available);
        assert!(!supervisor.status().running);
    }

    #[test]
    fn missing_sidecar_reports_offline_without_write_authority() {
        let supervisor = Supervisor::with_sidecar(None);
        let status = supervisor.status();
        assert!(!status.available);
        assert!(!status.running);
        assert!(supervisor.sidecar_version().is_none());
    }

    #[test]
    fn disabled_release_cannot_create_state_even_after_discovery() {
        assert!(
            crate::sidecar_release::Release::embedded().is_none(),
            "run this source-tree test with the default null release manifest"
        );
        let root = std::env::temp_dir().join(format!(
            "kosmos-disabled-release-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let supervisor = Supervisor::with_sidecar(Some(PathBuf::from("unverified.exe")));
        assert_eq!(
            supervisor
                .start(PathBuf::from("unused-corpus"), &root)
                .unwrap_err(),
            "sidecar release identity is unavailable"
        );
        assert!(!root.exists());
        assert!(!supervisor.status().running);
        assert!(!supervisor.inner.lock().unwrap().desired_running);
        assert_eq!(
            supervisor.status().last_error.as_deref(),
            Some("sidecar release identity is unavailable")
        );
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
        let child = {
            use std::os::windows::process::CommandExt;
            Command::new("cmd")
                .args(["/C", "ping 127.0.0.1 -n 30 >NUL"])
                .creation_flags(0x0800_0000)
                .spawn()
                .unwrap()
        };
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
