import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { User } from "firebase/auth";
import { ProfileMenu } from "./ProfileMenu";

afterEach(cleanup);

function user(overrides: Partial<User>): User {
  return {
    displayName: null,
    email: null,
    isAnonymous: false,
    uid: "user-1",
    ...overrides,
  } as User;
}

function renderProfile(overrides: Partial<ComponentProps<typeof ProfileMenu>> = {}) {
  return render(<ProfileMenu
    user={null}
    signingIn={false}
    onSignIn={vi.fn()}
    onSignOut={vi.fn()}
    onFeedback={vi.fn()}
    onBetaNotes={vi.fn()}
    onCopyDiagnostics={vi.fn()}
    {...overrides}
  />);
}

describe("ProfileMenu", () => {
  it("shows sign in for signed-out users", () => {
    const onSignIn = vi.fn();
    const view = renderProfile({ onSignIn });
    fireEvent.click(view.getByLabelText("Sign in"));
    expect(view.getByText("Signed out")).toBeInTheDocument();
    fireEvent.click(view.getByText("Sign in with other account"));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("labels anonymous Firebase sessions without implying a full account", () => {
    const view = renderProfile({ user: user({ isAnonymous: true }) });
    fireEvent.click(view.getByLabelText("Anonymous session"));
    expect(view.getByText("Anonymous session")).toBeInTheDocument();
    expect(view.getByText("Private beta feedback identity")).toBeInTheDocument();
    expect(view.getAllByText("A")).toHaveLength(2);
    expect(view.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("offers account switching and sign out for signed-in users", () => {
    const onSignIn = vi.fn();
    const onSignOut = vi.fn();
    const view = renderProfile({ user: user({ displayName: "Chris Green", email: "chris@example.com" }), onSignIn, onSignOut });
    fireEvent.click(view.getByLabelText("Account"));
    fireEvent.click(view.getByText("Switch account"));
    expect(onSignIn).toHaveBeenCalledOnce();
    fireEvent.click(view.getByLabelText("Account"));
    fireEvent.click(view.getByText("Sign out"));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("exposes beta release support actions", () => {
    const onFeedback = vi.fn();
    const onBetaNotes = vi.fn();
    const onCopyDiagnostics = vi.fn();
    const view = renderProfile({ onFeedback, onBetaNotes, onCopyDiagnostics });

    fireEvent.click(view.getByLabelText("Sign in"));
    fireEvent.click(view.getByText("Send feedback"));
    expect(onFeedback).toHaveBeenCalledOnce();

    fireEvent.click(view.getByLabelText("Sign in"));
    fireEvent.click(view.getByText("Beta notes"));
    expect(onBetaNotes).toHaveBeenCalledOnce();

    fireEvent.click(view.getByLabelText("Sign in"));
    fireEvent.click(view.getByText("Copy diagnostics"));
    expect(onCopyDiagnostics).toHaveBeenCalledOnce();
  });
});
