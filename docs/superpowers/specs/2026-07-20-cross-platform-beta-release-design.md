# Cross-Platform Beta Release Design

## Objective

Prepare DBStudio for a private cross-platform beta release on macOS, Windows, and Linux. The beta adds a visible beta identity, optional Firebase authentication, in-app feedback, and signed in-place updates. Existing local schema-editing capabilities remain available without an account.

## Release Scope

The first beta version is `0.1.0-beta.1`. The same version must appear in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, the application UI, generated installers, updater metadata, and release records. The main toolbar displays a compact `Beta` badge beside the DBStudio identity.

The release includes:

- Native packages for macOS Apple Silicon and Intel, Windows x64, and Linux x64. Additional Windows and Linux architectures are deferred until the build and update matrix can test them natively.
- Optional Google and email/password authentication.
- An in-app feedback form with optional screenshot and diagnostics.
- Private installer storage and a public update-check endpoint that requires no user sign-in.
- Prompted, signed in-place updates with optional mandatory-release enforcement.
- Automated build, test, packaging, publishing, and rollback procedures.

The release does not require authentication to open, edit, import, export, preview, migrate, or save local SQL projects.

## Architecture

### Desktop Application

The React application gains focused modules for release identity, authentication state, feedback collection, and update status. These modules remain outside the schema editing domain so a Firebase or update outage cannot prevent local work.

Platform-sensitive behavior stays behind the existing desktop boundary. Browser preview mode may display the beta identity and exercise form validation, but native sign-in return handling, screenshot capture, secure updater installation, and restart behavior are desktop-only capabilities.

The Tauri application uses the official updater facilities for artifact download, signature verification, installation, and restart. Update metadata is converted into the updater's expected platform-specific response by the release endpoint rather than by custom installer code in the React application.

### Firebase Services

A new Firebase project provides:

- Firebase Authentication for Google and email/password accounts.
- Firestore for feedback records and release metadata.
- Firebase Storage for private feedback screenshots and private release artifacts.
- Cloud Functions for feedback submission, release-manifest delivery, and short-lived artifact download links.
- Firebase Hosting for the desktop-safe Google authentication bridge if required by the provider redirect flow.

Firebase public client configuration may be bundled in the application. Firebase administrative credentials, service-account material, updater private keys, and platform signing credentials remain in protected deployment or CI secret stores.

### Authentication

Authentication is optional. The account control supports Google sign-in, email/password sign-in, password reset, sign-out, and actionable error states. Google authentication uses a hosted browser flow and returns to the desktop app through a registered, validated callback. The implementation must work consistently across macOS, Windows, and Linux and must reject unsolicited, expired, or state-mismatched callbacks.

Authentication failure never blocks app startup or local editing. A persisted session restores when valid, and signing out clears locally persisted authentication state. Authentication tokens must not be written to logs or feedback diagnostics.

### Feedback

The in-app feedback form contains:

- Category.
- Message.
- Optional contact email, prefilled for authenticated users when available.
- Optional PNG or JPEG screenshot, limited to 5 MB.
- Optional diagnostic details with a visible preview before submission.

The user explicitly submits the form before any information leaves the device. Diagnostics may include the DBStudio version, operating system, architecture, application mode, and at most 20 non-sensitive recent application errors. Diagnostics must exclude SQL contents, local file and folder paths, database hosts, usernames, passwords, connection strings, authentication tokens, environment variables, and arbitrary application state.

The client submits feedback to a rate-limited Cloud Function. The function validates allowed fields, lengths, content types, and upload sizes before writing the record to Firestore and any screenshot to a private Storage path. Direct unauthenticated Firestore feedback writes are denied. Anonymous feedback remains supported without requiring visible sign-in.

### Updates

Release artifacts live in private Firebase Storage. Firestore contains the canonical release record:

- Semantic prerelease version.
- Channel (`beta`).
- Publication and mandatory status.
- Minimum supported version.
- Release notes.
- Per-platform and per-architecture artifact metadata.
- Artifact size, checksum, updater signature, and Storage object identifier.

A public, read-only Cloud Function reads the active Firestore beta release, selects metadata for the requested platform and architecture, and returns the updater manifest with a short-lived artifact URL. Update checks require no Firebase sign-in. The endpoint does not expose Storage administration access or reusable credentials.

The app checks once after startup without delaying the initial workspace, every six hours while running, and when the user chooses **Check for updates**. If a newer compatible beta exists, the dialog displays its version, notes, size, and mandatory status. Normal releases offer **Install now** and **Later**. Selecting **Later** suppresses automatic prompts for that version for 24 hours while preserving manual checks.

A mandatory update clearly explains why continued use is blocked and provides retry and exit actions. It must not be activated until platform artifacts have passed clean-install and update smoke tests. Download or installation failure preserves the currently installed version and offers a retry. The updater rejects invalid signatures, malformed manifests, platform mismatches, missing artifacts, and version downgrades.

## Security

Production builds replace the current unrestricted content-security policy with a narrow allowlist containing only required application, Firebase, authentication, and update origins. Development-only origins are not present in release configuration.

Firestore and Storage rules deny direct public access except where explicitly required. Feedback submission and private artifact access pass through validated Functions. Functions apply request-size limits, field allowlists, rate limits, abuse controls, and safe error responses. Logs omit tokens, credentials, feedback bodies, screenshots, and short-lived artifact URLs.

Updater artifacts are signed independently of transport security. The updater public verification key is embedded in the desktop app; the corresponding private key exists only in protected CI secrets. Platform signing and notarization credentials are likewise supplied through CI and never committed.

## User Experience

The toolbar displays the DBStudio identity, `Beta` badge, and an account control without crowding primary document actions. Feedback and update entry points live in an application menu or a compact release/account menu. Authentication and feedback use focused dialogs with keyboard navigation, loading states, validation messages, and retry behavior.

Update installation shows download progress and a clear restart expectation. Background update checks are quiet when no update exists. Firebase outages produce concise, non-blocking messages and do not alter or risk the open SQL workspace.

## Release Pipeline

The release pipeline runs on native macOS, Windows, and Linux workers. Fresh-install packages are DMG on macOS, NSIS on Windows, and AppImage plus DEB on Linux. Signed updater artifacts use Tauri's supported updater format for each platform. The pipeline performs:

1. Dependency installation from committed lockfiles.
2. TypeScript tests and production build.
3. Rust tests and release compilation.
4. Firebase Emulator Suite tests for Auth-related integration, Functions, Firestore rules, and Storage rules.
5. Native installer and updater artifact generation for supported platform and architecture combinations.
6. Platform signing and macOS notarization when the required credentials are available.
7. Updater signing, checksum generation, and artifact inventory validation.
8. Upload to a versioned private Firebase Storage location.
9. Clean-install and previous-beta-to-current-beta smoke tests.
10. Creation of an unpublished Firestore release record.
11. Manual promotion of the validated record to the active beta release.

Publishing is atomic from the client's perspective: the active Firestore pointer changes only after all required artifacts and metadata exist. Rollback changes the active release pointer to the previous valid beta and disables a faulty mandatory flag; already installed applications are not silently downgraded.

## Configuration and Documentation

The repository includes safe environment templates and Firebase project aliases without secrets. Operator documentation covers Firebase project creation, enabling authentication providers, authorized domains and callback URLs, Functions deployment, Firestore and Storage rules, signing-key generation, CI secret names, artifact promotion, mandatory-update activation, and rollback.

End-user documentation covers beta limitations, supported platforms, optional accounts, feedback data handling, update behavior, uninstall instructions, and how to report a failed update. A privacy disclosure describes exactly what authentication and feedback data is collected and states that project SQL is not included in feedback diagnostics.

## Testing and Acceptance Criteria

Automated tests cover:

- Beta badge and synchronized version display.
- Signed-out startup and unrestricted local editing.
- Google and email/password authentication success, cancellation, restoration, reset, sign-out, and error paths.
- Feedback validation, diagnostic redaction, optional screenshot handling, rate limiting, and offline retry messaging.
- Semantic prerelease comparison and beta-channel filtering.
- Platform and architecture artifact selection.
- No-update, optional-update, deferred-update, mandatory-update, malformed-manifest, unavailable-endpoint, invalid-signature, interrupted-download, and failed-install behavior.
- Firebase Functions and security rules through local emulators.

The beta is ready to promote when:

- Existing TypeScript and Rust suites remain green.
- Production builds complete on all three operating systems.
- No committed secret or unrestricted production security policy remains.
- Installers launch successfully on clean supported systems.
- An installed previous beta updates in place on each supported platform while preserving user work.
- Tampered artifacts are rejected.
- Anonymous feedback, authenticated feedback, and screenshot upload succeed without exposing records or artifacts publicly.
- Update checks succeed without user authentication while private Storage objects remain inaccessible through permanent public URLs.
- Release, rollback, privacy, and known-limitations documentation is complete.

## Implementation Boundaries

The work is divided into four independently testable units:

1. Release identity and synchronized versioning.
2. Firebase project, authentication, and feedback services.
3. Signed updater client, release endpoint, and artifact publishing.
4. Cross-platform CI, signing, smoke testing, documentation, and promotion.

Each unit exposes narrow interfaces to the application shell. Firebase integration does not enter schema domain modules, updater behavior does not depend on authentication state, and release infrastructure does not modify SQL persistence behavior.
