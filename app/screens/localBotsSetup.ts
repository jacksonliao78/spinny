import { getDefaultLocalBotSlots, normalizeLocalBotSlots, type LocalBotSlotConfig } from "../localBots/config";
import type { BotKind } from "../localBots/types";
import type { AppScreen } from "../constants";

type LocalBotSlotControls = {
  enabled: HTMLInputElement;
  type: HTMLSelectElement;
  ppsSlider: HTMLInputElement;
  ppsValue: HTMLElement;
  row: HTMLElement;
};

type LocalBotsSetupScreenOptions = {
  backButton: HTMLButtonElement;
  startButton: HTMLButtonElement;
  slotControls: LocalBotSlotControls[];
  navigate: (screen: AppScreen) => void;
  startMatch: () => void;
  setBotSlots: (slots: LocalBotSlotConfig[]) => void;
};

const isBotKind = (value: string): value is BotKind => value === "bot-a" || value === "bot-b";

const initLocalBotsSetupScreen = ({
  backButton,
  startButton,
  slotControls,
  navigate,
  startMatch,
  setBotSlots,
}: LocalBotsSetupScreenOptions): void => {
  const defaults = getDefaultLocalBotSlots();

  const readSlots = (): LocalBotSlotConfig[] =>
    normalizeLocalBotSlots(
      slotControls.map((controls, index) => ({
        id: defaults[index].id,
        label: defaults[index].label,
        enabled: controls.enabled.checked,
        botKind: isBotKind(controls.type.value) ? controls.type.value : defaults[index].botKind,
        targetPps: Number(controls.ppsSlider.value),
      })),
    );

  const syncSlots = (): void => {
    const slots = readSlots();
    slots.forEach((slot, index) => {
      const controls = slotControls[index];
      controls.ppsValue.textContent = slot.targetPps.toFixed(1);
      controls.row.setAttribute("aria-disabled", slot.enabled ? "false" : "true");
      controls.type.disabled = !slot.enabled;
      controls.ppsSlider.disabled = !slot.enabled;
    });
    startButton.disabled = !slots.some((slot) => slot.enabled);
    setBotSlots(slots);
  };

  defaults.forEach((slot, index) => {
    const controls = slotControls[index];
    controls.enabled.checked = slot.enabled;
    controls.type.value = slot.botKind;
    controls.ppsSlider.value = slot.targetPps.toFixed(1);
  });
  syncSlots();

  backButton.addEventListener("click", () => navigate("multiplayer"));
  startButton.addEventListener("click", startMatch);
  slotControls.forEach((controls) => {
    controls.enabled.addEventListener("change", syncSlots);
    controls.type.addEventListener("change", syncSlots);
    controls.ppsSlider.addEventListener("input", syncSlots);
  });
};

export { initLocalBotsSetupScreen };
export type { LocalBotSlotControls };
