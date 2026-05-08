import type { GameSnapshot } from "@game/game";
import { GAME_MODE_POLICIES } from "@game/game/rules";
import type { GameMode } from "@game/game/rules";
import type { PieceType } from "@game/piece";
import { PIECE_ROTATIONS } from "@game/piece";
import { PIECE_STYLES, type PieceStyle } from "./pieceStyles";

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
  comboRow: HTMLElement;
  comboValue: HTMLElement;
  survivalRow: HTMLElement;
  survivalValue: HTMLElement;
};

type HudUpdater = {
  configure: (gameMode: GameMode, sprintTarget: number) => void;
  update: (snap: GameSnapshot) => void;
};

const HOLD_CELL = 10;
const NEXT_CELL = 10;
const NEXT_SLOT_H = 3 * NEXT_CELL;
const NEXT_COUNT = 5;
const NEXT_GAP = 4;

function setupCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(logicalW * dpr);
  canvas.height = Math.floor(logicalH * dpr);
  canvas.style.aspectRatio = `${logicalW} / ${logicalH}`;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function drawMiniPiece(
  ctx: CanvasRenderingContext2D,
  type: PieceType,
  centerX: number,
  centerY: number,
  size: number,
): void {
  const shape = PIECE_ROTATIONS[type][0];
  let minX = 4, minY = 4, maxX = 0, maxY = 0;
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 0) continue;
      minX = Math.min(minX, col);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, col);
      maxY = Math.max(maxY, row);
    }
  }
  const pieceW = (maxX - minX + 1) * size;
  const pieceH = (maxY - minY + 1) * size;
  const offsetX = centerX - pieceW / 2;
  const offsetY = centerY - pieceH / 2;

  const style: PieceStyle = PIECE_STYLES[type];
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 0) continue;
      const px = offsetX + (col - minX) * size;
      const py = offsetY + (row - minY) * size;
      const inset = 1;
      const w = size - inset * 2;
      const h = size - inset * 2;
      const gradient = ctx.createLinearGradient(px, py, px, py + size);
      gradient.addColorStop(0, "rgba(255,255,255,0.2)");
      gradient.addColorStop(0.28, style.fill);
      gradient.addColorStop(1, style.edge);
      ctx.fillStyle = gradient;
      ctx.fillRect(px + inset, py + inset, w, h);
      ctx.strokeStyle = "rgba(235, 243, 255, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px + inset + 0.5, py + inset + 0.5, w - 1, h - 1);
    }
  }
}

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

  const holdW = 4 * HOLD_CELL + 8;
  const holdH = 4 * HOLD_CELL + 8;
  const holdCtx = setupCanvas(elements.holdCanvas, holdW, holdH);

  const nextW = 4 * NEXT_CELL + 8;
  const nextH = NEXT_COUNT * NEXT_SLOT_H + (NEXT_COUNT - 1) * NEXT_GAP;
  const nextCtx = setupCanvas(elements.nextCanvas, nextW, nextH);

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
    elements.comboRow.hidden = false;
    elements.linesRow.hidden = false;
    elements.survivalRow.hidden = true;

    elements.timerEl.textContent = "";
    elements.linesValue.textContent = "";
    elements.scoreValue.textContent = "";
    elements.levelValue.textContent = "";
    elements.comboValue.textContent = "";
    elements.survivalValue.textContent = "";

    holdCtx.clearRect(0, 0, holdW, holdH);
    nextCtx.clearRect(0, 0, nextW, nextH);
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
      holdCtx.clearRect(0, 0, holdW, holdH);
      if (snap.hold) {
        drawMiniPiece(holdCtx, snap.hold, holdW / 2, holdH / 2, HOLD_CELL);
      }
    }

    const nextKey = snap.next.slice(0, NEXT_COUNT).join(",");
    if (nextKey !== lastNextKey) {
      lastNextKey = nextKey;
      nextCtx.clearRect(0, 0, nextW, nextH);
      snap.next.slice(0, NEXT_COUNT).forEach((type, idx) => {
        const cy = NEXT_SLOT_H / 2 + idx * (NEXT_SLOT_H + NEXT_GAP);
        drawMiniPiece(nextCtx, type, nextW / 2, cy, NEXT_CELL);
      });
    }
  };

  return { configure, update };
}

export { createHudUpdater };
export type { HudElements, HudUpdater };
