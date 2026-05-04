import { createBoard } from "@game/board/factory";
import { Game } from "@game/game";
import type { InputController } from "../../input/controller";
import {
  DEFAULT_INPUT_SETTINGS,
  clampInputSettings,
  formatSdfLabel,
  sdfFromSliderValue,
  sdfToSliderValue,
  type InputSettings,
} from "../../input/settings";
import type { createMiniBoardRenderer } from "../../render/miniBoard";
import type { AppScreen } from "../constants";
import { SETTINGS_TEST_CONFIG } from "../constants";

type MiniRenderer = ReturnType<typeof createMiniBoardRenderer>;

type SettingsScreenOptions = {
  settingsBackButton: HTMLButtonElement;
  settingsCanvas: HTMLCanvasElement;
  dasSlider: HTMLInputElement;
  arrSlider: HTMLInputElement;
  dcdSlider: HTMLInputElement;
  sdfSlider: HTMLInputElement;
  dasValue: HTMLElement;
  arrValue: HTMLElement;
  dcdValue: HTMLElement;
  sdfValue: HTMLElement;
  settingsResetButton: HTMLButtonElement;
  miniRenderer: MiniRenderer;
  testController: InputController;
  getAppScreen: () => AppScreen;
  getTestGame: () => Game | null;
  setTestGame: (game: Game | null) => void;
  getSettingsTestFocused: () => boolean;
  setSettingsTestFocused: (focused: boolean) => void;
  getInputSettings: () => InputSettings;
  applyInputSettings: (settings: InputSettings) => void;
  navigate: (screen: AppScreen) => void;
  syncInputControllerState: () => void;
  shouldBlockGameplayKey: () => boolean;
  blockHandledKeys: (e: KeyboardEvent) => void;
};

type SettingsScreen = {
  restartTestGame: () => void;
  enter: () => void;
  leave: () => void;
  refreshSettingsUi: () => void;
  stepFrame: (dtMs: number) => void;
  drawFrame: (dtMs: number) => void;
  onResize: () => void;
};

const initSettingsScreen = ({
  settingsBackButton,
  settingsCanvas,
  dasSlider,
  arrSlider,
  dcdSlider,
  sdfSlider,
  dasValue,
  arrValue,
  dcdValue,
  sdfValue,
  settingsResetButton,
  miniRenderer,
  testController,
  getAppScreen,
  getTestGame,
  setTestGame,
  getSettingsTestFocused,
  setSettingsTestFocused,
  getInputSettings,
  applyInputSettings,
  navigate,
  syncInputControllerState,
  shouldBlockGameplayKey,
  blockHandledKeys,
}: SettingsScreenOptions): SettingsScreen => {
  const restartTestGame = (): void => {
    const testGame = new Game({
      boardFactory: (width, height) => createBoard("rectangular", width, height),
      config: SETTINGS_TEST_CONFIG,
    });
    setTestGame(testGame);
    miniRenderer.syncSize(testGame);
  };

  const refreshSettingsUi = (): void => {
    const settings = getInputSettings();
    dasSlider.value = String(settings.dasMs);
    arrSlider.value = String(settings.arrMs);
    dcdSlider.value = String(settings.dcdMs);
    sdfSlider.value = String(sdfToSliderValue(settings.sdf));
    dasValue.textContent = `${settings.dasMs}ms`;
    arrValue.textContent = `${settings.arrMs}ms`;
    dcdValue.textContent = `${settings.dcdMs}ms`;
    sdfValue.textContent = formatSdfLabel(settings.sdf);
  };

  const readSlidersToSettings = (): InputSettings =>
    clampInputSettings({
      dasMs: Number(dasSlider.value),
      arrMs: Number(arrSlider.value),
      dcdMs: Number(dcdSlider.value),
      sdf: sdfFromSliderValue(Number(sdfSlider.value)),
    });

  const enter = (): void => {
    if (!getTestGame()) restartTestGame();
    miniRenderer.syncSize(getTestGame()!);
    setSettingsTestFocused(false);
  };

  const leave = (): void => {
    setSettingsTestFocused(false);
  };

  const onSliderInput = (): void => {
    applyInputSettings(readSlidersToSettings());
    refreshSettingsUi();
  };

  settingsBackButton.addEventListener("click", () => navigate("landing"));
  settingsCanvas.addEventListener("click", () => {
    setSettingsTestFocused(true);
    settingsCanvas.focus();
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("focus", () => {
    setSettingsTestFocused(true);
    syncInputControllerState();
  });
  settingsCanvas.addEventListener("blur", () => {
    setSettingsTestFocused(false);
    syncInputControllerState();
  });
  dasSlider.addEventListener("input", onSliderInput);
  arrSlider.addEventListener("input", onSliderInput);
  dcdSlider.addEventListener("input", onSliderInput);
  sdfSlider.addEventListener("input", onSliderInput);

  settingsResetButton.addEventListener("click", () => {
    applyInputSettings(DEFAULT_INPUT_SETTINGS);
    refreshSettingsUi();
    restartTestGame();
  });

  settingsCanvas.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (getAppScreen() !== "settings") {
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") {
      restartTestGame();
      e.preventDefault();
      return;
    }
    if (shouldBlockGameplayKey()) {
      e.preventDefault();
      return;
    }
    blockHandledKeys(e);
  });

  const stepFrame = (dtMs: number): void => {
    const testGame = getTestGame();
    if (getAppScreen() !== "settings" || !testGame || !getSettingsTestFocused()) return;
    if (testGame.getSnapshot().gameOver) {
      restartTestGame();
    } else {
      testGame.tick(dtMs);
    }
  };

  const drawFrame = (dtMs: number): void => {
    const testGame = getTestGame();
    if (getAppScreen() !== "settings" || !testGame) return;
    const gravityIntervalMs = testGame.getSnapshot().gravityIntervalMs;
    testController.update(dtMs, gravityIntervalMs);
    miniRenderer.draw(testGame);
  };

  const onResize = (): void => {
    const testGame = getTestGame();
    if (testGame) miniRenderer.syncSize(testGame);
  };

  refreshSettingsUi();

  return {
    restartTestGame,
    enter,
    leave,
    refreshSettingsUi,
    stepFrame,
    drawFrame,
    onResize,
  };
};

export { initSettingsScreen };
export type { SettingsScreen };
