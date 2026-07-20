# DBStudio beta updates

DBStudio checks the public `checkUpdate` endpoint after startup, every six hours, and when the toolbar update button is selected. The endpoint requires no user sign-in. Update artifacts remain private in Firebase Storage and are exposed only through short-lived signed download URLs.

## Signing keys

The updater public key is embedded in `src-tauri/tauri.conf.json`. The matching local private key and password are stored under the ignored `.release-keys/` folder.

Add these repository secrets before running the native release workflows:

- `TAURI_SIGNING_PRIVATE_KEY`: complete contents of `.release-keys/updater.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: complete contents of `.release-keys/updater-key.password`

Back up both values in the team's password manager. Losing either prevents existing installations from accepting future updates.

## Deploy the endpoint

From the repository root, deploy only the update endpoint:

```sh
npx firebase-tools deploy --only functions:checkUpdate --project mydb-studio
```

The Firebase project must have Firestore, Storage, and Cloud Functions enabled. The endpoint runs in `us-central1` to preserve the configured public URL.

## Active Firestore record

Create the document `releaseChannels/beta` only after all required signed artifacts are uploaded. Its data has this shape:

```json
{
  "channel": "beta",
  "version": "0.1.0-beta.2",
  "published": true,
  "mandatory": false,
  "minimumSupportedVersion": "0.1.0-beta.1",
  "notes": "Release notes shown inside DBStudio.",
  "publishedAt": "2026-07-20T12:00:00Z",
  "targets": {
    "darwin-aarch64": {
      "storagePath": "updates/beta/0.1.0-beta.2/darwin-aarch64/DBStudio.app.tar.gz",
      "signature": "complete contents of the matching .sig file",
      "size": 12345678
    },
    "darwin-x86_64": {},
    "windows-x86_64": {},
    "linux-x86_64": {}
  }
}
```

Every target uses the same three fields as `darwin-aarch64`. The Storage path must begin with `updates/beta/`. The signature is the literal file content, not a file path or URL.

Keep `published` false while uploading or validating artifacts. Set it to true only after clean-install and update smoke tests pass. For a bad release, set `published` false or restore the previous active record; DBStudio never accepts a downgrade.
