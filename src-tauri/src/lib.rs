use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlparser::{dialect::MySqlDialect, parser::Parser};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    io::{Read, BufRead, BufReader},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
    thread,
    time::Duration,
    time::UNIX_EPOCH,
};

mod workspace;
mod migration;
mod ai;

const EXAMPLE_SQL: &str = include_str!("../assets/two-table-example.sql");

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SqlDialect {
    Postgresql,
    Mysql,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedDocument {
    dialect: SqlDialect,
    path: Option<String>,
    source: String,
    hash: String,
    modified_ms: Option<u64>,
    is_example: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    path: String,
    hash: String,
    modified_ms: Option<u64>,
    backup_path: Option<String>,
}

#[derive(Clone, Debug, Default)]
struct DesktopAuthBridge {
    result: Arc<Mutex<Option<DesktopAuthPayload>>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAuthPayload {
    state: String,
    id_token: Option<String>,
    access_token: Option<String>,
}

pub(crate) fn hash_source(source: &str) -> String {
    hex::encode(Sha256::digest(source.as_bytes()))
}

pub(crate) fn modified_ms(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()?
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn validate_postgres(source: &str) -> Result<(), String> {
    pg_query::parse(source)
        .map(|_| ())
        .map_err(|error| format!("PostgreSQL parser rejected the SQL: {error}"))
}

fn validate_mysql(source: &str) -> Result<(), String> {
    Parser::parse_sql(&MySqlDialect {}, source)
        .map(|_| ())
        .map_err(|error| format!("MySQL parser rejected the SQL: {error}"))
}

pub(crate) fn validate_dialect(source: &str, dialect: SqlDialect) -> Result<(), String> {
    match dialect {
        SqlDialect::Postgresql => validate_postgres(source),
        SqlDialect::Mysql => validate_mysql(source),
    }
}

fn has_strong_mysql_markers(source: &str) -> bool {
    let upper = source.to_uppercase();
    source.contains('`')
        || upper.contains("AUTO_INCREMENT")
        || upper.contains(" UNSIGNED")
        || upper.contains("ENGINE=")
        || upper.contains("ENGINE =")
}

fn detect_dialect(source: &str) -> Result<SqlDialect, String> {
    let postgres = validate_postgres(source);
    let mysql = validate_mysql(source);
    if has_strong_mysql_markers(source) && mysql.is_ok() {
        return Ok(SqlDialect::Mysql);
    }
    if postgres.is_ok() {
        return Ok(SqlDialect::Postgresql);
    }
    if mysql.is_ok() {
        return Ok(SqlDialect::Mysql);
    }
    Err(format!(
        "The SQL is not valid PostgreSQL or MySQL.\n{}\n{}",
        postgres.unwrap_err(),
        mysql.unwrap_err()
    ))
}

fn read_document(path: &Path) -> Result<OpenedDocument, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    let dialect = detect_dialect(&source)?;
    Ok(OpenedDocument {
        dialect,
        path: Some(path.to_string_lossy().into_owned()),
        hash: hash_source(&source),
        modified_ms: modified_ms(path),
        source,
        is_example: false,
    })
}

pub(crate) fn backup_path(path: &Path) -> Result<PathBuf, String> {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The destination does not have a valid filename.".to_string())?;
    Ok(path.with_file_name(format!(
        "{filename}.bak-{}",
        Utc::now().format("%Y%m%d-%H%M%S")
    )))
}

pub(crate) fn metadata_paths(path: &Path) -> Result<(PathBuf, Option<PathBuf>), String> {
    if path.is_dir() {
        let dbstudio = path.join(".dbstudio");
        if dbstudio.exists() {
            let metadata = fs::symlink_metadata(&dbstudio)
                .map_err(|error| format!("Could not inspect {}: {error}", dbstudio.display()))?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(format!("Refusing to use unsafe workspace data path: {}", dbstudio.display()));
            }
        }
        let legacy_viewdb = path.join(".viewdb").join("sql-erd.json");
        let legacy_root = path.join("workspace.sql-erd.json");
        let legacy = if legacy_viewdb.exists() { Some(legacy_viewdb) } else { Some(legacy_root) };
        return Ok((
            dbstudio.join("workspace.json"),
            legacy,
        ));
    }
    let parent = path.parent().ok_or_else(|| "The SQL file has no parent folder.".to_string())?;
    let filename = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| "The SQL file has no valid filename.".to_string())?;
    Ok((parent.join(".dbstudio").join(format!("{filename}.workspace.json")), Some(parent.join("workspace.sql-erd.json"))))
}

fn safe_save(
    path: &Path,
    source: &str,
    original_hash: Option<&str>,
    dialect: SqlDialect,
) -> Result<SaveResult, String> {
    validate_dialect(source, dialect)?;
    let parent = path
        .parent()
        .ok_or_else(|| "The destination has no parent folder.".to_string())?;
    if !parent.exists() {
        return Err(format!("The destination folder does not exist: {}", parent.display()));
    }

    let mut backup = None;
    if path.exists() {
        let current = fs::read_to_string(path)
            .map_err(|error| format!("Could not check the current file: {error}"))?;
        if let Some(expected) = original_hash {
            if hash_source(&current) != expected {
                return Err("The SQL file changed outside DBStudio. Reopen it before saving so those changes are not overwritten.".to_string());
            }
        }
        let destination = backup_path(path)?;
        fs::copy(path, &destination)
            .map_err(|error| format!("Could not create backup {}: {error}", destination.display()))?;
        backup = Some(destination);
    }

    let temp_path = parent.join(format!(".dbstudio-{}.tmp", uuid::Uuid::new_v4()));
    let write_result = (|| -> Result<(), String> {
        let mut temp = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(|error| format!("Could not create a temporary save file: {error}"))?;
        temp.write_all(source.as_bytes())
            .map_err(|error| format!("Could not write the temporary save file: {error}"))?;
        temp.sync_all()
            .map_err(|error| format!("Could not flush the temporary save file: {error}"))?;
        fs::rename(&temp_path, path)
            .map_err(|error| format!("Could not atomically replace {}: {error}", path.display()))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result?;

    Ok(SaveResult {
        path: path.to_string_lossy().into_owned(),
        hash: hash_source(source),
        modified_ms: modified_ms(path),
        backup_path: backup.map(|item| item.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
fn load_example() -> Result<OpenedDocument, String> {
    validate_postgres(EXAMPLE_SQL)?;
    Ok(OpenedDocument {
        dialect: SqlDialect::Postgresql,
        path: None,
        source: EXAMPLE_SQL.to_string(),
        hash: hash_source(EXAMPLE_SQL),
        modified_ms: None,
        is_example: true,
    })
}

#[tauri::command]
fn open_document(path: String) -> Result<OpenedDocument, String> {
    read_document(Path::new(&path))
}

#[tauri::command]
fn load_workspace_metadata(path: String) -> Result<Option<String>, String> {
    let (metadata, legacy) = metadata_paths(Path::new(&path))?;
    let source = if metadata.exists() {
        metadata
    } else if let Some(legacy) = legacy.filter(|candidate| candidate.exists()) {
        legacy
    } else {
        return Ok(None);
    };
    fs::read_to_string(&source)
        .map(Some)
        .map_err(|error| format!("Could not read {}: {error}", source.display()))
}

fn write_synced(path: &Path, source: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    file.write_all(source)
        .map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    file.sync_all()
        .map_err(|error| format!("Could not flush {}: {error}", path.display()))
}

fn save_metadata(path: &Path, json: &str) -> Result<(), String> {
    let (metadata, legacy) = metadata_paths(path)?;
    let parent = metadata.parent().ok_or_else(|| "The metadata file has no parent folder.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    let temp = parent.join(format!(".dbstudio-{}.tmp", uuid::Uuid::new_v4()));
    if let Err(error) = write_synced(&temp, json.as_bytes()) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temp, &metadata) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not replace diagram metadata: {error}"));
    }
    if let Some(legacy) = legacy.filter(|candidate| candidate.exists()) {
        fs::remove_file(&legacy).map_err(|error| format!("Could not remove legacy metadata {}: {error}", legacy.display()))?;
    }
    Ok(())
}

#[tauri::command]
fn save_workspace_metadata(path: String, json: String) -> Result<(), String> {
    save_metadata(Path::new(&path), &json)
}

#[tauri::command]
fn read_workspace_data(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    let metadata = fs::symlink_metadata(path).map_err(|error| format!("Could not inspect {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("Refusing to import an unsafe workspace data path: {}", path.display()));
    }
    if metadata.len() > 50 * 1024 * 1024 {
        return Err("Workspace data is larger than the 50 MB import limit.".to_string());
    }
    fs::read_to_string(path).map_err(|error| format!("Could not read {}: {error}", path.display()))
}

#[tauri::command]
fn write_workspace_data(path: String, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|error| format!("Workspace data is not valid JSON: {error}"))?;
    write_export_file(path, json)
}

#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    let path = Path::new(&path);
    let parent = path.parent().ok_or_else(|| "The workspace data destination has no parent folder.".to_string())?;
    if !parent.is_dir() {
        return Err(format!("The workspace data destination does not exist: {}", parent.display()));
    }
    if path.exists() {
        let metadata = fs::symlink_metadata(path).map_err(|error| format!("Could not inspect {}: {error}", path.display()))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!("Refusing to replace an unsafe workspace data path: {}", path.display()));
        }
    }
    let temp = parent.join(format!(".dbstudio-export-{}.tmp", uuid::Uuid::new_v4()));
    if let Err(error) = write_synced(&temp, contents.as_bytes()) {
        let _ = fs::remove_file(&temp);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not replace {}: {error}", path.display()));
    }
    Ok(())
}

fn validate_external_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed != url || trimmed.is_empty() || trimmed.chars().any(char::is_control) {
        return Err("The external sign-in URL is invalid.".to_string());
    }
    if trimmed.starts_with("https://") || trimmed.starts_with("dbstudio://auth/callback") {
        return Ok(());
    }
    Err("DBStudio can only open HTTPS sign-in URLs.".to_string())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&url);
        command
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", &url]);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&url);
        command
    };
    command.spawn().map_err(|error| format!("Could not open the browser sign-in page: {error}"))?;
    Ok(())
}

fn valid_auth_state(state: &str) -> bool {
    !state.is_empty() && state.len() <= 128 && state.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn decode_form_component(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        match bytes[index] {
            b'+' => {
                decoded.push(b' ');
                index += 1;
            }
            b'%' if index + 2 < bytes.len() => {
                let high = hex_value(bytes[index + 1])?;
                let low = hex_value(bytes[index + 2])?;
                decoded.push((high << 4) | low);
                index += 3;
            }
            b'%' => return None,
            byte => {
                decoded.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(decoded).ok()
}

fn form_auth_payload(body: &[u8]) -> Option<DesktopAuthPayload> {
    let source = std::str::from_utf8(body).ok()?;
    let mut state = None;
    let mut id_token = None;
    let mut access_token = None;

    for item in source.split('&') {
        let (raw_key, raw_value) = item.split_once('=').unwrap_or((item, ""));
        let key = decode_form_component(raw_key)?;
        let value = decode_form_component(raw_value)?;
        let value = if value.is_empty() { None } else { Some(value) };
        match key.as_str() {
            "state" => state = value,
            "idToken" => id_token = value,
            "accessToken" => access_token = value,
            _ => {}
        }
    }

    Some(DesktopAuthPayload {
        state: state?,
        id_token,
        access_token,
    })
}

fn parse_auth_payload(body: &[u8], content_type: &str) -> Option<DesktopAuthPayload> {
    if content_type
        .split(';')
        .next()
        .map(|value| value.trim().eq_ignore_ascii_case("application/x-www-form-urlencoded"))
        .unwrap_or(false)
    {
        return form_auth_payload(body);
    }
    serde_json::from_slice::<DesktopAuthPayload>(body).ok()
}

fn respond(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) {
    let response = format!(
        "HTTP/1.1 {status}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Private-Network: true\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    );
    let _ = stream.write_all(response.as_bytes());
}

fn handle_auth_callback(mut stream: TcpStream, expected_state: &str, result: &Arc<Mutex<Option<DesktopAuthPayload>>>) {
    let reader_stream = match stream.try_clone() {
        Ok(value) => value,
        Err(_) => return,
    };
    let mut reader = BufReader::new(reader_stream);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line).is_err() {
        return;
    }
    if request_line.starts_with("OPTIONS ") {
        respond(&mut stream, "204 No Content", "text/plain", "");
        return;
    }
    if !request_line.starts_with("POST /auth/callback ") {
        respond(&mut stream, "404 Not Found", "text/plain", "Not found");
        return;
    }
    let mut content_length = 0usize;
    let mut content_type = String::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line == "\r\n" || line == "\n" {
            break;
        }
        let lower = line.to_ascii_lowercase();
        if let Some(raw) = lower.strip_prefix("content-length:") {
            content_length = raw.trim().parse::<usize>().unwrap_or(0);
        }
        if let Some((_, raw)) = line.split_once(':') {
            if line[..line.find(':').unwrap_or(0)].eq_ignore_ascii_case("content-type") {
                content_type = raw.trim().to_string();
            }
        }
    }
    if content_length == 0 || content_length > 16 * 1024 {
        respond(&mut stream, "400 Bad Request", "text/plain", "Invalid callback");
        return;
    }
    let mut body = vec![0u8; content_length];
    if reader.read_exact(&mut body).is_err() {
        respond(&mut stream, "400 Bad Request", "text/plain", "Invalid callback");
        return;
    }
    let payload = match parse_auth_payload(&body, &content_type) {
        Some(value) => value,
        None => {
            respond(&mut stream, "400 Bad Request", "text/plain", "Invalid callback");
            return;
        }
    };
    if payload.state != expected_state || (payload.id_token.is_none() && payload.access_token.is_none()) {
        respond(&mut stream, "403 Forbidden", "text/plain", "Invalid callback state");
        return;
    }
    if let Ok(mut slot) = result.lock() {
        *slot = Some(payload);
    }
    respond(&mut stream, "200 OK", "text/html; charset=utf-8", "<!doctype html><title>DBStudio</title><body style=\"font:16px system-ui;background:#101619;color:#e9f1ed;padding:32px\">Sign-in complete. You can return to DBStudio.</body>");
}

#[tauri::command]
fn begin_desktop_auth(state: String, bridge: tauri::State<DesktopAuthBridge>) -> Result<String, String> {
    if !valid_auth_state(&state) {
        return Err("The desktop sign-in state is invalid.".to_string());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| format!("Could not start desktop sign-in callback: {error}"))?;
    listener.set_nonblocking(true).map_err(|error| format!("Could not prepare desktop sign-in callback: {error}"))?;
    let port = listener.local_addr().map_err(|error| format!("Could not read desktop sign-in callback: {error}"))?.port();
    if let Ok(mut slot) = bridge.result.lock() {
        *slot = None;
    }
    let result = bridge.result.clone();
    thread::spawn(move || {
        for _ in 0..600 {
            match listener.accept() {
                Ok((stream, _)) => handle_auth_callback(stream, &state, &result),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(500)),
                Err(_) => break,
            }
            if result.lock().ok().and_then(|slot| slot.clone()).is_some() {
                break;
            }
        }
    });
    Ok(format!("http://127.0.0.1:{port}/auth/callback"))
}

#[tauri::command]
fn poll_desktop_auth_result(bridge: tauri::State<DesktopAuthBridge>) -> Result<Option<DesktopAuthPayload>, String> {
    let mut slot = bridge.result.lock().map_err(|_| "Desktop sign-in state is unavailable.".to_string())?;
    Ok(slot.take())
}

#[tauri::command(rename_all = "camelCase")]
fn save_document(
    path: String,
    source: String,
    original_hash: Option<String>,
    dialect: SqlDialect,
) -> Result<SaveResult, String> {
    safe_save(Path::new(&path), &source, original_hash.as_deref(), dialect)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn example_is_valid_postgres() {
        validate_postgres(EXAMPLE_SQL).expect("example should parse");
    }

    #[test]
    fn save_detects_external_change_and_creates_backup() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("schema.sql");
        fs::write(&path, "CREATE TABLE a (id int);").expect("seed file");
        let original_hash = hash_source("CREATE TABLE a (id int);");
        let result = safe_save(
            &path,
            "CREATE TABLE a (id bigint);",
            Some(&original_hash),
            SqlDialect::Postgresql,
        )
        .expect("safe save");
        assert!(result.backup_path.is_some());
        assert_eq!(fs::read_to_string(&path).unwrap(), "CREATE TABLE a (id bigint);");

        fs::write(&path, "CREATE TABLE a (id text);").expect("external write");
        let error = safe_save(
            &path,
            "CREATE TABLE a (id uuid);",
            Some(&result.hash),
            SqlDialect::Postgresql,
        )
        .unwrap_err();
        assert!(error.contains("changed outside DBStudio"));
    }

    #[test]
    fn metadata_uses_workspace_sidecar() {
        let directory = tempfile::tempdir().expect("temp directory");
        let sql = directory.path().join("schema.sql");
        assert_eq!(metadata_paths(&sql).unwrap().0, directory.path().join(".dbstudio/schema.sql.workspace.json"));
        assert_eq!(metadata_paths(directory.path()).unwrap().0, directory.path().join(".dbstudio/workspace.json"));
    }

    #[test]
    fn validates_and_detects_mysql_schema() {
        let source = "CREATE TABLE `users` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`)) ENGINE=InnoDB;\n\
CREATE TABLE `orders` (`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, `user_id` BIGINT UNSIGNED NOT NULL, PRIMARY KEY (`id`), KEY `idx_user_id` (`user_id`), CONSTRAINT `fk_orders_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)) ENGINE=InnoDB;";
        validate_mysql(source).expect("mysql schema should parse");
        assert_eq!(detect_dialect(source).unwrap(), SqlDialect::Mysql);
    }

    #[test]
    fn save_uses_the_selected_dialect() {
        let directory = tempfile::tempdir().expect("temp directory");
        let path = directory.path().join("schema.sql");
        let mysql = "CREATE TABLE `users` (`id` INT AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;";
        safe_save(&path, mysql, None, SqlDialect::Mysql).expect("mysql save should validate");
        assert!(safe_save(&path, mysql, None, SqlDialect::Postgresql).is_err());
    }

    #[test]
    fn portable_schema_defaults_to_postgresql() {
        assert_eq!(
            detect_dialect("CREATE TABLE users (id INT PRIMARY KEY);").unwrap(),
            SqlDialect::Postgresql
        );
    }

    #[test]
    fn external_url_validation_allows_only_auth_urls() {
        assert!(validate_external_url("https://mydb-studio.web.app/desktop-auth").is_ok());
        assert!(validate_external_url("dbstudio://auth/callback?code=abc&state=xyz").is_ok());
        assert!(validate_external_url("http://mydb-studio.web.app/desktop-auth").is_err());
        assert!(validate_external_url("file:///Applications/DBStudio.app").is_err());
    }

    #[test]
    fn desktop_auth_state_allows_uuid_style_values() {
        assert!(valid_auth_state("8df45501-e6e4-4122-8474-1f938a75bce8"));
        assert!(!valid_auth_state(""));
        assert!(!valid_auth_state("bad/state"));
    }

    #[test]
    fn parses_form_auth_callback_payload() {
        let payload = parse_auth_payload(
            b"state=8df45501-e6e4-4122-8474-1f938a75bce8&idToken=id%2Etoken&accessToken=access%2Btoken",
            "application/x-www-form-urlencoded; charset=UTF-8",
        )
        .expect("form payload should parse");

        assert_eq!(payload.state, "8df45501-e6e4-4122-8474-1f938a75bce8");
        assert_eq!(payload.id_token.as_deref(), Some("id.token"));
        assert_eq!(payload.access_token.as_deref(), Some("access+token"));
    }

    #[test]
    fn parses_json_auth_callback_payload() {
        let payload = parse_auth_payload(
            br#"{"state":"8df45501-e6e4-4122-8474-1f938a75bce8","idToken":"id.token","accessToken":null}"#,
            "application/json",
        )
        .expect("json payload should parse");

        assert_eq!(payload.state, "8df45501-e6e4-4122-8474-1f938a75bce8");
        assert_eq!(payload.id_token.as_deref(), Some("id.token"));
        assert_eq!(payload.access_token, None);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopAuthBridge::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_example,
            open_document,
            save_document,
            load_workspace_metadata,
            save_workspace_metadata,
            read_workspace_data,
            write_workspace_data,
            write_export_file,
            open_external_url,
            begin_desktop_auth,
            poll_desktop_auth_result,
            workspace::open_workspace,
            workspace::save_workspace_files,
            migration::save_connection_secret,
            migration::delete_connection_secret,
            migration::introspect_database,
            ai::run_agent_cli,
            ai::agent_cli_available,
        ])
        .run(tauri::generate_context!())
        .expect("error while running DBStudio");
}
