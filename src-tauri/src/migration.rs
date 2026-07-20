use crate::SqlDialect;
use mysql::{prelude::Queryable, OptsBuilder, SslOpts};
use postgres::{Config, NoTls};
use postgres_native_tls::MakeTlsConnector;
use serde::{Deserialize, Serialize};
use std::time::Duration;

const KEYCHAIN_SERVICE: &str = "com.dbstudio.migration-connections";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionProfile {
    id: String,
    name: String,
    dialect: SqlDialect,
    host: String,
    port: u16,
    database: String,
    username: String,
    tls: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IntrospectedDatabase {
    dialect: SqlDialect,
    source: String,
    engine_version: String,
    source_label: String,
}

#[cfg(target_os = "macos")]
fn keychain_password(profile_id: &str) -> Result<String, String> {
    let bytes = security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, profile_id)
        .map_err(|_| "No password is stored for this connection. Edit the profile and enter it again.".to_string())?;
    String::from_utf8(bytes).map_err(|_| "The stored connection password is invalid UTF-8.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn keychain_password(_profile_id: &str) -> Result<String, String> {
    Err("Secure connection storage is only available in the macOS app.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn save_connection_secret(profile_id: String, password: String) -> Result<(), String> {
    if profile_id.trim().is_empty() || password.is_empty() {
        return Err("A profile and password are required.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, &profile_id, password.as_bytes())
            .map_err(|error| format!("Could not store the password in macOS Keychain: {error}"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = password;
        Err("Secure connection storage is only available in the macOS app.".to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn delete_connection_secret(profile_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        match security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, &profile_id) {
            Ok(()) => Ok(()),
            Err(_) => Ok(()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = profile_id;
        Ok(())
    }
}

fn quote_postgres(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn quote_mysql(value: &str) -> String {
    format!("`{}`", value.replace('`', "``"))
}

fn postgres_source(profile: &ConnectionProfile, password: &str) -> Result<IntrospectedDatabase, String> {
    let mut config = Config::new();
    config.host(&profile.host).port(profile.port).dbname(&profile.database).user(&profile.username).password(password).connect_timeout(Duration::from_secs(8));
    config.options("-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000");
    let mut client = if profile.tls {
        let connector = native_tls::TlsConnector::builder().build().map_err(|error| format!("Could not initialize TLS: {error}"))?;
        config.connect(MakeTlsConnector::new(connector)).map_err(|error| format!("Could not connect to PostgreSQL: {error}"))?
    } else {
        config.connect(NoTls).map_err(|error| format!("Could not connect to PostgreSQL: {error}"))?
    };
    let version: String = client.query_one("SHOW server_version", &[]).map_err(|error| format!("Could not read PostgreSQL version: {error}"))?.get(0);
    let table_rows = client.query(
        "SELECT n.nspname, c.relname, a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrel) \
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped \
         LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum \
         WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,a.attnum", &[])
        .map_err(|error| format!("Could not inspect PostgreSQL columns: {error}"))?;
    let constraint_rows = client.query(
        "SELECT n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid, true) FROM pg_constraint con \
         JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace \
         WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND con.contype IN ('p','u','f','c') ORDER BY n.nspname,c.relname,con.conname", &[])
        .map_err(|error| format!("Could not inspect PostgreSQL constraints: {error}"))?;
    let mut tables = std::collections::BTreeMap::<(String, String), Vec<String>>::new();
    for row in table_rows {
        let schema: String = row.get(0); let table: String = row.get(1); let column: String = row.get(2); let data_type: String = row.get(3); let not_null: bool = row.get(4); let default_value: Option<String> = row.get(5);
        let mut definition = format!("{} {}", quote_postgres(&column), data_type);
        if let Some(value) = default_value { definition.push_str(&format!(" DEFAULT {value}")); }
        if not_null { definition.push_str(" NOT NULL"); }
        tables.entry((schema, table)).or_default().push(definition);
    }
    for row in constraint_rows {
        let schema: String = row.get(0); let table: String = row.get(1); let name: String = row.get(2); let definition: String = row.get(3);
        tables.entry((schema, table)).or_default().push(format!("CONSTRAINT {} {}", quote_postgres(&name), definition));
    }
    let mut source = String::new();
    for ((schema, table), definitions) in tables {
        source.push_str(&format!("CREATE TABLE {}.{} (\n  {}\n);\n\n", quote_postgres(&schema), quote_postgres(&table), definitions.join(",\n  ")));
    }
    for row in client.query(
        "SELECT indexdef FROM pg_indexes i WHERE schemaname NOT IN ('pg_catalog','information_schema') AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid=(quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass) ORDER BY schemaname,tablename,indexname", &[])
        .map_err(|error| format!("Could not inspect PostgreSQL indexes: {error}"))? {
        let definition: String = row.get(0); source.push_str(&definition); source.push_str(";\n");
    }
    for row in client.query("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,p.proname,p.oid", &[]).map_err(|error| format!("Could not inspect PostgreSQL routines: {error}"))? {
        let definition: String = row.get(0); source.push('\n'); source.push_str(&definition); source.push_str(";\n");
    }
    for row in client.query("SELECT pg_get_triggerdef(t.oid, true) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY n.nspname,c.relname,t.tgname", &[]).map_err(|error| format!("Could not inspect PostgreSQL triggers: {error}"))? {
        let definition: String = row.get(0); source.push('\n'); source.push_str(&definition); source.push_str(";\n");
    }
    Ok(IntrospectedDatabase { dialect: SqlDialect::Postgresql, source, engine_version: version, source_label: format!("{} · {}/{}", profile.name, profile.host, profile.database) })
}

fn mysql_source(profile: &ConnectionProfile, password: &str) -> Result<IntrospectedDatabase, String> {
    let mut builder = OptsBuilder::new()
        .ip_or_hostname(Some(profile.host.clone())).tcp_port(profile.port).db_name(Some(profile.database.clone()))
        .user(Some(profile.username.clone())).pass(Some(password.to_string())).prefer_socket(false)
        .tcp_connect_timeout(Some(Duration::from_secs(8))).read_timeout(Some(Duration::from_secs(15))).write_timeout(Some(Duration::from_secs(15)));
    if profile.tls { builder = builder.ssl_opts(Some(SslOpts::default())); }
    let mut connection = mysql::Conn::new(builder).map_err(|error| format!("Could not connect to MySQL: {error}"))?;
    connection.query_drop("SET SESSION TRANSACTION READ ONLY").map_err(|error| format!("Could not enable read-only MySQL introspection: {error}"))?;
    let version: String = connection.query_first("SELECT VERSION()").map_err(|error| format!("Could not read MySQL version: {error}"))?.unwrap_or_else(|| "unknown".to_string());
    let table_names: Vec<String> = connection.exec_map("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME", (&profile.database,), |name: String| name).map_err(|error| format!("Could not inspect MySQL tables: {error}"))?;
    let mut source = String::new();
    for table in table_names {
        let query = format!("SHOW CREATE TABLE {}.{}", quote_mysql(&profile.database), quote_mysql(&table));
        let row: Option<(String, String)> = connection.query_first(query).map_err(|error| format!("Could not inspect MySQL table {table}: {error}"))?;
        if let Some((_name, definition)) = row { source.push_str(&definition); source.push_str(";\n\n"); }
    }
    Ok(IntrospectedDatabase { dialect: SqlDialect::Mysql, source, engine_version: version, source_label: format!("{} · {}/{}", profile.name, profile.host, profile.database) })
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn introspect_database(profile: ConnectionProfile, password: Option<String>) -> Result<IntrospectedDatabase, String> {
    if profile.host.trim().is_empty() || profile.database.trim().is_empty() || profile.username.trim().is_empty() {
        return Err("The connection profile is incomplete.".to_string());
    }
    let password = match password { Some(value) if !value.is_empty() => value, _ => keychain_password(&profile.id)? };
    match profile.dialect {
        SqlDialect::Postgresql => postgres_source(&profile, &password),
        SqlDialect::Mysql => mysql_source(&profile, &password),
    }
}
