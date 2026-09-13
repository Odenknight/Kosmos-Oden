//! Private sidecar state. Existing ACLs are checked, never repaired implicitly.
use std::os::windows::{
    ffi::OsStrExt,
    fs::OpenOptionsExt,
    io::{AsRawHandle, FromRawHandle, OwnedHandle},
};
use std::{
    ffi::c_void,
    fs::{self, File, OpenOptions},
    io, mem,
    path::Path,
    ptr,
};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::{Authorization::*, *},
    Storage::FileSystem::*,
    System::Threading::*,
};

struct LocalMemory(*mut c_void);
impl Drop for LocalMemory {
    fn drop(&mut self) {
        unsafe {
            LocalFree(self.0);
        }
    }
}

fn refused() -> io::Error {
    io::Error::other("sidecar state identity or permissions require explicit repair")
}
fn wide(path: &Path) -> io::Result<Vec<u16>> {
    let mut value: Vec<_> = path.as_os_str().encode_wide().collect();
    if value.contains(&0) {
        return Err(refused());
    }
    value.push(0);
    Ok(value)
}

struct User {
    _token: OwnedHandle,
    buffer: Vec<usize>,
}
impl User {
    fn current() -> io::Result<Self> {
        unsafe {
            let mut token = ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err(io::Error::last_os_error());
            }
            let token = OwnedHandle::from_raw_handle(token);
            let mut bytes = 0;
            GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                ptr::null_mut(),
                0,
                &mut bytes,
            );
            if bytes == 0 || bytes > 65536 {
                return Err(refused());
            }
            let mut buffer = vec![0usize; (bytes as usize).div_ceil(mem::size_of::<usize>())];
            if GetTokenInformation(
                token.as_raw_handle(),
                TokenUser,
                buffer.as_mut_ptr().cast(),
                bytes,
                &mut bytes,
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(Self {
                _token: token,
                buffer,
            })
        }
    }
    fn sid(&self) -> PSID {
        unsafe { (*(self.buffer.as_ptr().cast::<TOKEN_USER>())).User.Sid }
    }
    fn sddl(&self) -> io::Result<String> {
        unsafe {
            let mut text = ptr::null_mut();
            if ConvertSidToStringSidW(self.sid(), &mut text) == 0 {
                return Err(io::Error::last_os_error());
            }
            let _memory = LocalMemory(text.cast());
            let mut length = 0;
            while length < 256 && *text.add(length) != 0 {
                length += 1;
            }
            if length == 256 {
                return Err(refused());
            }
            let sid = String::from_utf16(std::slice::from_raw_parts(text, length))
                .map_err(|_| refused())?;
            Ok(format!("O:{sid}D:P(A;OICI;FA;;;{sid})"))
        }
    }
}

fn open(path: &Path, directory: bool) -> io::Result<File> {
    let file = OpenOptions::new()
        .access_mode(READ_CONTROL | FILE_READ_ATTRIBUTES | FILE_READ_DATA)
        .share_mode(FILE_SHARE_READ)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS)
        .open(path)?;
    let mut info = unsafe { mem::zeroed::<BY_HANDLE_FILE_INFORMATION>() };
    unsafe {
        if GetFileInformationByHandle(file.as_raw_handle(), &mut info) == 0 {
            return Err(io::Error::last_os_error());
        }
    }
    if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY != 0) != directory
        || (!directory && info.nNumberOfLinks != 1)
    {
        return Err(refused());
    }
    // Canonicalize only for comparison with the opened handle, never for authorization.
    let expected = fs::canonicalize(path)?;
    let mut actual = vec![0u16; 32768];
    let count = unsafe {
        GetFinalPathNameByHandleW(
            file.as_raw_handle(),
            actual.as_mut_ptr(),
            actual.len() as u32,
            0,
        )
    } as usize;
    if count == 0
        || count >= actual.len()
        || actual[..count] != expected.as_os_str().encode_wide().collect::<Vec<_>>()
    {
        return Err(refused());
    }
    Ok(file)
}

fn private_acl(file: &File, user: &User, directory: bool) -> io::Result<()> {
    unsafe {
        let mut owner = ptr::null_mut();
        let mut acl = ptr::null_mut();
        let mut descriptor = ptr::null_mut();
        let error = GetSecurityInfo(
            file.as_raw_handle(),
            SE_FILE_OBJECT,
            OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
            &mut owner,
            ptr::null_mut(),
            &mut acl,
            ptr::null_mut(),
            &mut descriptor,
        );
        if error != 0 {
            return Err(io::Error::from_raw_os_error(error as i32));
        }
        let _memory = LocalMemory(descriptor);
        let mut control = 0;
        let mut revision = 0;
        if owner.is_null()
            || acl.is_null()
            || EqualSid(owner, user.sid()) == 0
            || (*acl).AceCount != 1
            || GetSecurityDescriptorControl(descriptor, &mut control, &mut revision) == 0
            || (directory && control & SE_DACL_PROTECTED == 0)
        {
            return Err(refused());
        }
        let mut ace = ptr::null_mut();
        if GetAce(acl, 0, &mut ace) == 0 {
            return Err(io::Error::last_os_error());
        }
        let ace = &*ace.cast::<ACCESS_ALLOWED_ACE>();
        let expected_flags = if directory {
            OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE
        } else {
            0
        };
        if ace.Header.AceType != 0
            || ace.Header.AceFlags & !INHERITED_ACE as u8 != expected_flags as u8
            || ace.Mask != FILE_ALL_ACCESS
            || EqualSid(ptr::addr_of!(ace.SidStart).cast_mut().cast(), user.sid()) == 0
        {
            return Err(refused());
        }
        Ok(())
    }
}

fn create(path: &Path, sddl: &str) -> io::Result<()> {
    let sddl: Vec<_> = sddl.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut descriptor = ptr::null_mut();
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        let _memory = LocalMemory(descriptor);
        let attributes = SECURITY_ATTRIBUTES {
            nLength: mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        if CreateDirectoryW(wide(path)?.as_ptr(), &attributes) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}

/// Retains parent and state directory handles through launch. The caller owns
/// the parent; arbitrary external directories are not supported as state roots.
pub fn ensure(path: &Path) -> io::Result<(File, File)> {
    let parent = path.parent().ok_or_else(refused)?;
    for ancestor in path.ancestors().skip(1) {
        if fs::symlink_metadata(ancestor)?.file_type().is_symlink() {
            return Err(refused());
        }
        let attributes = fs::symlink_metadata(ancestor)?;
        use std::os::windows::fs::MetadataExt;
        if attributes.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return Err(refused());
        }
    }
    let parent_handle = open(parent, true)?;
    let user = User::current()?;
    match fs::symlink_metadata(path) {
        Ok(_) => (),
        Err(error) if error.kind() == io::ErrorKind::NotFound => create(path, &user.sddl()?)?,
        Err(error) => return Err(error),
    }
    let directory = open(path, true)?;
    private_acl(&directory, &user, true)?;
    let mut leaves = Vec::new();
    for entry in fs::read_dir(path)? {
        if leaves.len() == 256 {
            return Err(refused());
        }
        let leaf = open(&entry?.path(), false)?;
        private_acl(&leaf, &user, false)?;
        leaves.push(leaf);
    }
    Ok((parent_handle, directory))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_creation_reuse_and_hardlink_refusal() {
        let root = std::env::temp_dir().join(format!(
            "kosmos-native-state-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        drop(ensure(&root).unwrap());
        fs::write(root.join("marker"), b"synthetic-only").unwrap();
        let guard = ensure(&root).unwrap();
        let moved = root.with_extension("moved");
        assert!(fs::rename(&root, &moved).is_err());
        drop(guard);
        fs::rename(&root, &moved).unwrap();
        fs::rename(&moved, &root).unwrap();
        assert_eq!(fs::read(root.join("marker")).unwrap(), b"synthetic-only");
        fs::hard_link(root.join("marker"), root.join("alias")).unwrap();
        assert!(ensure(&root).is_err());
        assert_eq!(fs::read(root.join("marker")).unwrap(), b"synthetic-only");
    }

    #[test]
    fn refuses_existing_broad_acl_without_repair() {
        let root = std::env::temp_dir().join(format!(
            "kosmos-native-unsafe-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let user = User::current().unwrap();
        let sddl = format!("{}(A;OICI;GR;;;WD)", user.sddl().unwrap());
        create(&root, &sddl).unwrap();
        fs::write(root.join("marker"), b"preserve-unsafe-fixture").unwrap();
        assert!(ensure(&root).is_err());
        // The unsafe grant remains detectable: refusal must not repair existing state.
        assert!(private_acl(&open(&root, true).unwrap(), &user, true).is_err());
        assert_eq!(
            fs::read(root.join("marker")).unwrap(),
            b"preserve-unsafe-fixture"
        );
    }
}
