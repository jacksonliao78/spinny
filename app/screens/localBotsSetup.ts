import type { BoardKind } from "@game/board/factory";
import type { AppScreen } from "../constants";

type LocalBotsSetupScreenOptions = {
  backButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  spinnyToggleButton: HTMLButtonElement;
  initialSpinnyOn: boolean;
  navigate: (screen: AppScreen) => void;
  setSelectedBoard: (board: BoardKind) => void;
  startMatch: () => void;
};

const renderSpinnyToggle = (button: HTMLButtonElement, on: boolean): void => {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("board-toggle--on", on);
};

const initLocalBotsSetupScreen = ({
  backButton,
  startButton,
  spinnyToggleButton,
  initialSpinnyOn,
  navigate,
  setSelectedBoard,
  startMatch,
}: LocalBotsSetupScreenOptions): void => {
  backButton.addEventListener("click", () => navigate("landing"));
  startButton.addEventListener("click", startMatch);

  let spinnyOn = initialSpinnyOn;
  renderSpinnyToggle(spinnyToggleButton, spinnyOn);
  setSelectedBoard(spinnyOn ? "ring" : "rectangular");

  spinnyToggleButton.addEventListener("click", () => {
    spinnyOn = !spinnyOn;
    renderSpinnyToggle(spinnyToggleButton, spinnyOn);
    setSelectedBoard(spinnyOn ? "ring" : "rectangular");
  });
};

export { initLocalBotsSetupScreen };
