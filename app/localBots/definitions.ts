import { chooseBotBPlacement, chooseBotPlacement } from "./evaluator";
import type { BotDefinition, BotKind } from "./types";

const BOT_DEFINITIONS: Record<BotKind, BotDefinition> = {
  "bot-a": {
    kind: "bot-a",
    label: "Bot A",
    description: "Simple survival bot",
    createBrain: () => ({ choosePlacement: chooseBotPlacement }),
  },
  "bot-b": {
    kind: "bot-b",
    label: "Bot B",
    description: "Versus bot with lookahead",
    createBrain: () => ({ choosePlacement: chooseBotBPlacement }),
  },
};

const BOT_DEFINITION_LIST = [BOT_DEFINITIONS["bot-a"], BOT_DEFINITIONS["bot-b"]] as const;

const getBotDefinition = (kind: BotKind): BotDefinition => BOT_DEFINITIONS[kind] ?? BOT_DEFINITIONS["bot-a"];

export { BOT_DEFINITION_LIST, BOT_DEFINITIONS, getBotDefinition };
