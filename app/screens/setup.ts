import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import type { AppScreen } from "../constants";

type SetupScreenOptions = {
  backToLandingButton: HTMLButtonElement;
  startGameButton: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  spinnyToggleButton: HTMLButtonElement;
  initialSpinnyOn: boolean;
  navigate: (screen: AppScreen) => void;
  setSelectedMode: (mode: GameMode) => void;
  setSelectedBoard: (board: BoardKind) => void;
  startGame: () => void;
};

const renderSpinnyToggle = (button: HTMLButtonElement, on: boolean): void => {
  button.setAttribute("aria-pressed", String(on));
  button.classList.toggle("board-toggle--on", on);
};

const initSetupScreen = ({
  backToLandingButton,
  startGameButton,
  modeButtons,
  spinnyToggleButton,
  initialSpinnyOn,
  navigate,
  setSelectedMode,
  setSelectedBoard,
  startGame,
}: SetupScreenOptions): void => {
  backToLandingButton.addEventListener("click", () => navigate("landing"));
  startGameButton.addEventListener("click", () => startGame());

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedMode(button.dataset.mode as GameMode);
      modeButtons.forEach((modeButton) => {
        modeButton.classList.toggle("mode-button--selected", modeButton === button);
      });
    });
  });

  let spinnyOn = initialSpinnyOn;
  renderSpinnyToggle(spinnyToggleButton, spinnyOn);
  setSelectedBoard(spinnyOn ? "ring" : "rectangular");

  spinnyToggleButton.addEventListener("click", () => {
    spinnyOn = !spinnyOn;
    renderSpinnyToggle(spinnyToggleButton, spinnyOn);
    setSelectedBoard(spinnyOn ? "ring" : "rectangular");
  });
};

export { initSetupScreen };
