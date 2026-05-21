import { clampBotPps, DEFAULT_TARGET_PPS } from "./controller";
import type { BotKind } from "./types";

const MAX_LOCAL_BOTS = 3;

type LocalBotSlotConfig = {
  id: `bot-${number}`;
  label: string;
  enabled: boolean;
  botKind: BotKind;
  targetPps: number;
};

const makeDefaultBotSlot = (index: number): LocalBotSlotConfig => ({
  id: `bot-${index}` as `bot-${number}`,
  label: `Bot ${index}`,
  enabled: index === 1,
  botKind: index === 1 ? "bot-b" : "bot-a",
  targetPps: DEFAULT_TARGET_PPS,
});

const getDefaultLocalBotSlots = (): LocalBotSlotConfig[] =>
  Array.from({ length: MAX_LOCAL_BOTS }, (_, index) => makeDefaultBotSlot(index + 1));

const normalizeLocalBotSlots = (slots: LocalBotSlotConfig[]): LocalBotSlotConfig[] => {
  const defaults = getDefaultLocalBotSlots();
  return defaults.map((fallback, index) => {
    const slot = slots[index] ?? fallback;
    return {
      id: fallback.id,
      label: fallback.label,
      enabled: Boolean(slot.enabled),
      botKind: slot.botKind === "bot-b" ? "bot-b" : "bot-a",
      targetPps: clampBotPps(slot.targetPps),
    };
  });
};

const getEnabledBotSlots = (slots: LocalBotSlotConfig[]): LocalBotSlotConfig[] =>
  normalizeLocalBotSlots(slots).filter((slot) => slot.enabled);

export { getDefaultLocalBotSlots, getEnabledBotSlots, MAX_LOCAL_BOTS, normalizeLocalBotSlots };
export type { LocalBotSlotConfig };
