use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use crate::{hash_source, metadata_paths, modified_ms, validate_dialect, SqlDialect};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFile {
    path: String,
    relative_path: String,
    source: Option<String>,
    hash: Option<String>,
    modified_ms: Option<u64>,
    error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkspace {
    root_path: String,
    root_name: String,
    files: Vec<WorkspaceFile>,
}

fn is_sql_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("sql"))
}

fn ignored_file(path: &Path) -> bool {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default();
    name == "workspace.sql-erd.json"
        || name.starts_with(".viewdb-")
        || name.starts_with(".dbstudio-")
        || name.contains(".bak-")
        || name.ends_with(".tmp")
}

fn slash_path(path: &Path) -> String {
    path.components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

pub fn scan_workspace(root: &Path) -> Result<OpenedWorkspace, String> {
    if !root.is_dir() {
        return Err(format!("The workspace root is not a folder: {}", root.display()));
    }
    let canonical_root = root.canonicalize().map_err(|error| format!("Could not open {}: {error}", root.display()))?;
    let mut stack = vec![canonical_root.clone()];
    let mut sql_paths = Vec::new();
    while let Some(directory) = stack.pop() {
        let entries = fs::read_dir(&directory).map_err(|error| format!("Could not scan {}: {error}", directory.display()))?;
        for entry in entries {
            let entry = match entry {
                Ok(value) => value,
                Err(_) => continue,
            };
            let path = entry.path();
            let file_type = match entry.file_type() {
                Ok(value) => value,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() && !matches!(path.file_name().and_then(|value| value.to_str()), Some(".viewdb" | ".dbstudio")) {
                stack.push(path);
            } else if file_type.is_file() && is_sql_file(&path) && !ignored_file(&path) {
                sql_paths.push(path);
            }
        }
    }
    if sql_paths.is_empty() {
        return Err("No SQL files were found beneath the selected folder.".to_string());
    }
    sql_paths.sort_by(|left, right| slash_path(left).cmp(&slash_path(right)));
    let files = sql_paths
        .into_iter()
        .map(|path| {
            let relative_path = path.strip_prefix(&canonical_root).map(slash_path).unwrap_or_else(|_| slash_path(&path));
            match fs::read_to_string(&path) {
                Ok(source) => WorkspaceFile {
                    path: path.to_string_lossy().into_owned(),
                    relative_path,
                    hash: Some(hash_source(&source)),
                    modified_ms: modified_ms(&path),
                    source: Some(source),
                    error: None,
                },
                Err(error) => WorkspaceFile {
                    path: path.to_string_lossy().into_owned(),
                    relative_path,
                    source: None,
                    hash: None,
                    modified_ms: modified_ms(&path),
                    error: Some(format!("Could not read {}: {error}", path.display())),
                },
            }
        })
        .collect();
    Ok(OpenedWorkspace {
        root_path: canonical_root.to_string_lossy().into_owned(),
        root_name: canonical_root.file_name().and_then(|value| value.to_str()).unwrap_or("SQL workspace").to_string(),
        files,
    })
}

#[tauri::command]
pub fn open_workspace(root_path: String) -> Result<OpenedWorkspace, String> {
    scan_workspace(Path::new(&root_path))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSaveFile {
    path: String,
    source: String,
    original_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSaveFileResult {
    path: String,
    hash: String,
    modified_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSaveResult {
    files: Vec<WorkspaceSaveFileResult>,
    cleanup_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryManifest {
    version: u8,
    transaction_id: String,
    entries: Vec<RecoveryManifestEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryManifestEntry {
    kind: String,
    destination: String,
    recovery: Option<String>,
    temporary: Option<String>,
    original_hash: Option<String>,
    replacement_hash: Option<String>,
}

struct PreparedWrite {
    kind: String,
    destination: PathBuf,
    relative_path: PathBuf,
    source: String,
    replacement_hash: String,
    temp_path: PathBuf,
    recovery_path: Option<PathBuf>,
    original_hash: Option<String>,
    existed: bool,
    is_sql: bool,
}

fn cleanup_temps(prepared: &[PreparedWrite]) {
    for item in prepared {
        let _ = fs::remove_file(&item.temp_path);
    }
}

fn write_synced(path: &Path, source: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().create_new(true).write(true).open(path)
        .map_err(|error| format!("Could not create {}: {error}", path.display()))?;
    file.write_all(source).map_err(|error| format!("Could not write {}: {error}", path.display()))?;
    file.sync_all().map_err(|error| format!("Could not flush {}: {error}", path.display()))
}

fn copy_synced(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination.parent().ok_or_else(|| format!("{} has no parent folder", destination.display()))?;
    fs::create_dir_all(parent).map_err(|error| format!("Could not create {}: {error}", parent.display()))?;
    fs::copy(source, destination)
        .map_err(|error| format!("Could not copy {} to {}: {error}", source.display(), destination.display()))?;
    OpenOptions::new().read(true).open(destination)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("Could not flush recovery file {}: {error}", destination.display()))
}

fn rollback(prepared: &[PreparedWrite], committed_count: usize) -> Vec<String> {
    let mut errors = Vec::new();
    for item in prepared.iter().take(committed_count).rev() {
        if item.existed {
            let Some(recovery) = &item.recovery_path else {
                errors.push(format!("{} has no recovery copy", item.destination.display()));
                continue;
            };
            let parent = match item.destination.parent() {
                Some(value) => value,
                None => {
                    errors.push(format!("{} has no parent folder", item.destination.display()));
                    continue;
                }
            };
            let restore_temp = parent.join(format!(".dbstudio-restore-{}.tmp", uuid::Uuid::new_v4()));
            let restored = copy_synced(recovery, &restore_temp)
                .and_then(|_| fs::rename(&restore_temp, &item.destination)
                    .map_err(|error| format!("Could not restore {}: {error}", item.destination.display())));
            if let Err(error) = restored {
                let _ = fs::remove_file(&restore_temp);
                errors.push(error);
            }
        } else if item.destination.exists() {
            if let Err(error) = fs::remove_file(&item.destination) {
                errors.push(format!("Could not remove newly created {}: {error}", item.destination.display()));
            }
        }
    }
    errors
}

fn recovery_error(message: String, transaction_dir: &Path, rollback_errors: &[String]) -> String {
    let rollback = if rollback_errors.is_empty() {
        "Replaced files were restored.".to_string()
    } else {
        format!("Rollback also failed: {}", rollback_errors.join("; "))
    };
    format!("{message} {rollback} Recovery files were kept at {}", transaction_dir.display())
}

fn cleanup_recovery(transaction_dir: &Path, recovery_root: &Path) -> Option<String> {
    if let Err(error) = fs::remove_dir_all(transaction_dir) {
        return Some(format!("Saved, but could not remove recovery transaction {}: {error}", transaction_dir.display()));
    }
    match fs::read_dir(recovery_root) {
        Ok(mut entries) => {
            if entries.next().is_none() {
                fs::remove_dir(recovery_root).err()
                    .map(|error| format!("Saved, but could not remove empty recovery folder {}: {error}", recovery_root.display()))
            } else {
                None
            }
        }
        Err(error) => Some(format!("Saved, but could not inspect recovery folder {}: {error}", recovery_root.display())),
    }
}

pub fn save_workspace(
    root: &Path,
    files: Vec<WorkspaceSaveFile>,
    dialect: SqlDialect,
    metadata_json: String,
) -> Result<WorkspaceSaveResult, String> {
    let root = root.canonicalize().map_err(|error| format!("Could not access workspace root: {error}"))?;
    let dbstudio_root = root.join(".dbstudio");
    if dbstudio_root.exists() {
        let metadata = fs::symlink_metadata(&dbstudio_root)
            .map_err(|error| format!("Could not inspect {}: {error}", dbstudio_root.display()))?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(format!("Refusing to use unsafe workspace data path: {}", dbstudio_root.display()));
        }
        let canonical_dbstudio = dbstudio_root.canonicalize()
            .map_err(|error| format!("Could not access {}: {error}", dbstudio_root.display()))?;
        if !canonical_dbstudio.starts_with(&root) {
            return Err(format!("Refusing to use workspace data outside the workspace: {}", canonical_dbstudio.display()));
        }
    }
    serde_json::from_str::<serde_json::Value>(&metadata_json)
        .map_err(|error| format!("Diagram metadata is not valid JSON: {error}"))?;
    let mut destinations = HashSet::with_capacity(files.len() + 1);
    let mut prepared = Vec::with_capacity(files.len() + 1);

    // Resolve, validate, hash, and de-duplicate every destination before creating recovery data.
    for item in files {
        validate_dialect(&item.source, dialect)?;
        let requested = PathBuf::from(&item.path);
        let destination = requested.canonicalize().map_err(|error| format!("Could not access {}: {error}", requested.display()))?;
        if !destination.starts_with(&root) {
            return Err(format!("Refusing to save a file outside the workspace: {}", destination.display()));
        }
        if !destinations.insert(destination.clone()) {
            return Err(format!("Refusing to save duplicate destination: {}", destination.display()));
        }
        let relative_path = destination.strip_prefix(&root)
            .map(Path::to_path_buf)
            .map_err(|_| format!("Could not resolve {} beneath the workspace", destination.display()))?;
        let current = fs::read_to_string(&destination).map_err(|error| format!("Could not preflight {}: {error}", destination.display()))?;
        if hash_source(&current) != item.original_hash {
            return Err(format!("{} changed outside DBStudio. No files were saved.", destination.display()));
        }
        let parent = destination.parent().expect("canonical file has parent");
        let temp_path = parent.join(format!(".dbstudio-{}.tmp", uuid::Uuid::new_v4()));
        prepared.push(PreparedWrite {
            kind: "sql".to_string(),
            destination,
            relative_path,
            replacement_hash: hash_source(&item.source),
            source: item.source,
            temp_path,
            recovery_path: None,
            original_hash: Some(item.original_hash),
            existed: true,
            is_sql: true,
        });
    }

    let (metadata_destination, legacy_metadata) = metadata_paths(&root)?;
    if !destinations.insert(metadata_destination.clone()) {
        return Err(format!("Refusing to save duplicate destination: {}", metadata_destination.display()));
    }
    let metadata_relative = metadata_destination.strip_prefix(&root)
        .map(Path::to_path_buf)
        .map_err(|_| "Could not resolve workspace metadata beneath the workspace".to_string())?;
    let metadata_original = if metadata_destination.exists() {
        Some(fs::read_to_string(&metadata_destination)
            .map_err(|error| format!("Could not read {}: {error}", metadata_destination.display()))?)
    } else {
        None
    };
    let metadata_temp = metadata_destination.parent().expect("workspace metadata has parent")
        .join(format!(".dbstudio-{}.tmp", uuid::Uuid::new_v4()));
    prepared.push(PreparedWrite {
        kind: "metadata".to_string(),
        destination: metadata_destination.clone(),
        relative_path: metadata_relative,
        replacement_hash: hash_source(&metadata_json),
        source: metadata_json,
        temp_path: metadata_temp,
        recovery_path: None,
        original_hash: metadata_original.as_deref().map(hash_source),
        existed: metadata_original.is_some(),
        is_sql: false,
    });

    let legacy_metadata = legacy_metadata.filter(|path| path.exists());
    let legacy_original_hash = legacy_metadata.as_ref().map(|path| {
        fs::read_to_string(path)
            .map(|source| hash_source(&source))
            .map_err(|error| format!("Could not read {}: {error}", path.display()))
    }).transpose()?;
    let transaction_id = format!("{}-{}", Utc::now().format("%Y%m%d-%H%M%S"), uuid::Uuid::new_v4());
    let recovery_root = root.join(".dbstudio").join("recovery");
    let transaction_dir = recovery_root.join(&transaction_id);

    for item in &mut prepared {
        if item.existed {
            item.recovery_path = Some(transaction_dir.join(&item.relative_path));
        }
    }

    let legacy_manifest = legacy_metadata.as_ref().map(|path| {
        let relative = path.strip_prefix(&root).map(Path::to_path_buf).unwrap_or_else(|_| PathBuf::from("workspace.sql-erd.json"));
        let recovery = transaction_dir.join(&relative);
        (path.clone(), relative, recovery)
    });

    let mut manifest_entries = prepared.iter().map(|item| RecoveryManifestEntry {
        kind: item.kind.clone(),
        destination: slash_path(&item.relative_path),
        recovery: item.recovery_path.as_ref().and_then(|path| path.strip_prefix(&transaction_dir).ok()).map(slash_path),
        temporary: item.temp_path.strip_prefix(&root).ok().map(slash_path),
        original_hash: item.original_hash.clone(),
        replacement_hash: Some(item.replacement_hash.clone()),
    }).collect::<Vec<_>>();
    if let Some((_, relative, recovery)) = &legacy_manifest {
        manifest_entries.push(RecoveryManifestEntry {
            kind: "legacy-metadata".to_string(),
            destination: slash_path(relative),
            recovery: recovery.strip_prefix(&transaction_dir).ok().map(slash_path),
            temporary: None,
            original_hash: legacy_original_hash.clone(),
            replacement_hash: None,
        });
    }
    let manifest = RecoveryManifest { version: 1, transaction_id, entries: manifest_entries };
    let manifest_json = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("Could not serialize recovery manifest: {error}"))?;
    fs::create_dir_all(&transaction_dir)
        .map_err(|error| format!("Could not create recovery transaction {}: {error}", transaction_dir.display()))?;
    if let Err(error) = write_synced(&transaction_dir.join("manifest.json"), &manifest_json) {
        return Err(format!("{error}. Recovery directory: {}", transaction_dir.display()));
    }

    for item in &prepared {
        if let Some(recovery) = &item.recovery_path {
            if let Err(error) = copy_synced(&item.destination, recovery) {
                cleanup_temps(&prepared);
                return Err(format!("{error}. Recovery files were kept at {}", transaction_dir.display()));
            }
        }
    }
    if let Some((path, _, recovery)) = &legacy_manifest {
        if let Err(error) = copy_synced(path, recovery) {
            cleanup_temps(&prepared);
            return Err(format!("{error}. Recovery files were kept at {}", transaction_dir.display()));
        }
    }
    for item in &prepared {
        if let Some(parent) = item.temp_path.parent() {
            if let Err(error) = fs::create_dir_all(parent) {
                cleanup_temps(&prepared);
                return Err(format!("Could not create {}: {error}. Recovery files were kept at {}", parent.display(), transaction_dir.display()));
            }
        }
        if let Err(error) = write_synced(&item.temp_path, item.source.as_bytes()) {
            cleanup_temps(&prepared);
            return Err(format!("{error}. Recovery files were kept at {}", transaction_dir.display()));
        }
    }

    // Close the preflight-to-commit race without rebuilding any lookup structure.
    for item in &prepared {
        if item.existed {
            let current = match fs::read_to_string(&item.destination) {
                Ok(value) => value,
                Err(error) => {
                    cleanup_temps(&prepared);
                    return Err(format!("Could not recheck {}: {error}. Recovery files were kept at {}", item.destination.display(), transaction_dir.display()));
                }
            };
            let current_hash = hash_source(&current);
            if item.original_hash.as_deref() != Some(current_hash.as_str()) {
                cleanup_temps(&prepared);
                return Err(format!("{} changed while DBStudio was preparing the save. No files were replaced. Recovery files were kept at {}", item.destination.display(), transaction_dir.display()));
            }
        } else if item.destination.exists() {
            cleanup_temps(&prepared);
            return Err(format!("{} was created while DBStudio was preparing the save. No files were replaced. Recovery files were kept at {}", item.destination.display(), transaction_dir.display()));
        }
    }
    if let Some(legacy) = &legacy_metadata {
        let current = match fs::read_to_string(legacy) {
            Ok(value) => value,
            Err(error) => {
                cleanup_temps(&prepared);
                return Err(format!("Could not recheck {}: {error}. Recovery files were kept at {}", legacy.display(), transaction_dir.display()));
            }
        };
        let current_hash = hash_source(&current);
        if legacy_original_hash.as_deref() != Some(current_hash.as_str()) {
            cleanup_temps(&prepared);
            return Err(format!("{} changed while DBStudio was preparing the save. No files were replaced. Recovery files were kept at {}", legacy.display(), transaction_dir.display()));
        }
    }

    let mut committed_count = 0usize;
    for item in &prepared {
        if let Err(error) = fs::rename(&item.temp_path, &item.destination) {
            let rollback_errors = rollback(&prepared, committed_count);
            cleanup_temps(&prepared);
            return Err(recovery_error(format!("Could not replace {}: {error}.", item.destination.display()), &transaction_dir, &rollback_errors));
        }
        committed_count += 1;
    }

    if let Some(legacy) = &legacy_metadata {
        if let Err(error) = fs::remove_file(legacy) {
            let rollback_errors = rollback(&prepared, committed_count);
            return Err(recovery_error(format!("Could not remove legacy metadata {}: {error}.", legacy.display()), &transaction_dir, &rollback_errors));
        }
    }

    let files = prepared.iter().filter(|item| item.is_sql).map(|item| WorkspaceSaveFileResult {
        path: item.destination.to_string_lossy().into_owned(),
        hash: item.replacement_hash.clone(),
        modified_ms: modified_ms(&item.destination),
    }).collect();
    let cleanup_warning = cleanup_recovery(&transaction_dir, &recovery_root);

    Ok(WorkspaceSaveResult {
        files,
        cleanup_warning,
    })
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_workspace_files(root_path: String, files: Vec<WorkspaceSaveFile>, dialect: SqlDialect, metadata_json: String) -> Result<WorkspaceSaveResult, String> {
    save_workspace(Path::new(&root_path), files, dialect, metadata_json)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_preserves_only_sql_paths_and_ignores_symlinks() {
        let root = tempfile::tempdir().expect("root");
        fs::create_dir_all(root.path().join("schema/nested")).expect("folders");
        fs::create_dir_all(root.path().join("empty")).expect("empty");
        fs::create_dir_all(root.path().join(".viewdb/recovery/failed/schema")).expect("recovery folders");
        fs::write(root.path().join("schema/file10.sql"), "CREATE TABLE ten(id int);").expect("sql");
        fs::write(root.path().join("schema/nested/file2.SQL"), "CREATE TABLE two(id int);").expect("sql");
        fs::write(root.path().join(".viewdb/recovery/failed/schema/file3.sql"), "CREATE TABLE hidden(id int);").expect("recovery sql");
        fs::write(root.path().join("empty/readme.txt"), "ignore").expect("text");
        let result = scan_workspace(root.path()).expect("scan");
        let paths = result.files.iter().map(|file| file.relative_path.as_str()).collect::<Vec<_>>();
        assert_eq!(paths, vec!["schema/file10.sql", "schema/nested/file2.SQL"]);
    }

    #[test]
    fn save_preflights_every_file_before_writing() {
        let root = tempfile::tempdir().expect("root");
        let first = root.path().join("first.sql");
        let second = root.path().join("second.sql");
        fs::write(&first, "CREATE TABLE first(id int);").expect("first");
        fs::write(&second, "CREATE TABLE changed(id int);").expect("second");
        let result = save_workspace(root.path(), vec![
            WorkspaceSaveFile { path: first.to_string_lossy().into_owned(), source: "CREATE TABLE first(id bigint);".into(), original_hash: hash_source("CREATE TABLE first(id int);") },
            WorkspaceSaveFile { path: second.to_string_lossy().into_owned(), source: "CREATE TABLE second(id int);".into(), original_hash: hash_source("CREATE TABLE second(id int);") },
        ], SqlDialect::Postgresql, "{}".to_string());
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(first).expect("unchanged"), "CREATE TABLE first(id int);");
        assert!(!root.path().join(".viewdb").exists());
    }

    #[test]
    fn successful_save_cleans_recovery_and_migrates_metadata() {
        let root = tempfile::tempdir().expect("root");
        let sql = root.path().join("schema.sql");
        let legacy_metadata = root.path().join("workspace.sql-erd.json");
        fs::write(&sql, "CREATE TABLE example(id int);").expect("sql");
        fs::write(&legacy_metadata, "{\"version\":1}").expect("legacy metadata");

        let result = save_workspace(root.path(), vec![WorkspaceSaveFile {
            path: sql.to_string_lossy().into_owned(),
            source: "CREATE TABLE example(id bigint);".to_string(),
            original_hash: hash_source("CREATE TABLE example(id int);"),
        }], SqlDialect::Postgresql, "{\"version\":1,\"tables\":[]}".to_string()).expect("save");

        assert!(result.cleanup_warning.is_none());
        assert_eq!(fs::read_to_string(&sql).expect("saved sql"), "CREATE TABLE example(id bigint);");
        assert!(root.path().join(".dbstudio/workspace.json").exists());
        assert!(!legacy_metadata.exists());
        assert!(!root.path().join(".dbstudio/recovery").exists());
    }
}
