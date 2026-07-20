# Desktop Google Auth Bridge Design

## Goal

Replace direct Google popup sign-in inside the Tauri webview with a desktop-safe browser handoff. Anonymous Firebase auth continues to work inside DBStudio for feedback and rate limiting.

## Problem

Firebase Google `signInWithPopup` is fragile in desktop webviews and currently fails with `auth/internal-error`. The Firebase project providers and authorized domains are enabled, so the app should stop treating this as a console setup issue and use a desktop auth flow.

## Behavior

- The profile menu keeps showing anonymous and signed-in states.
- "Sign in with other account" opens a hosted auth bridge URL in the system browser when DBStudio is running as a desktop app.
- If the hosted bridge URL is missing, DBStudio shows clear setup guidance instead of opening the broken popup flow.
- Browser preview may still use Firebase popup sign-in for development.
- Sign-out stays local through Firebase Auth.

## Desktop Flow

DBStudio creates a one-time state value and opens:

`<hostedAuthUrl>?state=<state>&redirect=dbstudio://auth/callback`

The hosted page completes Google sign-in through Firebase Hosting. The callback to DBStudio must include the same state and an opaque one-time exchange code. The callback must not contain Firebase ID tokens, refresh tokens, custom tokens, emails, names, or other sensitive account data.

This implementation adds the client-side boundary first. If the hosted exchange endpoint is not deployed yet, DBStudio reports that Google desktop sign-in needs the hosted auth bridge.

## Components

- `platform/firebaseClient`: owns Firebase auth, error copy, browser-preview popup sign-in, and hosted desktop auth URL creation.
- `platform/desktop`: exposes desktop/browser availability helpers.
- `App`: starts the auth handoff, stores pending state, and reports setup errors.
- Tauri config: grants only the external URL/deep-link permissions required once the plugins are available.

## Error Handling

Raw Firebase and Tauri errors are never shown to users. Missing hosted auth configuration says exactly what to configure. Failed callback validation says sign-in could not be completed and asks the user to retry.

## Testing

Unit tests cover hosted auth URL creation, missing configuration, browser-preview fallback, and user-facing auth error copy. Existing profile menu tests continue to cover visible states.
