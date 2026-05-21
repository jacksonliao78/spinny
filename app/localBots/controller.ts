import type { Game } from "@game/game";
import { Piece } from "@game/piece";
import { chooseBotPlacement, detectTSpinCandidate } from "./evaluator";
import type { BotBrain, BotController, BotControllerOptions, BotPlacement } from "./types";

const DEFAULT_TARGET_PPS = 1.6;
const MIN_TARGET_PPS = 0.4;
const MAX_TARGET_PPS = 4;

const defaultBrain: BotBrain = {
  choosePlacement: chooseBotPlacement,
};

const clampBotPps = (targetPps: number): number => {
  if (!Number.isFinite(targetPps)) return DEFAULT_TARGET_PPS;
  return Math.min(MAX_TARGET_PPS, Math.max(MIN_TARGET_PPS, targetPps));
};

const placementIntervalForPps = (targetPps: number): number => {
  const safePps = clampBotPps(targetPps);
  return 1000 / safePps;
};

const executePlacement = (game: Game, placement: BotPlacement): void => {
  const snap = game.getSnapshot();
  const active = snap.active;
  if (!active || snap.gameOver) return;
  const piece = new Piece(active.type, placement.x, placement.y);
  piece.rotation = placement.rotation;
  game.placeActivePieceAt(placement.x, placement.y, placement.rotation, {
    markAsRotated: detectTSpinCandidate(snap, piece) !== null,
  });
};

const createBotController = (options: BotControllerOptions = {}): BotController => {
  let placementMs = 0;
  const placementIntervalMs = placementIntervalForPps(options.targetPps ?? DEFAULT_TARGET_PPS);
  const brain = options.brain ?? defaultBrain;

  return {
    update: (game, dtMs) => {
      placementMs += dtMs;
      let placementsThisUpdate = 0;
      while (placementMs >= placementIntervalMs && placementsThisUpdate < 4) {
        placementMs -= placementIntervalMs;
        placementsThisUpdate += 1;
        const snap = game.getSnapshot();
        if (!snap.active || snap.gameOver) return;
        const placement = brain.choosePlacement(game);
        if (!placement) return;
        executePlacement(game, placement);
      }
    },
  };
};

export { clampBotPps, createBotController, DEFAULT_TARGET_PPS, executePlacement, placementIntervalForPps };
