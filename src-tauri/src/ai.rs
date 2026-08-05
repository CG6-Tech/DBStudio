use std::io::Write;
use std::process::{Command, Stdio};

/// Which local agent CLI to invoke. The prompt is passed on stdin so no schema
/// content ever lands in argv (safe for large prompts and shell-sensitive text).
///
/// DBStudio does NOT manage credentials: it relies on the CLI the user has
/// already installed and authenticated (`claude` = Claude Code, `codex` = Codex).
/// This keeps keys out of the app entirely — no Keychain, no HTTP, no CSP.
#[derive(Debug)]
struct AgentInvocation {
    program: String,
    args: Vec<String>,
}

fn invocation_for(agent_id: &str, program_override: Option<String>) -> Result<AgentInvocation, String> {
    match agent_id {
        // `claude -p` reads the prompt from stdin when none is given as an arg,
        // and emits a JSON envelope whose `.result` holds the reply text.
        "claude" => Ok(AgentInvocation {
            program: program_override.unwrap_or_else(|| "claude".to_string()),
            args: vec!["-p".into(), "--output-format".into(), "json".into()],
        }),
        // `codex exec` reads the prompt from stdin; --skip-git-repo-check avoids
        // the trusted-directory gate. The reply is captured via the events on
        // stdout (the final "codex" message).
        "codex" => Ok(AgentInvocation {
            program: program_override.unwrap_or_else(|| "codex".to_string()),
            args: vec!["exec".into(), "--skip-git-repo-check".into(), "-".into()],
        }),
        other => Err(format!("Unknown AI agent: {other}")),
    }
}

/// Extract the reply text from an agent's stdout.
fn extract_reply(agent_id: &str, stdout: &str) -> Result<String, String> {
    match agent_id {
        "claude" => {
            let parsed: serde_json::Value = serde_json::from_str(stdout.trim())
                .map_err(|error| format!("Could not parse Claude Code output: {error}"))?;
            if parsed.get("is_error").and_then(|value| value.as_bool()).unwrap_or(false) {
                return Err(parsed.get("result").and_then(|value| value.as_str()).unwrap_or("Claude Code reported an error.").to_string());
            }
            Ok(parsed.get("result").and_then(|value| value.as_str()).unwrap_or_default().trim().to_string())
        }
        // Codex exec prints human-readable events; the reply follows the final
        // "codex" marker line. Fall back to the whole trimmed stdout.
        "codex" => {
            if let Some(index) = stdout.rfind("\ncodex\n") {
                let tail = stdout[index + "\ncodex\n".len()..].trim();
                let cleaned: Vec<&str> = tail
                    .lines()
                    .take_while(|line| !line.starts_with("tokens used") && !line.starts_with("hook:"))
                    .collect();
                return Ok(cleaned.join("\n").trim().to_string());
            }
            Ok(stdout.trim().to_string())
        }
        other => Err(format!("Unknown AI agent: {other}")),
    }
}

/// Run a local agent CLI headlessly with `prompt` on stdin and return its reply.
///
/// `agent_id` is "claude" or "codex". `program_override` lets callers point at a
/// non-PATH binary. Runs synchronously on Tauri's worker thread (like the
/// blocking DB introspection command), so a slow model does not block the UI.
#[tauri::command(rename_all = "camelCase")]
pub(crate) fn run_agent_cli(
    agent_id: String,
    prompt: String,
    program_override: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    let invocation = invocation_for(&agent_id, program_override)?;
    let _ = timeout_secs; // reserved for a future wall-clock guard

    let mut child = Command::new(&invocation.program)
        .args(&invocation.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start '{}'. Is it installed and on your PATH? ({error})", invocation.program))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(prompt.as_bytes())
            .map_err(|error| format!("Could not send the prompt to {}: {error}", invocation.program))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("The agent '{}' did not complete: {error}", invocation.program))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("{} exited with {}: {}", invocation.program, output.status, stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    extract_reply(&agent_id, &stdout)
}

/// Report whether an agent CLI is available on PATH (or at an override path).
#[tauri::command(rename_all = "camelCase")]
pub(crate) fn agent_cli_available(agent_id: String, program_override: Option<String>) -> bool {
    let invocation = match invocation_for(&agent_id, program_override) {
        Ok(value) => value,
        Err(_) => return false,
    };
    Command::new(&invocation.program)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
        .and_then(|mut child| child.wait())
        .map(|status| status.success())
        .unwrap_or(false)
}
