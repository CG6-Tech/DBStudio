use std::time::Duration;

const KEYCHAIN_SERVICE: &str = "com.dbstudio.ai-providers";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

#[cfg(target_os = "macos")]
fn ai_key(provider_id: &str) -> Result<String, String> {
    let bytes = security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, provider_id)
        .map_err(|_| "No API key is stored for this provider. Open AI settings and enter it again.".to_string())?;
    String::from_utf8(bytes).map_err(|_| "The stored API key is invalid UTF-8.".to_string())
}

#[cfg(not(target_os = "macos"))]
fn ai_key(_provider_id: &str) -> Result<String, String> {
    Err("Secure API key storage is only available in the macOS app.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn save_ai_secret(provider_id: String, api_key: String) -> Result<(), String> {
    if provider_id.trim().is_empty() || api_key.is_empty() {
        return Err("A provider and API key are required.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, &provider_id, api_key.as_bytes())
            .map_err(|error| format!("Could not store the API key in macOS Keychain: {error}"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = api_key;
        Err("Secure API key storage is only available in the macOS app.".to_string())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn delete_ai_secret(provider_id: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        match security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, &provider_id) {
            Ok(()) => Ok(()),
            Err(_) => Ok(()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = provider_id;
        Ok(())
    }
}

#[tauri::command(rename_all = "camelCase")]
pub(crate) fn has_ai_secret(provider_id: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, &provider_id).is_ok())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = provider_id;
        Ok(false)
    }
}

/// Auth header style differs per provider; the request/response bodies are shaped
/// entirely in the TypeScript connector. This command only attaches the stored
/// key with the right headers, POSTs the pre-built body, and returns the raw
/// response text for the connector to parse. Keeping the key here means it never
/// enters the webview and no CSP allowlist is required (the call runs in Rust).
#[tauri::command(rename_all = "camelCase")]
pub(crate) fn ai_complete(
    provider_id: String,
    endpoint: String,
    body: serde_json::Value,
) -> Result<String, String> {
    if endpoint.trim().is_empty() {
        return Err("An AI endpoint is required.".to_string());
    }
    let key = ai_key(&provider_id)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|error| format!("Could not initialize the AI HTTP client: {error}"))?;

    let mut request = client.post(&endpoint).json(&body);
    request = match provider_id.as_str() {
        "anthropic" => request
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
        _ => request.header("authorization", format!("Bearer {key}")),
    };

    let response = request
        .send()
        .map_err(|error| format!("Could not reach the AI provider: {error}"))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|error| format!("Could not read the AI provider response: {error}"))?;
    if !status.is_success() {
        return Err(format!("The AI provider returned {status}: {text}"));
    }
    Ok(text)
}
