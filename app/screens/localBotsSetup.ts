import type { AppScreen } from "../constants";

type LocalBotsSetupScreenOptions = {
  backButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  ppsSlider: HTMLInputElement;
  ppsValue: HTMLElement;
  navigate: (screen: AppScreen) => void;
  startMatch: () => void;
  setTargetPps: (pps: number) => void;
};

const initLocalBotsSetupScreen = ({
  backButton,
  startButton,
  ppsSlider,
  ppsValue,
  navigate,
  startMatch,
  setTargetPps,
}: LocalBotsSetupScreenOptions): void => {
  const syncPps = (): void => {
    const pps = Number(ppsSlider.value);
    setTargetPps(pps);
    ppsValue.textContent = pps.toFixed(1);
  };

  syncPps();
  backButton.addEventListener("click", () => navigate("multiplayer"));
  startButton.addEventListener("click", startMatch);
  ppsSlider.addEventListener("input", syncPps);
};

export { initLocalBotsSetupScreen };
