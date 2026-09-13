mod sidecar;
mod sidecar_release;
mod viewer_credential;
#[cfg(windows)]
mod windows_state;

use serde::Serialize;
use sidecar::{SidecarStatus, Supervisor};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::{Manager, State};

const SERVICE_URL: &str = "http://127.0.0.1:4814";

struct DesktopState {
    supervisor: Supervisor,
    state_root: PathBuf,
    busy: Arc<AtomicBool>,
    credential_busy: Arc<AtomicBool>,
    dialog_busy: Arc<AtomicBool>,
}

struct SidecarAdmission(Arc<AtomicBool>);
impl SidecarAdmission {
    fn acquire(busy: &Arc<AtomicBool>) -> Result<Self, String> {
        busy.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "sidecar operation is busy".to_string())?;
        Ok(Self(Arc::clone(busy)))
    }
}
impl Drop for SidecarAdmission {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

async fn sidecar_operation<T: Send + 'static>(
    state: State<'_, DesktopState>,
    operation: impl FnOnce(Supervisor, PathBuf) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let supervisor = state.supervisor.clone();
    let root = state.state_root.clone();
    admitted_operation(&state.busy, move || operation(supervisor, root)).await
}

async fn admitted_operation<T: Send + 'static>(
    busy: &Arc<AtomicBool>,
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let admission = SidecarAdmission::acquire(busy)?;
    tauri::async_runtime::spawn_blocking(move || {
        // The physical worker owns admission even if the IPC caller goes away.
        let _admission = admission;
        operation()
    })
    .await
    .map_err(|_| "sidecar operation failed".to_string())?
}

impl Drop for DesktopState {
    fn drop(&mut self) {
        self.supervisor.shutdown();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    shell_version: &'static str,
    viewer_version: &'static str,
    service_url: &'static str,
    sidecar_available: bool,
    sidecar_version: Option<String>,
    release_status: &'static str,
}

#[tauri::command]
async fn choose_corpus(state: State<'_, DesktopState>) -> Result<Option<String>, String> {
    admitted_operation(&state.dialog_busy, || {
        Ok(rfd::FileDialog::new()
            .set_title("Choose a Kosmos knowledge folder")
            .pick_folder()
            .map(|path| path.to_string_lossy().into_owned()))
    })
    .await
}

#[tauri::command]
async fn start_sidecar(
    corpus: String,
    state: State<'_, DesktopState>,
) -> Result<SidecarStatus, String> {
    sidecar_operation(state, move |supervisor, root| {
        supervisor.start(canonical_corpus(&corpus)?, &root)
    })
    .await
}

#[tauri::command]
async fn stop_sidecar(state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    sidecar_operation(state, |supervisor, _| supervisor.stop()).await
}

#[tauri::command]
async fn reconnect_sidecar(state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    sidecar_operation(state, |supervisor, root| supervisor.reconnect(&root)).await
}

#[tauri::command]
async fn sidecar_status(state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    sidecar_operation(state, |supervisor, _| Ok(supervisor.status())).await
}

/// The credential crosses only Tauri's invoke IPC and is never included in a
/// URL, process argument, event payload, log, diagnostic, or persisted shell setting.
#[tauri::command]
async fn take_viewer_token(state: State<'_, DesktopState>) -> Result<String, String> {
    let root = state.state_root.clone();
    admitted_operation(&state.credential_busy, move || {
        let path = root.join("sidecar").join("desktop-agent.token");
        #[cfg(windows)]
        {
            crate::windows_state::read_credential(&path)
        }
        #[cfg(not(windows))]
        {
            let file =
                fs::File::open(path).map_err(|_| "viewer credential is not ready".to_string())?;
            crate::viewer_credential::read(file)
        }
    })
    .await
}

#[tauri::command]
async fn version_info(state: State<'_, DesktopState>) -> Result<VersionInfo, String> {
    sidecar_operation(state, |supervisor, _| {
        Ok(VersionInfo {
            shell_version: env!("CARGO_PKG_VERSION"),
            viewer_version: env!("CARGO_PKG_VERSION"),
            service_url: SERVICE_URL,
            sidecar_available: supervisor.sidecar_path().is_some(),
            sidecar_version: supervisor.sidecar_version(),
            release_status: "internal-alpha",
        })
    })
    .await
}

#[tauri::command]
async fn export_redacted_diagnostics(
    state: State<'_, DesktopState>,
) -> Result<Option<String>, String> {
    let supervisor = state.supervisor.clone();
    admitted_operation(&state.dialog_busy, move || {
        let Some(destination) = rfd::FileDialog::new()
            .set_title("Export redacted Kosmos diagnostics")
            .set_file_name("kosmos-oden-diagnostics.json")
            .add_filter("JSON", &["json"])
            .save_file()
        else {
            return Ok(None);
        };

        let report = sidecar::redacted_diagnostics(&supervisor.status());
        atomic_write_json(&destination, &report)?;
        Ok(Some(destination.to_string_lossy().into_owned()))
    })
    .await
}

fn canonical_corpus(value: &str) -> Result<PathBuf, String> {
    if value.contains('\0') || value.trim().is_empty() {
        return Err("a corpus directory is required".to_string());
    }
    let path = fs::canonicalize(value)
        .map_err(|_| "the selected corpus directory is unavailable".to_string())?;
    if !path.is_dir() {
        return Err("the selected corpus path is not a directory".to_string());
    }
    Ok(path)
}

fn atomic_write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    static NEXT_EXPORT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "diagnostic destination has no parent".to_string())?;
    // Create exclusively beside the destination: never truncate a pre-existing
    // temporary file, and never delete the original before replacement succeeds.
    for _ in 0..32 {
        let temporary = parent.join(format!(
            ".kosmos-export-{}-{}.tmp",
            std::process::id(),
            NEXT_EXPORT.fetch_add(1, Ordering::Relaxed)
        ));
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.to_string()),
        };
        let written = file.write_all(&bytes).and_then(|()| file.sync_all());
        drop(file);
        let result = written.and_then(|()| fs::rename(&temporary, path));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        return result.map_err(|error| error.to_string());
    }
    Err("diagnostic temporary file is unavailable".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state_root = app.path().app_data_dir()?;
            let supervisor = Supervisor::discover(app.handle(), &state_root);
            app.manage(DesktopState {
                supervisor,
                state_root,
                busy: Arc::new(AtomicBool::new(false)),
                credential_busy: Arc::new(AtomicBool::new(false)),
                dialog_busy: Arc::new(AtomicBool::new(false)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            choose_corpus,
            start_sidecar,
            stop_sidecar,
            reconnect_sidecar,
            sidecar_status,
            take_viewer_token,
            version_info,
            export_redacted_diagnostics
        ])
        .build(tauri::generate_context!())
        .expect("failed to build Kosmos-Oden desktop shell")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                app.state::<DesktopState>().supervisor.shutdown();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn diagnostic_publication_preserves_existing_files_on_failure() {
        let root = std::env::temp_dir().join(format!(
            "kosmos-export-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let destination = root.join("report.json");
        let unrelated = root.join("report.json.tmp");
        fs::write(&unrelated, b"unrelated file").unwrap();
        atomic_write_json(&destination, &serde_json::json!({"revision": 1})).unwrap();
        atomic_write_json(&destination, &serde_json::json!({"revision": 2})).unwrap();
        let original = fs::read(&destination).unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&original).unwrap()["revision"],
            2
        );
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            let guard = fs::OpenOptions::new()
                .read(true)
                .share_mode(1)
                .open(&destination)
                .unwrap();
            assert!(atomic_write_json(&destination, &serde_json::json!({"revision": 3})).is_err());
            assert_eq!(fs::read(&destination).unwrap(), original);
            drop(guard);
        }
        let directory = root.join("directory.json");
        fs::create_dir(&directory).unwrap();
        assert!(atomic_write_json(&directory, &serde_json::json!({"revision": 4})).is_err());
        assert!(directory.is_dir());
        assert_eq!(fs::read(&unrelated).unwrap(), b"unrelated file");
        assert_eq!(
            fs::read_dir(&root).unwrap().count(),
            3,
            "failed exports leave no temporary files"
        );
        fs::remove_file(destination).unwrap();
        fs::remove_file(unrelated).unwrap();
        fs::remove_dir(directory).unwrap();
        fs::remove_dir(root).unwrap();
    }

    #[test]
    fn sidecar_worker_retains_admission_until_exit_including_panic() {
        let busy = Arc::new(AtomicBool::new(false));
        let admission = SidecarAdmission::acquire(&busy).unwrap();
        let (release, wait) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let _admission = admission;
            wait.recv().unwrap();
            panic!("synthetic worker failure");
        });
        assert!(SidecarAdmission::acquire(&busy).is_err());
        release.send(()).unwrap();
        assert!(worker.join().is_err());
        assert!(SidecarAdmission::acquire(&busy).is_ok());
    }

    #[test]
    fn rejects_missing_corpus() {
        assert!(canonical_corpus("").is_err());
        assert!(canonical_corpus("definitely-not-a-real-kosmos-directory").is_err());
    }

    #[test]
    fn blocked_credential_worker_leaves_control_worker_available() {
        let credential_busy = Arc::new(AtomicBool::new(false));
        let control_busy = Arc::new(AtomicBool::new(false));
        let (entered, started) = std::sync::mpsc::channel();
        let (release, wait) = std::sync::mpsc::channel();
        let credentials = Arc::clone(&credential_busy);
        let worker = std::thread::spawn(move || {
            tauri::async_runtime::block_on(admitted_operation(&credentials, move || {
                entered.send(()).unwrap();
                wait.recv_timeout(std::time::Duration::from_secs(5))
                    .unwrap();
                Ok(())
            }))
        });
        started
            .recv_timeout(std::time::Duration::from_secs(5))
            .unwrap();
        let repeated =
            tauri::async_runtime::block_on(admitted_operation(&credential_busy, || Ok(())));
        let control = tauri::async_runtime::block_on(admitted_operation(&control_busy, || {
            Ok("control completed")
        }));
        release.send(()).unwrap();
        worker.join().unwrap().unwrap();
        assert!(repeated.is_err());
        assert_eq!(control.unwrap(), "control completed");
    }
}
