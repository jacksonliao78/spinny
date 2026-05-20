import type { AppScreen } from "../constants";

type LocalBotsSetupScreenOptions = {
  backButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  navigate: (screen: AppScreen) => void;
  startMatch: () => void;
};

const initLocalBotsSetupScreen = ({
  backButton,
  startButton,
  navigate,
  startMatch,
}: LocalBotsSetupScreenOptions): void => {
  backButton.addEventListener("click", () => navigate("multiplayer"));
  startButton.addEventListener("click", startMatch);
};

export { initLocalBotsSetupScreen };
