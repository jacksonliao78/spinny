import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppScreen } from "../constants";
import type { SessionController } from "../session";

type LandingScreenOptions = {
  soloButton: HTMLButtonElement;
  authButton: HTMLButtonElement;
  signOutButton: HTMLButtonElement;
  authSummaryText: HTMLElement;
  settingsButton: HTMLButtonElement;
  statsButton: HTMLButtonElement;
  supabase: SupabaseClient | null;
  session: SessionController;
  navigate: (screen: AppScreen) => void;
  openAuthLogin: () => void;
};

const initLandingScreen = ({
  soloButton,
  authButton,
  signOutButton,
  authSummaryText,
  settingsButton,
  statsButton,
  supabase,
  session,
  navigate,
  openAuthLogin,
}: LandingScreenOptions): void => {
  authButton.addEventListener("click", openAuthLogin);
  soloButton.addEventListener("click", () => navigate("setup"));
  statsButton.addEventListener("click", () => navigate("stats"));
  settingsButton.addEventListener("click", () => navigate("settings"));

  signOutButton.addEventListener("click", () => {
    if (!supabase) {
      void session.syncAuthState(null);
      return;
    }

    const signOut = async (): Promise<void> => {
      signOutButton.disabled = true;
      const { error } = await supabase.auth.signOut();
      if (error) {
        authSummaryText.textContent = error.message;
      } else {
        await session.syncAuthState(null);
      }
      signOutButton.disabled = false;
    };

    void signOut();
  });
};

export { initLandingScreen };
