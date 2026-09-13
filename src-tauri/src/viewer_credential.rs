use std::io::Read;

/// Reads one fixed-size token, with an optional LF or CRLF terminator.
/// The extra byte detects oversized input without reading an unbounded file.
pub fn read(reader: impl Read) -> Result<String, String> {
    let mut bytes = Vec::with_capacity(67);
    reader
        .take(67)
        .read_to_end(&mut bytes)
        .map_err(|_| "viewer credential is not ready".to_string())?;
    let token = bytes
        .strip_suffix(b"\r\n")
        .or_else(|| bytes.strip_suffix(b"\n"))
        .unwrap_or(&bytes);
    if token.len() != 64 || !token.iter().all(u8::is_ascii_hexdigit) {
        return Err("viewer credential has an invalid format".to_string());
    }
    String::from_utf8(token.to_vec())
        .map_err(|_| "viewer credential has an invalid format".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_exact_tokens_and_bounds_oversized_reads() {
        let token = "a".repeat(64);
        for suffix in ["", "\n", "\r\n"] {
            assert!(read(format!("{token}{suffix}").as_bytes()).is_ok());
        }
        for invalid in [
            "a".repeat(63),
            "a".repeat(65),
            "z".repeat(64),
            format!(" {token}"),
            format!("{token}\n\n"),
        ] {
            assert!(read(invalid.as_bytes()).is_err());
        }
        let mut infinite = std::io::repeat(b'a');
        assert!(read(&mut infinite).is_err());
    }
}
