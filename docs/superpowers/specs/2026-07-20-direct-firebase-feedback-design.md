# Direct Firebase Feedback — Beta Design

## Goal

Enable the existing in-app feedback form for the current beta without Cloud Functions or Blaze billing. Users do not see a sign-in flow. The client uses Firebase Anonymous Authentication and writes validated text feedback directly to Firestore. Screenshot collection is intentionally excluded from this beta.

This is an interim beta design. A later release replaces direct writes and best-effort rate limiting with a server-controlled endpoint.

## User Experience

The top toolbar contains a visible **Feedback** button. Its dialog collects a category, message, optional contact email, and optional privacy-safe diagnostics preview. Submission is explicit. The form states that SQL, paths, database details, passwords, and tokens are excluded.

Firebase authentication happens invisibly. Local editing and application startup remain available if Firebase is unavailable. Successful submission shows confirmation; validation, network, rate-limit, and configuration errors remain in the dialog with retry guidance.

## Client Architecture and Data Flow

The feedback transport lazily initializes Firebase and restores or creates an anonymous identity. It validates the payload locally, then creates the Firestore feedback record and rate-limit update atomically.

Each feedback record contains only category, message, optional contact email, allowlisted diagnostics, anonymous owner UID, and a server timestamp. The app never queries feedback records.

## Rate Limiting

The client maintains one Firestore rate document per anonymous UID. A transaction permits five submissions during a rolling one-hour window, increments the counter with the feedback creation, and resets the window after one hour. Firestore rules require ownership, bounded counters, timestamp constraints, and an atomic rate-document change for feedback creation.

This is best-effort abuse resistance, not a security-grade global limit. A determined client can obtain a new anonymous identity, and Firestore rules cannot enforce an IP-based limit. The UI and documentation must not claim otherwise. The next release moves rate limiting to a trusted Cloud Function.

## Firestore Rules

Clients may create feedback only when authenticated anonymously and only with the exact allowlisted schema and size limits. Reads, updates, and deletes are denied.

Rate-limit documents are private to their anonymous owner. Rules allow only the bounded create/update shapes needed by the transaction and deny reads through ordinary queries; the authenticated owner may read its single rate document to execute the transaction.

## Testing and Release

Tests cover client validation, anonymous initialization, rate-limit transaction decisions, direct Firestore payload shape, and failure states. Rule verification covers forbidden reads, malformed writes, cross-user access, and rate counter bounds.

Deployment requires Firestore and Anonymous Authentication to be initialized in `mydb-studio`; Cloud Storage remains closed and unused. The macOS bundle is rebuilt and installed only after frontend tests, backend-independent tests, and rule compilation pass.

## Accepted Limitation

Anonymous identity rotation can bypass the rate limit. This exception is accepted only for the current private beta. Direct Firestore writes will be removed when the trusted feedback endpoint ships in the next release.
