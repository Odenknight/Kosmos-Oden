mod sidecar;

use serde::Serialize;
use sidecar::{SidecarStatus, Supervisor};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};

const SERVICE_URL: &str = "http://127.0.0.1:4814";

struct DesktopState {
    supervisor: Supervisor,
    state_root: PathBuf,
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
fn choose_corpus() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Choose a Kosmos knowledge folder")
        .pick_folder()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
fn start_sidecar(corpus: String, state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    let corpus = canonical_corpus(&corpus)?;
    state.supervisor.start(corpus, &state.state_root)
}

#[tauri::command]
fn stop_sidecar(state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    state.supervisor.stop()
}

#[tauri::command]
fn reconnect_sidecar(state: State<'_, DesktopState>) -> Result<SidecarStatus, String> {
    state.supervisor.reconnect(&state.state_root)
}

#[tauri::command]
fn sidecar_status(state: State<'_, DesktopState>) -> SidecarStatus {
    state.supervisor.status()
}

/// The credential crosses only Tauri's invoke IPC and is never included in a
/// URL, process argument, event payload, log, diagnostic, or persisted shell setting.
#[tauri::command]
fn take_viewer_token(state: State<'_, DesktopState>) -> Result<String, String> {
    let path = state.state_root.join("sidecar").join("desktop-agent.token");
    let token =
        fs::read_to_string(&path).map_err(|_| "viewer credential is not ready".to_string())?;
    let token = token.trim();
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("viewer credential has an invalid format".to_string());
    }
    Ok(token.to_string())
}

#[tauri::command]
fn version_info(state: State<'_, DesktopState>) -> VersionInfo {
    VersionInfo {
        shell_version: env!("CARGO_PKG_VERSION"),
        viewer_version: env!("CARGO_PKG_VERSION"),
        service_url: SERVICE_URL,
        sidecar_available: state.supervisor.sidecar_path().is_some(),
        sidecar_version: state.supervisor.sidecar_version(),
        release_status: "internal-alpha",
    }
}

#[tauri::command]
fn export_redacted_diagnostics(state: State<'_, DesktopState>) -> Result<Option<String>, String> {
    let Some(destination) = rfd::FileDialog::new()
        .set_title("Export redacted Kosmos diagnostics")
        .set_file_name("kosmos-oden-diagnostics.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(None);
    };

    let report = sidecar::redacted_diagnostics(&state.supervisor.status());
    atomic_write_json(&destination, &report)?;
    Ok(Some(destination.to_string_lossy().into_owned()))
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
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    let parent = path
        .parent()
        .ok_or_else(|| "diagnostic destination has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if path.exists() {
        fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|error| error.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state_root = app.path().app_data_dir()?;
            fs::create_dir_all(state_root.join("sidecar"))?;
            owner_only_directory(&state_root.join("sidecar"))?;
            let supervisor = Supervisor::discover(app.handle(), &state_root);
            app.manage(DesktopState {
                supervisor,
                state_root,
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

fn owner_only_directory(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    #[cfg(not(unix))]
    let _ = path;
    // Windows mode bits do not establish an ACL. The shell uses the per-user
    // app-data directory and makes no stronger Windows permissions claim.
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_corpus() {
        assert!(canonical_corpus("").is_err());
        assert!(canonical_corpus("definitely-not-a-real-kosmos-directory").is_err());
    }
}
