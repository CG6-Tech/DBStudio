# Cross-Platform Beta Release Implementation Plan

## Goal

Ship DBStudio `0.1.0-beta.1` as a signed, private beta for macOS Apple Silicon and Intel, Windows x64, and Linux x64. Local editing remains available without an account. Optional Firebase authentication, anonymous or authenticated feedback, and signed in-place beta updates are isolated from the schema domain.

## Delivery Strategy

Implement this work in four checkpoints. Keep each checkpoint independently testable and do not publish an active update record until all native artifacts exist.

1. Release identity and safe configuration.
2. Firebase authentication and feedback.
3. Signed updater and release service.
4. Native packaging, CI, documentation, and beta promotion.

The repository already contains extensive uncommitted feature work. Every implementation commit must stage only files touched by its task and must not clean, reset, or reformat unrelated files.

## Task 1: Establish Beta Identity and Version Synchronization

**Files:**

- Modify `package.json` and `package-lock.json`.
- Modify `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`.
- Modify `src-tauri/tauri.conf.json`.
- Create `scripts/check-version.mjs`.
- Create `src/platform/releaseIdentity.ts`.
- Create `src/platform/releaseIdentity.test.ts`.
- Create `src/components/BetaBadge.tsx`.
- Create `src/components/BetaBadge.test.tsx`.
- Modify `src/components/Toolbar.tsx` and `src/styles.css`.

**Steps:**

1. Add failing tests for parsing the application version, recognizing the `beta` prerelease channel, and rendering an accessible `Beta` badge.
2. Change all three authoritative package versions to `0.1.0-beta.1` and replace the sample bundle identifier with the stable desktop identifier `app.dbstudio.desktop`.
3. Expose `APP_VERSION`, `RELEASE_CHANNEL`, and `IS_BETA` from a small release identity module. Source the value from build-time package metadata rather than duplicating a fourth literal.
4. Add `scripts/check-version.mjs` to fail when npm, Cargo, and Tauri versions differ or when a beta build lacks a SemVer prerelease.
5. Add `npm run check:version` and include it in `npm run build` or a new `npm run verify` command.
6. Render the badge beside the brand, with a screen-reader label containing the full version.
7. Run the focused tests, version check, full TypeScript tests, and production build.

**Acceptance:** One version drives the UI and packaging metadata, the bundle identifier is no longer a sample value, and version drift fails locally and in CI.

## Task 2: Create Safe Runtime Configuration

**Files:**

- Create `.env.example`.
- Modify `.gitignore`.
- Create `src/platform/runtimeConfig.ts`.
- Create `src/platform/runtimeConfig.test.ts`.
- Modify `src/vite-env.d.ts`.
- Modify `vite.config.ts`.
- Modify `src-tauri/tauri.conf.json`.

**Steps:**

1. Add tests that reject incomplete Firebase public configuration, non-HTTPS production endpoints, and accidental server credentials.
2. Define only public client variables: Firebase API key, auth domain, project ID, app ID, Storage bucket, Functions region, hosted auth URL, and update endpoint.
3. Keep service-account JSON, updater private keys, platform signing credentials, and Firebase administrative tokens out of Vite-prefixed variables.
4. Add `.env`, `.env.local`, release credential files, signing keys, Firebase debug output, and emulator export data to `.gitignore` while committing `.env.example`.
5. Separate development CSP from production CSP. Replace production `csp: null` with an allowlist for the Tauri origin, Firebase Auth/API endpoints, the hosted auth bridge, Cloud Functions, and the configured HTTPS update origin. Do not allow `unsafe-eval` in production.
6. Add a build-time configuration check that produces a concise error before packaging when required beta configuration is missing.
7. Run configuration tests and a production build with a committed test-fixture-shaped set of non-secret public values supplied only to the command environment.

**Acceptance:** Production cannot build with missing or unsafe public configuration, and no privileged credential can be bundled through the supported environment interface.

## Task 3: Scaffold the Firebase Project and Emulator Suite

**Files:**

- Create `firebase.json` and `.firebaserc` after the new project ID is allocated.
- Create `firestore.rules`, `firestore.indexes.json`, and `storage.rules`.
- Create `functions/package.json`, `functions/package-lock.json`, `functions/tsconfig.json`, and `functions/src/index.ts`.
- Create `functions/src/config.ts` and `functions/src/config.test.ts`.
- Create `functions/test/rules.test.ts`.
- Modify root `package.json` and `package-lock.json`.

**Steps:**

1. Create a Firebase project with display name `DBStudio Beta`; record its actual globally unique project ID in `.firebaserc` under the `beta` alias. Enable billing because Cloud Functions and private Storage delivery require it.
2. Initialize Auth, Firestore, Storage, Functions using TypeScript on a currently supported Node runtime, Hosting, and local emulators.
3. Enable Google and email/password providers. Configure the generated Firebase domain and later the hosted auth domain as authorized domains.
4. Start with deny-all Firestore and Storage rules. Permit no direct feedback writes and no public release-artifact reads.
5. Add emulator scripts for Auth, Functions, Firestore, and Storage and a deterministic `emulators:exec` test command.
6. Test that signed-out and signed-in client SDK contexts cannot read feedback, cannot write feedback directly, cannot read private artifacts, and cannot modify release records.
7. Add Functions configuration validation for allowed origin, Functions region, Storage bucket, update signing metadata, and maximum upload size.
8. Run Functions unit tests and emulator rule tests.

**Acceptance:** The new Firebase project exists, local emulators run from one command, and rules deny all direct access that must pass through Functions.

## Task 4: Add the Optional Authentication Core

**Files:**

- Add the Firebase Web SDK to `package.json` and `package-lock.json`.
- Create `src/platform/firebaseClient.ts`.
- Create `src/platform/auth.ts` and `src/platform/auth.test.ts`.
- Create `src/state/authStore.ts` and `src/state/authStore.test.ts`.
- Create `src/components/AccountMenu.tsx` and `src/components/AccountMenu.test.tsx`.
- Create `src/components/AuthDialog.tsx` and `src/components/AuthDialog.test.tsx`.
- Modify `src/components/Toolbar.tsx`, `src/App.tsx`, and `src/styles.css`.

**Steps:**

1. Write tests for signed-out startup, auth restoration, email/password sign-in, password reset, cancellation, provider errors, sign-out, and local editing while auth is unavailable.
2. Initialize Firebase lazily so missing network access never blocks `App` initialization or example/workspace loading.
3. Use Firebase Auth's observer as the single source of account state. Persist the session using Firebase's local browser persistence for the isolated Tauri application origin; never log tokens or put them into Zustand dev output.
4. Implement email/password sign-in and password reset directly through Firebase Auth.
5. Add account and dialog components with accessible labels, focus containment, busy states, and normalized user-facing errors.
6. Keep account state out of `uiStore` and all `src/domain` modules. The auth store exposes only status, basic display profile, and actions.
7. Mount authentication UI in `App` without changing document load, edit, or save gates.
8. Run focused auth/component tests, the full frontend suite, and production build.

**Acceptance:** Users can use all existing local functionality signed out, and email/password auth can fail or go offline without affecting the workspace.

## Task 5: Implement Cross-Platform Google Sign-In

**Files:**

- Add Tauri deep-link, opener, and single-instance dependencies to `package.json`, `src-tauri/Cargo.toml`, and lockfiles.
- Modify `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, and `src-tauri/capabilities/default.json`.
- Create `src/platform/authCallback.ts` and `src/platform/authCallback.test.ts`.
- Create `functions/src/auth/startDesktopAuth.ts`.
- Create `functions/src/auth/exchangeDesktopAuth.ts` and associated tests.
- Create `hosting/desktop-auth.html` and `hosting/desktop-auth.ts`.
- Modify `firebase.json` and `src/platform/auth.ts`.

**Steps:**

1. Test state validation, expiration, replay rejection, callback scheme/path rejection, and cold-start versus already-running callback delivery.
2. Register the static `dbstudio://auth/callback` desktop scheme. Initialize the single-instance plugin before the deep-link plugin so Windows and Linux forward callbacks to the existing process.
3. Generate a high-entropy state and verifier in the desktop app, send only the verifier challenge to the hosted bridge, and open the bridge in the system browser.
4. Complete Google sign-in on Firebase Hosting. After Firebase authenticates the browser user, create a one-time, short-lived exchange record bound to the state and verifier challenge.
5. Redirect only the opaque code and state through the deep link. Never place a Firebase ID token, refresh token, or custom token in the callback URL.
6. Validate the scheme, host, path, state, and age in the desktop app, then exchange the code plus verifier through the Function. Delete or mark the code consumed transactionally before returning a Firebase custom token.
7. Call `signInWithCustomToken` in the desktop Firebase client and clear pending state on success, cancellation, timeout, or error.
8. Configure authorized domains and the Firebase OAuth handler URL for the hosted bridge.
9. Run browser bridge tests, Function tests, desktop callback tests, and manual Google sign-in smoke tests on all three platforms.

**Acceptance:** Google auth works through the system browser, fake or replayed deep links are rejected, and only opaque one-time data appears in callback URLs.

## Task 6: Build Diagnostic Redaction and Feedback UI

**Files:**

- Create `src/platform/diagnostics.ts` and `src/platform/diagnostics.test.ts`.
- Create `src/platform/feedback.ts` and `src/platform/feedback.test.ts`.
- Create `src/components/FeedbackDialog.tsx` and `src/components/FeedbackDialog.test.tsx`.
- Create `src/components/ReleaseMenu.tsx` and `src/components/ReleaseMenu.test.tsx`.
- Modify `src/App.tsx`, `src/components/Toolbar.tsx`, and `src/styles.css`.

**Steps:**

1. Write redaction tests containing SQL text, Unix and Windows paths, database URLs, emails embedded in connection strings, access tokens, passwords, and environment-like key/value pairs. Assert none survive diagnostics generation.
2. Limit diagnostics to version, release channel, OS, architecture, desktop/browser mode, and at most 20 safe categorized errors. Do not collect arbitrary exception objects.
3. Add feedback types for category, message, optional contact email, optional PNG/JPEG screenshot, diagnostic consent, and diagnostic preview.
4. Validate message length, screenshot MIME type, and 5 MB encoded size before submission.
5. Add a release menu containing **Send feedback**, **Check for updates**, account actions, and the full beta version.
6. Require explicit submit and show exactly what will be sent. Do not silently retry a submission after the user closes the dialog.
7. Submit through the feedback Function with an optional Firebase ID token; anonymous submission remains valid.
8. Run diagnostic, transport, and component tests.

**Acceptance:** Feedback is understandable and voluntary, and the client cannot include project contents, paths, connection details, or credentials in generated diagnostics.

## Task 7: Implement the Feedback Service

**Files:**

- Create `functions/src/feedback/schema.ts` and tests.
- Create `functions/src/feedback/submitFeedback.ts` and tests.
- Create `functions/src/feedback/rateLimit.ts` and tests.
- Modify `functions/src/index.ts`, `firestore.rules`, `storage.rules`, and `firebase.json`.

**Steps:**

1. Add failing tests for malformed payloads, oversized screenshots, disallowed MIME types, extra fields, anonymous submission, authenticated UID attachment, rate limits, and safe error responses.
2. Implement an HTTPS Function with strict CORS, method checks, body-size limits, JSON schema validation, and server-generated IDs/timestamps.
3. Verify an optional Firebase ID token when present, but do not require it.
4. Rate-limit by a server-derived request fingerprint and a random per-install identifier. Hash rate-limit keys before persistence and expire buckets automatically. Treat client-forwarded IP headers as untrusted.
5. Decode and validate screenshots, store them under a non-enumerable private object path, and store only its object identifier in Firestore.
6. Store feedback bodies in a collection inaccessible to client SDK rules. Return only submission ID and success state.
7. Ensure logs contain outcome and internal request ID, not message bodies, contact emails, screenshots, auth tokens, or diagnostics.
8. Run Function tests and emulator integration tests for anonymous and authenticated submissions.

**Acceptance:** Anonymous and authenticated feedback work through the Function, direct database/storage access remains denied, and abuse controls fail closed without leaking submitted content.

## Task 8: Add Pure Update Policy and State

**Files:**

- Create `src/platform/updatePolicy.ts` and `src/platform/updatePolicy.test.ts`.
- Create `src/state/updateStore.ts` and `src/state/updateStore.test.ts`.
- Create `src/components/UpdateDialog.tsx` and `src/components/UpdateDialog.test.tsx`.
- Modify `src/components/ReleaseMenu.tsx`, `src/App.tsx`, and `src/styles.css`.

**Steps:**

1. Test SemVer prerelease comparisons, stable/beta channel rejection, downgrade rejection, minimum-supported logic, 24-hour deferral, six-hour periodic checks, manual-check bypass of deferral, malformed custom metadata, and platform mismatch.
2. Model update state as idle, checking, available, deferred, downloading, ready, installing, failed, and mandatory. Keep raw plugin resources outside serializable Zustand state.
3. Read `mandatory` and `minimumSupportedVersion` only from validated custom updater metadata. Treat unknown fields as non-mandatory.
4. Build the update dialog with notes, size, progress, **Install now**, **Later**, retry, and exit behavior.
5. Add a strict unsaved-work gate. If `history.past` is non-empty, installation cannot begin; offer Save, Export, or Cancel first. A mandatory update may block further editing only after existing unsaved work has been preserved or explicitly discarded by the user.
6. Persist only the deferred version and timestamp locally; do not persist signed download URLs.
7. Run policy, store, and component tests.

**Acceptance:** Update decisions are deterministic and testable without Tauri or Firebase, and no update path can terminate the app while document changes remain unsaved.

## Task 9: Integrate the Signed Tauri Updater

**Files:**

- Add Tauri updater and process dependencies to `package.json`, `src-tauri/Cargo.toml`, and lockfiles.
- Modify `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, and `src-tauri/capabilities/default.json`.
- Create `src/platform/updater.ts` and `src/platform/updater.test.ts`.
- Modify `src/App.tsx` and `src/state/updateStore.ts`.

**Steps:**

1. Configure `bundle.createUpdaterArtifacts: true`, embed the updater public key, and set the dynamic HTTPS endpoint with Tauri's `{{target}}`, `{{arch}}`, and `{{current_version}}` variables plus the fixed beta channel.
2. Grant only updater check/download/install, process restart, deep-link, and external URL permissions required by the UI.
3. Initialize the updater plugin for desktop targets. Keep `allowDowngrades` false.
4. Wrap `check()` and `downloadAndInstall()` behind a small adapter. Map download events to progress without exposing raw URLs or plugin objects.
5. Use a finite timeout for checks and downloads. Treat a `null` check result as current, not as an error.
6. Before installation on Windows, recheck the unsaved-work gate because the updater automatically quits before running the installer.
7. Check once after the initial workspace renders, every six hours while running, and on explicit user request. Browser preview returns a supported `unavailable` result rather than throwing.
8. Test the adapter with a fake plugin boundary, then manually verify a locally hosted signed update from one beta version to the next on each platform.

**Acceptance:** Signed updates install and restart through the official Tauri path, invalid signatures fail, and the existing version remains usable after check/download/install errors.

## Task 10: Implement Release Metadata and Private Artifact Delivery

**Files:**

- Create `functions/src/releases/schema.ts` and tests.
- Create `functions/src/releases/checkUpdate.ts` and tests.
- Create `functions/src/releases/createDownload.ts` and tests.
- Create `functions/src/releases/promoteRelease.ts` and tests.
- Modify `functions/src/index.ts`, `firestore.rules`, and `storage.rules`.
- Create `scripts/build-release-record.mjs` and tests.

**Steps:**

1. Define Firestore release records with channel, SemVer, publication state, mandatory flag, minimum supported version, notes, publication time, and required target records for `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64`, and `linux-x86_64`.
2. For each target require Storage object ID, byte size, SHA-256 checksum, and the literal contents of the Tauri `.sig` file.
3. Test current-version, newer-version, prerelease ordering, unknown target, missing artifact, unpublished record, disabled release, malformed signature, and short-lived URL expiry paths.
4. Implement the public HTTPS check endpoint. Read the active beta pointer, validate the full record, and return `204` when no compatible newer release exists or Tauri's dynamic JSON shape when one does.
5. Generate a download URL with the shortest practical lifetime sufficient for the configured update timeout. Do not store permanent public URLs.
6. Rate-limit check and download issuance without requiring Firebase sign-in. The endpoint is intentionally discoverable; privacy comes from private Storage objects and short URL lifetime, not from treating the endpoint address as a secret.
7. Implement an authenticated operator-only promotion path that verifies every required Storage object, size, checksum, and signature before transactionally changing the active beta pointer.
8. Add a script that converts native build output into a validated unpublished release record and refuses partial target inventories.
9. Run Function and emulator tests.

**Acceptance:** Unauthenticated update checks work, Storage objects have no permanent public URL, and an incomplete or inconsistent release cannot become active.

## Task 11: Configure Cross-Platform Bundles and Signing

**Files:**

- Modify `src-tauri/tauri.conf.json`.
- Modify platform entitlement/configuration files generated under `src-tauri` only when required.
- Create `docs/release/signing.md`.
- Create `scripts/verify-artifacts.mjs` and tests.

**Steps:**

1. Configure DMG and updater tarball output for both macOS architectures, NSIS for Windows x64, and AppImage plus DEB for Linux x64.
2. Choose Windows updater install mode deliberately; use `passive` so installation supplies progress while avoiding an uncontrolled fully interactive installer.
3. Generate the Tauri updater key pair outside the repository. Store the public key in Tauri config and the private key/password only in CI secrets.
4. Document Apple Developer ID signing/notarization, Windows code-signing certificate handling, and Linux artifact signing/checksum expectations.
5. Add artifact verification for target name, version, expected extension, nonzero size, checksum, and matching `.sig` content.
6. Build unsigned local artifacts for structural validation, then signed CI artifacts for promotion.

**Acceptance:** Each supported target produces a fresh installer plus the exact updater artifact/signature expected by the release service.

## Task 12: Add CI Verification and Private Beta Publishing

**Files:**

- Create `.github/workflows/ci.yml`.
- Create `.github/workflows/beta-release.yml`.
- Create `.github/actions/setup-project/action.yml` if duplication justifies it.
- Create `scripts/publish-beta.mjs` and tests.
- Modify `package.json` and `package-lock.json`.

**Steps:**

1. Add CI jobs for version synchronization, frontend tests/build, Rust tests, Functions tests, and Firebase emulator rules tests.
2. Add native packaging jobs on macOS, Windows, and Linux. Use separate macOS matrix entries for Apple Silicon and Intel or an explicitly verified cross-build where native signing permits it.
3. Require a manually dispatched beta version matching repository metadata. Reject branch builds and mismatched versions from publishing.
4. Provide signing and Firebase credentials only to protected release jobs/environments. Do not expose secrets to pull-request builds or shell tracing.
5. Upload native outputs as temporary CI artifacts, aggregate and verify the complete four-target updater inventory, then upload to versioned private Firebase Storage paths.
6. Create an unpublished Firestore release record. Require protected manual approval before calling the promotion path.
7. Prevent concurrent promotions and make retries idempotent by version and checksum.
8. Run the CI workflow on a non-publishing branch, then perform a dry-run release with Firebase emulators or a separate staging Firebase project before production beta promotion.

**Acceptance:** Normal CI cannot publish, protected release jobs cannot publish partial inventories, and rerunning a successful upload does not corrupt release state.

## Task 13: Add Release, Privacy, and Rollback Documentation

**Files:**

- Rewrite `README.md` release sections.
- Create `PRIVACY.md`.
- Create `docs/release/firebase-setup.md`.
- Create `docs/release/beta-checklist.md`.
- Create `docs/release/rollback.md`.
- Create `docs/release/known-limitations.md`.
- Create `CHANGELOG.md`.

**Steps:**

1. Replace sample language with an accurate beta product description and supported-platform/install instructions.
2. Document optional accounts, data fields stored by Auth, feedback fields, screenshot handling, diagnostic redaction, retention/deletion policy, and the explicit statement that project SQL is not included.
3. Document Firebase project creation, billing, providers, authorized domains, Functions region, Hosting deployment, emulator usage, rules deployment, CI secret names, and least-privilege service accounts.
4. Document updater signing-key custody, native signing prerequisites, release-record creation, smoke-test evidence, manual promotion, mandatory-update approval, and emergency rollback.
5. Document uninstall behavior and known beta limitations. State that rollback changes the offered release and does not silently downgrade installed clients.
6. Add a `0.1.0-beta.1` changelog entry generated from actual implemented scope, not planned scope.
7. Review all commands from a clean checkout and correct stale paths or assumptions.

**Acceptance:** A new operator can configure staging, run verification, publish a beta, and roll back the active release without undocumented knowledge.

## Task 14: Perform Release-Candidate Verification

**Files:**

- Update `docs/release/beta-checklist.md` with evidence links or artifact IDs.
- Update `docs/release/known-limitations.md` with observed issues.
- Update `CHANGELOG.md` if verification changes shipped scope.

**Steps:**

1. Run `npm ci`, version/config checks, all frontend tests, production build, Rust tests, Functions tests, and emulator rules tests from a clean checkout.
2. Scan tracked files and built frontend assets for service-account material, private keys, tokens, passwords, local absolute paths, and unintended environment values.
3. Install the release candidate on clean macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64 systems.
4. Verify signed-out local editing, email/password auth, password reset, Google system-browser auth, sign-out, anonymous feedback, authenticated feedback, diagnostic preview/redaction, and screenshot limits.
5. Install the previous beta on each target, create unsaved work, offer the release candidate, confirm installation is blocked until work is preserved, then complete the signed in-place update and restart.
6. Confirm tampered packages, expired URLs, wrong-target manifests, missing artifacts, downgraded versions, offline checks, and interrupted downloads fail safely.
7. Verify a normal deferral lasts 24 hours, manual checks bypass deferral, and mandatory behavior provides save/export, retry, and exit without data loss.
8. Promote only after all target evidence is complete. If any promoted release is faulty, disable its mandatory flag and point the active beta record back to the previous valid version.

**Acceptance:** Every criterion in the approved design is evidenced on all supported targets, and the active release can be rolled back without changing client binaries.

## Verification Commands

The implementation should converge on these repository-level commands:

```sh
npm run check:version
npm test
npm run build
npm run test:functions
npm run test:firebase
cd src-tauri && cargo test
```

Native bundle and publication commands run only in protected release jobs because they require updater, platform-signing, and Firebase administrative credentials.

## Current Official Constraints Used by This Plan

- Tauri's updater supports dynamic HTTPS endpoints using target, architecture, and current-version variables; its response requires version, URL, and literal signature content.
- Tauri creates signed updater artifacts when `bundle.createUpdaterArtifacts` is enabled and signing key environment variables are supplied at build time.
- Windows update installation exits the application, so the save-before-install gate must be checked immediately before installation.
- Windows and Linux deep links open a new process unless the single-instance plugin forwards them; deep-link inputs must still be validated as attacker-controlled.
- Firebase Google auth supports a hosted redirect domain and sign-in from a Google ID token/custom credential flow.
- Firestore client requests are governed by Security Rules, while Admin SDK access in Functions bypasses those rules and therefore requires least-privilege IAM and Function-side validation.

## References

- [Tauri updater documentation](https://v2.tauri.app/plugin/updater/)
- [Tauri updater JavaScript API](https://v2.tauri.app/reference/javascript/updater/)
- [Tauri deep-link documentation](https://v2.tauri.app/plugin/deep-linking/)
- [Firebase Google authentication](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase redirect sign-in guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices)
- [Firebase Functions emulator](https://firebase.google.com/docs/functions/local-emulator)
- [Firestore Security Rules testing](https://firebase.google.com/docs/firestore/security/test-rules-emulator)
