use chrono::Utc;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const EXAMPLE_SQL: &str = include_str!("../assets/two-table-example.sql");

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedDocument {
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

fn hash_source(source: &str) -> String {
    hex::encode(Sha256::digest(source.as_bytes()))
}

fn modified_ms(path: &Path) -> Option<u64> {
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

fn read_document(path: &Path) -> Result<OpenedDocument, String> {
    let source = fs::read_to_string(path)
        .map_err(|error| format!("Could not read {}: {error}", path.display()))?;
    validate_postgres(&source)?;
    Ok(OpenedDocument {
        path: Some(path.to_string_lossy().into_owned()),
        hash: hash_source(&source),
        modified_ms: modified_ms(path),
        source,
        is_example: false,
    })
}

fn backup_path(path: &Path) -> Result<PathBuf, String> {
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The destination does not have a valid filename.".to_string())?;
    Ok(path.with_file_name(format!(
        "{filename}.bak-{}",
        Utc::now().format("%Y%m%d-%H%M%S")
    )))
}

fn safe_save(path: &Path, source: &str, original_hash: Option<&str>) -> Result<SaveResult, String> {
    validate_postgres(source)?;
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
                return Err("The SQL file changed outside ViewDB. Reopen it before saving so those changes are not overwritten.".to_string());
            }
        }
        let destination = backup_path(path)?;
        fs::copy(path, &destination)
            .map_err(|error| format!("Could not create backup {}: {error}", destination.display()))?;
        backup = Some(destination);
    }

    let temp_path = parent.join(format!(".viewdb-{}.tmp", uuid::Uuid::new_v4()));
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

#[tauri::command(rename_all = "camelCase")]
fn save_document(path: String, source: String, original_hash: Option<String>) -> Result<SaveResult, String> {
    safe_save(Path::new(&path), &source, original_hash.as_deref())
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
        )
        .expect("safe save");
        assert!(result.backup_path.is_some());
        assert_eq!(fs::read_to_string(&path).unwrap(), "CREATE TABLE a (id bigint);");

        fs::write(&path, "CREATE TABLE a (id text);").expect("external write");
        let error = safe_save(&path, "CREATE TABLE a (id uuid);", Some(&result.hash)).unwrap_err();
        assert!(error.contains("changed outside ViewDB"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_example, open_document, save_document])
        .run(tauri::generate_context!())
        .expect("error while running ViewDB");
}
