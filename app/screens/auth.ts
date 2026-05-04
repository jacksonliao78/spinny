import type { SupabaseClient } from "@supabase/supabase-js";
import { isUsernameTakenError, readableAuthError } from "../auth/errors";
import { saveProfileUsername } from "../auth/profile";
import { clearPendingSignupUsername, normalizeUsername, savePendingSignupUsername } from "../auth/username";
import type { AppScreen, AuthMode } from "../constants";
import { USERNAME_PATTERN } from "../constants";
import type { SessionController } from "../session";

type AuthScreenOptions = {
  authBackButton: HTMLButtonElement;
  authHeading: HTMLElement;
  authForm: HTMLFormElement;
  authLoginTab: HTMLButtonElement;
  authSignupTab: HTMLButtonElement;
  authEmail: HTMLInputElement;
  authPassword: HTMLInputElement;
  authUsernameRow: HTMLLabelElement;
  authUsername: HTMLInputElement;
  authStatus: HTMLElement;
  authSubmitButton: HTMLButtonElement;
  guestPlayButton: HTMLButtonElement;
  supabase: SupabaseClient | null;
  session: SessionController;
  navigate: (screen: AppScreen) => void;
};

type AuthScreen = {
  openLogin: () => void;
  refreshAuthModeUi: () => void;
};

const initAuthScreen = ({
  authBackButton,
  authHeading,
  authForm,
  authLoginTab,
  authSignupTab,
  authEmail,
  authPassword,
  authUsernameRow,
  authUsername,
  authStatus,
  authSubmitButton,
  guestPlayButton,
  supabase,
  session,
  navigate,
}: AuthScreenOptions): AuthScreen => {
  let authMode: AuthMode = "login";

  const setAuthStatus = (message: string, kind: "info" | "error" = "info"): void => {
    authStatus.textContent = message;
    authStatus.dataset.kind = kind;
  };

  const setAuthPending = (pending: boolean): void => {
    authSubmitButton.disabled = pending;
    guestPlayButton.disabled = pending;
    authLoginTab.disabled = pending;
    authSignupTab.disabled = pending;
  };

  const refreshAuthModeUi = (): void => {
    const signingUp = authMode === "signup";
    authHeading.textContent = signingUp ? "Create Account" : "Sign In";
    authSubmitButton.textContent = signingUp ? "Create Account" : "Log In";
    authUsernameRow.hidden = !signingUp;
    authUsername.required = signingUp;
    authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    authLoginTab.classList.toggle("auth-tab--selected", !signingUp);
    authSignupTab.classList.toggle("auth-tab--selected", signingUp);
    authLoginTab.setAttribute("aria-selected", String(!signingUp));
    authSignupTab.setAttribute("aria-selected", String(signingUp));
    setAuthStatus("");
  };

  const openLogin = (): void => {
    authMode = "login";
    refreshAuthModeUi();
    navigate("auth");
    authEmail.focus();
  };

  authLoginTab.addEventListener("click", () => {
    authMode = "login";
    refreshAuthModeUi();
  });

  authSignupTab.addEventListener("click", () => {
    authMode = "signup";
    refreshAuthModeUi();
  });

  authBackButton.addEventListener("click", () => navigate("landing"));

  guestPlayButton.addEventListener("click", () => {
    session.setGuestMode(true);
    navigate("setup");
  });

  authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!supabase) {
      setAuthStatus("Supabase is not configured. Check .env.local and restart Vite.", "error");
      return;
    }

    const email = authEmail.value.trim();
    const password = authPassword.value;
    const username = normalizeUsername(authUsername.value);

    if (authMode === "signup" && !USERNAME_PATTERN.test(username)) {
      setAuthStatus("Username must be 3-24 characters: lowercase letters, numbers, or underscores.", "error");
      return;
    }

    const submit = async (): Promise<void> => {
      setAuthPending(true);
      setAuthStatus(authMode === "signup" ? "Creating account..." : "Signing in...");
      try {
        if (authMode === "login") {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          await session.syncAuthState(data.user);
          navigate("landing");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        });
        if (error) throw error;
        savePendingSignupUsername(email, username);
        if (!data.user) {
          setAuthStatus("Check your email to confirm your account, then log in.", "info");
          return;
        }
        if (!data.session) {
          setAuthStatus("Check your email to confirm your account. Your username will be saved when you log in.", "info");
          return;
        }

        try {
          await saveProfileUsername(supabase, data.user.id, username);
        } catch (profileError) {
          if (isUsernameTakenError(profileError)) {
            await supabase.auth.signOut();
            await session.syncAuthState(null);
          }
          throw profileError;
        }

        clearPendingSignupUsername();
        await session.syncAuthState(data.user);
        navigate("landing");
      } catch (error) {
        setAuthStatus(readableAuthError(error), "error");
      } finally {
        setAuthPending(false);
      }
    };

    void submit();
  });

  return {
    openLogin,
    refreshAuthModeUi,
  };
};

export { initAuthScreen };
export type { AuthScreen };
