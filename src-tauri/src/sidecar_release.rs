use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::Read;
use std::path::Path;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Release {
    schema: u8,
    pub version: String,
    commit: String,
    os: String,
    arch: String,
    bytes: u64,
    sha256: String,
}

impl Release {
    fn parse(json: &str) -> Option<Self> {
        let release: Self = serde_json::from_str(json).ok()?;
        let hex = |value: &str, size| {
            value.len() == size
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        (release.schema == 1
            && !release.version.is_empty()
            && release.version.len() <= 64
            && release
                .version
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b".-+".contains(&b))
            && hex(&release.commit, 40)
            && hex(&release.sha256, 64)
            && release.os == std::env::consts::OS
            && release.arch == std::env::consts::ARCH
            && release.bytes > 0
            && release.bytes <= 1_073_741_824)
            .then_some(release)
    }

    pub fn embedded() -> Option<Self> {
        Self::parse(include_str!("../sidecar-release.json"))
    }

    /// Retain this handle through spawn. Windows denies concurrent write/delete
    /// opens while allowing the executable loader to read the verified file.
    pub fn verify(&self, path: &Path) -> Option<File> {
        let metadata = fs::symlink_metadata(path).ok()?;
        if !metadata.is_file() || metadata.len() != self.bytes {
            return None;
        }
        let mut options = OpenOptions::new();
        options.read(true);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(1);
        }
        let mut file = options.open(path).ok()?;
        if file.metadata().ok()?.len() != self.bytes {
            return None;
        }
        let mut digest = Sha256::new();
        let mut buffer = [0u8; 65536];
        let mut total = 0u64;
        loop {
            let count = file.read(&mut buffer).ok()?;
            if count == 0 {
                break;
            }
            total += count as u64;
            if total > self.bytes {
                return None;
            }
            digest.update(&buffer[..count]);
        }
        (total == self.bytes && format!("{:x}", digest.finalize()) == self.sha256).then_some(file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_target_and_exact_binary_without_executing_it() {
        let bytes = b"synthetic non-executable sidecar";
        let mut value = serde_json::json!({"schema":1,"version":"2.2.0","commit":"a".repeat(40),
            "os":std::env::consts::OS,"arch":std::env::consts::ARCH,"bytes":bytes.len(),
            "sha256":format!("{:x}",Sha256::digest(bytes))});
        let release = Release::parse(&value.to_string()).unwrap();
        let path = std::env::temp_dir().join(format!(
            "kosmos-sidecar-{}-{}.fixture",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .unwrap();
        std::io::Write::write_all(&mut file, bytes).unwrap();
        drop(file);
        let verified = release.verify(&path).unwrap();
        #[cfg(windows)]
        assert!(OpenOptions::new().write(true).open(&path).is_err());
        drop(verified);
        fs::write(&path, vec![b'x'; bytes.len()]).unwrap();
        assert!(release.verify(&path).is_none());
        fs::remove_file(&path).unwrap();
        value["arch"] = "wrong-target".into();
        assert!(Release::parse(&value.to_string()).is_none());
        assert!(Release::parse("null").is_none());
    }
}
