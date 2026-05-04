import type { SupabaseClient, User } from "@supabase/supabase-js";
import { clearPendingSignupUsername } from "./auth/username";
import { getSignupUsernameCandidate, loadProfileUsername, saveProfileUsername } from "./auth/profile";

type SessionUi = {
  authSummaryText: HTMLElement;
  authButton: HTMLButtonElement;
  signOutButton: HTMLButtonElement;
};

type SessionController = {
  getCurrentUser: () => User | null;
  getCurrentUsername: () => string | null;
  isGuestMode: () => boolean;
  setGuestMode: (next: boolean) => void;
  refreshAuthSummary: () => void;
  syncAuthState: (user: User | null) => Promise<void>;
};

type SessionControllerOptions = {
  supabase: SupabaseClient | null;
  ui: SessionUi;
};

const createSessionController = ({ supabase, ui }: SessionControllerOptions): SessionController => {
  let currentUser: User | null = null;
  let currentUsername: string | null = null;
  let guestMode = true;
  let authSyncEpoch = 0;

  const refreshAuthSummary = (): void => {
    if (currentUser) {
      const label = currentUsername ?? currentUser.email ?? "player";
      ui.authSummaryText.textContent = `Signed in as ${label}`;
      ui.authButton.hidden = true;
      ui.signOutButton.hidden = false;
    } else {
      ui.authSummaryText.textContent = guestMode ? "Playing as guest" : "Not signed in";
      ui.authButton.hidden = false;
      ui.signOutButton.hidden = true;
    }
  };

  const syncAuthState = async (user: User | null): Promise<void> => {
    const myEpoch = ++authSyncEpoch;

    currentUser = user;
    guestMode = !user;
    if (!user) {
      currentUsername = null;
      refreshAuthSummary();
      return;
    }

    refreshAuthSummary();

    if (!supabase) {
      currentUsername = null;
      if (myEpoch !== authSyncEpoch) return;
      refreshAuthSummary();
      return;
    }

    let nextUsername = await loadProfileUsername(supabase, user.id);
    if (myEpoch !== authSyncEpoch) return;

    if (!nextUsername) {
      const username = getSignupUsernameCandidate(user);
      if (username) {
        try {
          await saveProfileUsername(supabase, user.id, username);
          nextUsername = username;
          clearPendingSignupUsername();
        } catch (error) {
          console.warn("Could not create profile after login", error);
        }
        if (myEpoch !== authSyncEpoch) return;
      }
    }

    currentUsername = nextUsername ?? null;
    refreshAuthSummary();
  };

  return {
    getCurrentUser: () => currentUser,
    getCurrentUsername: () => currentUsername,
    isGuestMode: () => guestMode,
    setGuestMode: (next) => {
      guestMode = next;
      refreshAuthSummary();
    },
    refreshAuthSummary,
    syncAuthState,
  };
};

export { createSessionController };
export type { SessionController, SessionUi };
