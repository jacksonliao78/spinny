import type { Game } from "@game/game";

type BotPlacement = {
  x: number;
  y: number;
  rotation: number;
  score: number;
};

type BotBrain = {
  choosePlacement: (game: Game) => BotPlacement | null;
};

type BotController = {
  update: (game: Game, dtMs: number) => void;
};

type BotControllerOptions = {
  targetPps?: number;
  brain?: BotBrain;
};

type BotKind = "bot-a" | "bot-b";

type BotDefinition = {
  kind: BotKind;
  label: "Bot A" | "Bot B";
  description: string;
  createBrain: () => BotBrain;
};

export type { BotBrain, BotController, BotControllerOptions, BotDefinition, BotKind, BotPlacement };
