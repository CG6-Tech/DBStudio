# Browser default workspace fixture design

## Objective

Load `/Users/cg/Downloads/chartdb-folder-test` automatically when ViewDB runs in the browser development preview. Keep the macOS app and production browser build unchanged.

## Scope

The behavior is enabled only by the Vite development server used by `npm run dev`. It is not bundled into production output and does not change the Tauri workspace scanner or native startup sequence.

## Development server endpoint

A small Vite development plugin exposes one internal endpoint for the configured fixture folder. The endpoint scans the folder and returns an `OpenedWorkspace`-compatible JSON payload.

The scanner:

- resolves the configured root path;
- rejects a missing or non-directory root;
- recursively reads supported SQL and workspace metadata files using the same inclusion rules as the native scanner;
- skips hidden, generated, dependency, and `.viewdb` directories;
- returns stable relative paths and source text;
- sorts files deterministically;
- returns a concise error response without exposing unrelated filesystem contents.

The endpoint is read-only. It cannot save, delete, rename, or browse arbitrary paths.

## Browser startup

Browser development startup first requests the default fixture workspace. When the request succeeds, ViewDB passes the response through the existing dialect detection and `loadSqlWorkspace` pipeline. This exercises the real parser, workspace linker, explorer, logic graph, and flow UI.

The macOS app continues using its current startup behavior. A production browser build continues loading the bundled example.

## Configuration

The default fixture path is development configuration rather than application state. The initial configured value is:

```text
/Users/cg/Downloads/chartdb-folder-test
```

The Vite configuration owns this path and the client knows only the fixed internal endpoint. The client does not receive a general filesystem API.

## Failure behavior

If the endpoint is unavailable, the folder is missing, no supported SQL files exist, dialect detection or parsing fails, or the response is malformed, browser startup falls back to the bundled example.

The status area reports that the fixture could not be loaded and that the example was used. Startup must not remain stuck in a busy state.

## Refresh behavior

The endpoint scans the folder for every request. Refreshing the browser therefore loads current file contents without restarting Vite. Automatic filesystem watching and hot replacement of an already-open workspace are out of scope.

## Security boundary

- The endpoint exists only in Vite serve mode.
- The endpoint accepts no user-supplied path or query-based path override.
- Reads remain beneath the configured canonical root.
- Symbolic links that escape the root are rejected or skipped.
- Responses contain only supported workspace files and required metadata.
- No write operation is exposed.

## Testing

Tests cover deterministic scanning, supported extensions, ignored directories, path containment, escaping symbolic links, missing roots, and empty workspaces.

Startup tests cover successful fixture loading, dialect selection, fallback to the example, visible fallback status, and unchanged native/production behavior. The complete test suite and production build must pass.

## Out of scope

- Loading arbitrary browser folders without a user gesture.
- Changing the default macOS workspace.
- Saving browser edits back to the fixture folder.
- Watching files and updating the UI without refresh.
- Shipping an absolute local path in production assets.
