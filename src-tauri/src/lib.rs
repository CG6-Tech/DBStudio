use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlparser::{dialect::MySqlDialect, parser::Parser};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

const EXAMPLE_SQL: &str = include_str!("../assets/two-table-example.sql");

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum SqlDialect {
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

fn validate_mysql(source: &str) -> Result<(), String> {
    Parser::parse_sql(&MySqlDialect {}, source)
        .map(|_| ())
        .map_err(|error| format!("MySQL parser rejected the SQL: {error}"))
}

fn validate_dialect(source: &str, dialect: SqlDialect) -> Result<(), String> {
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

fn metadata_path(path: &Path) -> Result<PathBuf, String> {
    let parent = path.parent().ok_or_else(|| "The SQL file has no parent folder.".to_string())?;
    Ok(parent.join("workspace.sql-erd.json"))
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
    let metadata = metadata_path(Path::new(&path))?;
    if !metadata.exists() {
        return Ok(None);
    }
    fs::read_to_string(&metadata)
        .map(Some)
        .map_err(|error| format!("Could not read {}: {error}", metadata.display()))
}

#[tauri::command]
fn save_workspace_metadata(path: String, json: String) -> Result<(), String> {
    let metadata = metadata_path(Path::new(&path))?;
    let temp = metadata.with_extension("json.tmp");
    fs::write(&temp, json).map_err(|error| format!("Could not write diagram metadata: {error}"))?;
    fs::rename(&temp, &metadata).map_err(|error| format!("Could not replace diagram metadata: {error}"))
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
        assert!(error.contains("changed outside ViewDB"));
    }

    #[test]
    fn metadata_uses_workspace_sidecar() {
        let directory = tempfile::tempdir().expect("temp directory");
        let sql = directory.path().join("schema.sql");
        assert_eq!(metadata_path(&sql).unwrap(), directory.path().join("workspace.sql-erd.json"));
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
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_example, open_document, save_document, load_workspace_metadata, save_workspace_metadata])
        .run(tauri::generate_context!())
        .expect("error while running ViewDB");
}
