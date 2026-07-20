# Primary Toolbar Profile Auth Design

## Goal

Add a compact profile/auth control to the top-right of the primary toolbar. The control should make account state visible without interrupting the beta workflow.

## Behavior

- Signed out: show a profile icon button with the title "Sign in".
- Anonymous Firebase user: show an anonymous profile icon, label the menu as "Anonymous session", and offer "Sign in with other account".
- Signed-in Firebase user: show account initials when available, show email/name in the menu, and offer account switching and sign out.

Anonymous auth remains useful for private feedback ownership and rate limiting. It must not imply that the user has created a full DBStudio account.

## UI Placement

The profile control sits at the far right of the primary toolbar, after update and feedback. It uses the existing toolbar visual language: compact icon button, quiet border, dark surface, and hover state. The menu opens below the button and stays small enough to avoid covering the canvas.

## Components

- `ProfileMenu`: renders the toolbar button and popover menu.
- Firebase auth helper functions: expose current auth state, anonymous sign-in, Google sign-in, and sign-out.
- `App`: subscribes to auth state and passes account data/actions to the toolbar.

## Data Flow

The app initializes Firebase Auth once. On mount, it subscribes to auth changes. If there is no user, the toolbar shows signed out. Feedback can still trigger anonymous auth through the existing feedback path. When the user chooses "Sign in with other account", the app starts a Firebase popup sign-in flow.

## Error Handling

Sign-in and sign-out failures should set the existing status/fatal error surfaces rather than introducing a new notification system. The menu remains usable after a failed attempt.

## Testing

Add focused component tests for anonymous and signed-in toolbar states. Run the existing build/test suite after implementation.
