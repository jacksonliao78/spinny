import type { GameSnapshot } from "@game/game";
import { GAME_MODE_POLICIES } from "@game/game/rules";
import type { GameMode } from "@game/game/rules";
import type { PieceType } from "@game/piece";
import {
  HOLD_HEIGHT,
  HOLD_WIDTH,
  NEXT_COUNT,
  NEXT_GAP,
  NEXT_HEIGHT,
  NEXT_SLOT_HEIGHT,
  NEXT_WIDTH,
  drawMiniPiece,
  setupHoldCanvas,
  setupNextCanvas,
} from "./miniPiecePainter";

type HudElements = {
  holdCanvas: HTMLCanvasElement;
  nextCanvas: HTMLCanvasElement;
  timerEl: HTMLElement;
  linesRow: HTMLElement;
  linesValue: HTMLElement;
  scoreRow: HTMLElement;
  scoreValue: HTMLElement;
  levelRow: HTMLElement;
  levelValue: HTMLElement;
  ppsRow: HTMLElement;
  ppsValue: HTMLElement;
  comboRow: HTMLElement;
  comboValue: HTMLElement;
  survivalRow: HTMLElement;
  survivalValue: HTMLElement;
};

type HudUpdater = {
  configure: (gameMode: GameMode, sprintTarget: number) => void;
  update: (snap: GameSnapshot) => void;
};

function formatCountUp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function formatCountdown(ms: number | null): string {
  if (ms === null) return "--:--";
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function createHudUpdater(elements: HudElements): HudUpdater {
  let mode: GameMode = "timed";
  let target = 40;

  const holdCtx = setupHoldCanvas(elements.holdCanvas);
  const nextCtx = setupNextCanvas(elements.nextCanvas);

  let lastHold: PieceType | null | undefined = undefined;
  let lastNextKey = "";

  const configure = (gameMode: GameMode, sprintTarget: number): void => {
    mode = gameMode;
    target = sprintTarget;
    lastHold = undefined;
    lastNextKey = "";
    const policy = GAME_MODE_POLICIES[mode];

    elements.timerEl.hidden = policy.timerStyle === "none";
    elements.scoreRow.hidden = !policy.showsScore;
    elements.levelRow.hidden = !policy.showsLevel;
    elements.ppsRow.hidden = false;
    elements.comboRow.hidden = false;
    elements.linesRow.hidden = false;
    elements.survivalRow.hidden = true;

    elements.timerEl.textContent = "";
    elements.linesValue.textContent = "";
    elements.scoreValue.textContent = "";
    elements.levelValue.textContent = "";
    elements.ppsValue.textContent = "";
    elements.comboValue.textContent = "";
    elements.survivalValue.textContent = "";

    holdCtx.clearRect(0, 0, HOLD_WIDTH, HOLD_HEIGHT);
    nextCtx.clearRect(0, 0, NEXT_WIDTH, NEXT_HEIGHT);
  };

  const update = (snap: GameSnapshot): void => {
    const policy = GAME_MODE_POLICIES[mode];
    if (policy.timerStyle === "countdown") {
      elements.timerEl.textContent = formatCountdown(snap.remainingMs);
    } else if (policy.timerStyle === "countup") {
      elements.timerEl.textContent = formatCountUp(snap.elapsedMs);
    }

    if (policy.completesAtSprintTarget) {
      elements.linesValue.textContent = `${snap.linesClearedTotal} / ${target}`;
    } else {
      elements.linesValue.textContent = String(snap.linesClearedTotal);
    }

    elements.scoreValue.textContent = String(snap.score);
    elements.levelValue.textContent = String(snap.level);
    elements.ppsValue.textContent = snap.piecesPerSecond.toFixed(2);
    elements.comboValue.textContent = String(snap.combo);

    if (snap.survival && snap.survival.active) {
      const seconds = (snap.survival.msUntilNext / 1000).toFixed(1);
      const lines = snap.survival.linesPerEvent;
      elements.survivalValue.textContent = lines === 1 ? `${seconds}s` : `${seconds}s × ${lines}`;
      elements.survivalRow.hidden = false;
    } else {
      elements.survivalRow.hidden = true;
      elements.survivalValue.textContent = "";
    }

    if (snap.hold !== lastHold) {
      lastHold = snap.hold;
      holdCtx.clearRect(0, 0, HOLD_WIDTH, HOLD_HEIGHT);
      if (snap.hold) {
        drawMiniPiece(holdCtx, snap.hold, HOLD_WIDTH / 2, HOLD_HEIGHT / 2);
      }
    }

    const nextKey = snap.next.slice(0, NEXT_COUNT).join(",");
    if (nextKey !== lastNextKey) {
      lastNextKey = nextKey;
      nextCtx.clearRect(0, 0, NEXT_WIDTH, NEXT_HEIGHT);
      snap.next.slice(0, NEXT_COUNT).forEach((type, idx) => {
        const cy = NEXT_SLOT_HEIGHT / 2 + idx * (NEXT_SLOT_HEIGHT + NEXT_GAP);
        drawMiniPiece(nextCtx, type, NEXT_WIDTH / 2, cy);
      });
    }
  };

  return { configure, update };
}

export { createHudUpdater };
export type { HudElements, HudUpdater };
