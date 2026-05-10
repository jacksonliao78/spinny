import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppScreen } from "../constants";
import { buildPlayerStatsViewModel, type PlayerBest, type PlayerStat, type SavedRunRow } from "../playerStats";
import type { SessionController } from "../session";

type StatsScreenOptions = {
  statsBackButton: HTMLButtonElement;
  statsSignInButton: HTMLButtonElement;
  statsSetupButton: HTMLButtonElement;
  statsStatus: HTMLElement;
  statsContent: HTMLElement;
  statsAccount: HTMLElement;
  statsHeadline: HTMLElement;
  statsBests: HTMLElement;
  statsActivity: HTMLElement;
  statsEmpty: HTMLElement;
  supabase: SupabaseClient | null;
  session: SessionController;
  navigate: (screen: AppScreen) => void;
  openAuthLogin: () => void;
};

type StatsScreen = {
  enter: () => void;
};

const RUN_STATS_SELECT = [
  "mode",
  "score",
  "lines",
  "level",
  "duration_ms",
  "board_type",
  "pieces",
  "holds",
  "hard_drop_cells",
  "soft_drop_cells",
  "max_combo",
  "quads",
  "tspin_minis",
  "tspin_singles",
  "tspin_doubles",
  "tspin_triples",
  "allspins",
].join(",");

const renderStats = (container: HTMLElement, stats: PlayerStat[]): void => {
  container.replaceChildren(
    ...stats.map((stat) => {
      const item = document.createElement("div");
      item.className = "stats-card";
      const label = document.createElement("dt");
      const value = document.createElement("dd");
      label.textContent = stat.label;
      value.textContent = stat.value;
      item.append(label, value);
      return item;
    }),
  );
};

const renderBests = (container: HTMLElement, bests: PlayerBest[]): void => {
  container.replaceChildren(
    ...bests.map((best) => {
      const item = document.createElement("div");
      item.className = "stats-best";
      const label = document.createElement("dt");
      const value = document.createElement("dd");
      const detail = document.createElement("span");
      label.textContent = best.label;
      value.textContent = best.value;
      detail.textContent = best.detail;
      item.append(label, value, detail);
      return item;
    }),
  );
};

const initStatsScreen = ({
  statsBackButton,
  statsSignInButton,
  statsSetupButton,
  statsStatus,
  statsContent,
  statsAccount,
  statsHeadline,
  statsBests,
  statsActivity,
  statsEmpty,
  supabase,
  session,
  navigate,
  openAuthLogin,
}: StatsScreenOptions): StatsScreen => {
  let loadEpoch = 0;

  const setStatus = (message: string, kind = ""): void => {
    statsStatus.textContent = message;
    statsStatus.dataset.kind = kind;
  };

  const showSignedOut = (): void => {
    statsContent.hidden = true;
    statsEmpty.hidden = true;
    statsSignInButton.hidden = false;
    statsSetupButton.hidden = true;
    setStatus("Sign in to see saved run stats.", "empty");
  };

  const enter = (): void => {
    const user = session.getCurrentUser();
    const myEpoch = ++loadEpoch;

    statsContent.hidden = true;
    statsEmpty.hidden = true;
    statsSignInButton.hidden = true;
    statsSetupButton.hidden = true;
    setStatus("", "");

    if (!user || session.isGuestMode()) {
      showSignedOut();
      return;
    }

    if (!supabase) {
      setStatus("Stats are unavailable because account services are not configured.", "error");
      return;
    }

    const load = async (): Promise<void> => {
      setStatus("Loading stats...", "");
      const { data, error } = await supabase.from("runs").select(RUN_STATS_SELECT).eq("user_id", user.id);
      if (myEpoch !== loadEpoch) return;

      if (error) {
        statsContent.hidden = true;
        setStatus(error.message || "Could not load stats.", "error");
        return;
      }

      const view = buildPlayerStatsViewModel(
        {
          username: session.getCurrentUsername(),
          email: user.email ?? null,
          createdAt: user.created_at ?? null,
        },
        (data ?? []) as SavedRunRow[],
      );

      renderStats(statsAccount, view.account);
      renderStats(statsHeadline, view.headline);
      renderBests(statsBests, view.bests);
      renderStats(statsActivity, view.activity);
      statsContent.hidden = false;
      statsEmpty.hidden = view.hasRuns;
      statsSetupButton.hidden = view.hasRuns;
      setStatus("", "");
    };

    void load();
  };

  statsBackButton.addEventListener("click", () => navigate("landing"));
  statsSignInButton.addEventListener("click", openAuthLogin);
  statsSetupButton.addEventListener("click", () => navigate("setup"));

  return { enter };
};

export { initStatsScreen };
export type { StatsScreen };
