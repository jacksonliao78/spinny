import type { BoardKind } from "@game/board/factory";
import type { GameMode } from "@game/game/rules";
import type { AppScreen } from "../constants";

type SetupScreenOptions = {
  backToLandingButton: HTMLButtonElement;
  startGameButton: HTMLButtonElement;
  modeButtons: HTMLButtonElement[];
  boardButtons: HTMLButtonElement[];
  navigate: (screen: AppScreen) => void;
  setSelectedMode: (mode: GameMode) => void;
  setSelectedBoard: (board: BoardKind) => void;
  startGame: () => void;
};

const initSetupScreen = ({
  backToLandingButton,
  startGameButton,
  modeButtons,
  boardButtons,
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

  boardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSelectedBoard(button.dataset.board as BoardKind);
      boardButtons.forEach((boardButton) => {
        const selected = boardButton === button;
        boardButton.classList.toggle("board-option--selected", selected);
        boardButton.setAttribute("aria-pressed", String(selected));
      });
    });
  });
};

export { initSetupScreen };
