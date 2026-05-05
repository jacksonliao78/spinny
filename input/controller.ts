import type { Game } from "@game/game";
import type { InputSettings, SoftDropFactor } from "./settings";

export type GameplayInputCallbacks = {
  moveLeft: () => void;
  moveRight: () => void;
  softDrop: () => void;
  softDropToContact: () => void;
  rotateCw: () => void;
  rotateCcw: () => void;
  rotate180: () => void;
  hardDrop: () => void;
  hold: () => void;
};

export type InputController = {
  setSettings: (next: InputSettings) => void;
  setEnabled: (enabled: boolean) => void;
  /** Register key listeners on a focusable element (typically a gameplay canvas). */
  attach: (target: HTMLElement) => void;
  detach: () => void;
  /** Drive shift auto-repeat and charged soft drop. */
  update: (dtMs: number, gravityIntervalMs: number) => void;
};

export function softDropToContact(game: Game): void {
  const snap = game.getSnapshot();
  if (!snap.active || snap.gameOver) return;
  const [gx, gy] = game.board.gravityDelta();
  if (!game.canMovePiece(snap.active, gx, gy)) return;
  const maxSteps = game.board.width + game.board.height;
  for (let i = 0; i < maxSteps; i++) {
    const before = game.activePiece;
    if (!before) return;
    game.softDrop();
    const after = game.activePiece;
    if (game.getSnapshot().gameOver) return;
    if (after !== before) return;
    if (!game.canMovePiece(before, gx, gy)) return;
  }
}
function softDropIntervalMs(sdf: SoftDropFactor, gravityIntervalMs: number): number {
  if (sdf.kind === "instant") return 0;
  const g = Math.max(1, gravityIntervalMs);
  return g / sdf.value;
}

/**
 * Keyboard handling for SRS-style gameplay actions.
 * Movement uses key state + DAS/ARR/DCD; spins / hard drop / hold are edge-triggered on keydown.
 */
export function createInputController(
  getCallbacks: () => GameplayInputCallbacks | null,
  initialSettings: InputSettings,
): InputController {
  let settings = initialSettings;
  let enabled = true;
  let target: HTMLElement | null = null;

  let lastGravityIntervalMs = 700;

  let leftHeld = false;
  let rightHeld = false;

  let horizontalDir: -1 | 0 | 1 = 0;
  let dcdRemainingMs = 0;
  let dasRemainingMs = 0;
  let arrRemainingMs = 0;
  let horizRepeating = false;

  let downHeld = false;
  let softDropCooldownMs = 0;

  const clearHeldState = (): void => {
    leftHeld = false;
    rightHeld = false;
    downHeld = false;
    resetHorizontal();
    softDropCooldownMs = 0;
  };

  const resetHorizontal = (): void => {
    horizontalDir = 0;
    dcdRemainingMs = 0;
    dasRemainingMs = 0;
    arrRemainingMs = 0;
    horizRepeating = false;
  };

  const beginHorizAutoShift = (): void => {
    dasRemainingMs = settings.dasMs;
    arrRemainingMs = settings.arrMs;
    horizRepeating = false;
  };

  const repeatHorizontal = (cbs: GameplayInputCallbacks): void => {
    if (horizontalDir === -1) cbs.moveLeft();
    else if (horizontalDir === 1) cbs.moveRight();
  };

  const tapHorizontal = (cbs: GameplayInputCallbacks, dir: -1 | 1): void => {
    horizontalDir = dir;
    dcdRemainingMs = 0;
    if (dir === -1) cbs.moveLeft();
    else cbs.moveRight();
    beginHorizAutoShift();
  };

  const pressHorizontal = (cbs: GameplayInputCallbacks, dir: -1 | 1): void => {
    const oppositeHeld = dir === -1 ? rightHeld : leftHeld;
    const reversal = horizontalDir !== 0 && horizontalDir !== dir;
    if (oppositeHeld) {
      horizontalDir = dir;
      dcdRemainingMs = 0;
      if (dir === -1) cbs.moveLeft();
      else cbs.moveRight();
      beginHorizAutoShift();
      return;
    }
    if (reversal) {
      horizontalDir = dir;
      dcdRemainingMs = settings.dcdMs;
      beginHorizAutoShift();
      return;
    }
    tapHorizontal(cbs, dir);
  };

  const pumpHorizontal = (cbs: GameplayInputCallbacks, dtMs: number): void => {
    if (horizontalDir === 0) return;
    if (dcdRemainingMs > 0) {
      dcdRemainingMs = Math.max(0, dcdRemainingMs - dtMs);
      if (dcdRemainingMs > 0) return;
    }
    if (!horizRepeating) {
      dasRemainingMs -= dtMs;
      if (dasRemainingMs > 0) return;
      horizRepeating = true;
      arrRemainingMs = settings.arrMs;
      repeatHorizontal(cbs);
      return;
    }
    if (settings.arrMs === 0) {
      repeatHorizontal(cbs);
      return;
    }
    arrRemainingMs -= dtMs;
    if (arrRemainingMs > 0) return;
    const steps = 1 + Math.floor(-arrRemainingMs / settings.arrMs);
    arrRemainingMs += steps * settings.arrMs;
    for (let i = 0; i < steps; i++) repeatHorizontal(cbs);
  };

  const pumpSoftDrop = (cbs: GameplayInputCallbacks, dtMs: number, gravityIntervalMs: number): void => {
    if (!downHeld) return;
    const sdf = settings.sdf;
    if (sdf.kind === "instant") {
      cbs.softDropToContact();
      softDropCooldownMs = 0;
      return;
    }
    const interval = softDropIntervalMs(sdf, gravityIntervalMs);
    if (interval <= 0) {
      cbs.softDrop();
      return;
    }
    softDropCooldownMs -= dtMs;
    while (softDropCooldownMs <= 0) {
      cbs.softDrop();
      softDropCooldownMs += interval;
    }
  };

  const targetIsFormField = (e: KeyboardEvent): boolean => {
    const t = e.target;
    if (typeof HTMLElement === "undefined") return false;
    if (!(t instanceof HTMLElement)) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!enabled || e.repeat || targetIsFormField(e)) return;
    const cbs = getCallbacks();
    if (!cbs) return;

    switch (e.code) {
      case "ArrowUp":
        cbs.rotateCw();
        e.preventDefault();
        return;
      case "KeyZ":
        cbs.rotateCcw();
        e.preventDefault();
        return;
      case "KeyX":
        cbs.rotateCw();
        e.preventDefault();
        return;
      case "KeyA":
        cbs.rotate180();
        e.preventDefault();
        return;
      case "Space":
        cbs.hardDrop();
        e.preventDefault();
        return;
      case "KeyC":
        cbs.hold();
        e.preventDefault();
        return;
      case "ArrowLeft": {
        leftHeld = true;
        pressHorizontal(cbs, -1);
        e.preventDefault();
        return;
      }
      case "ArrowRight": {
        rightHeld = true;
        pressHorizontal(cbs, 1);
        e.preventDefault();
        return;
      }
      case "ArrowDown": {
        downHeld = true;
        const sdf = settings.sdf;
        if (sdf.kind === "instant") {
          cbs.softDropToContact();
          softDropCooldownMs = 0;
        } else {
          cbs.softDrop();
          softDropCooldownMs = softDropIntervalMs(sdf, lastGravityIntervalMs);
        }
        e.preventDefault();
        return;
      }
      default:
        return;
    }
  };

  const onKeyUp = (e: KeyboardEvent): void => {
    if (!enabled || targetIsFormField(e)) return;
    switch (e.code) {
      case "ArrowLeft": {
        leftHeld = false;
        const cbs = getCallbacks();
        if (!cbs) return;
        if (rightHeld) {
          horizontalDir = 1;
          dcdRemainingMs = settings.dcdMs;
          beginHorizAutoShift();
        } else {
          resetHorizontal();
        }
        e.preventDefault();
        return;
      }
      case "ArrowRight": {
        rightHeld = false;
        const cbs = getCallbacks();
        if (!cbs) return;
        if (leftHeld) {
          horizontalDir = -1;
          dcdRemainingMs = settings.dcdMs;
          beginHorizAutoShift();
        } else {
          resetHorizontal();
        }
        e.preventDefault();
        return;
      }
      case "ArrowDown":
        downHeld = false;
        softDropCooldownMs = 0;
        e.preventDefault();
        return;
      default:
        return;
    }
  };

  const update = (dtMs: number, gravityIntervalMs: number): void => {
    lastGravityIntervalMs = gravityIntervalMs;
    if (!enabled) return;
    const cbs = getCallbacks();
    if (!cbs) return;
    pumpHorizontal(cbs, dtMs);
    pumpSoftDrop(cbs, dtMs, gravityIntervalMs);
  };

  const onTargetBlur = (): void => {
    clearHeldState();
  };

  const onDocumentVisibilityChange = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) clearHeldState();
  };

  const clearTarget = (): void => {
    if (!target) return;
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onTargetBlur);
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onDocumentVisibilityChange);
    }
    target = null;
    clearHeldState();
  };

  return {
    setSettings: (next) => {
      settings = next;
    },
    setEnabled: (next) => {
      enabled = next;
      if (!next) {
        clearHeldState();
      }
    },
    attach: (nextTarget) => {
      clearTarget();
      target = nextTarget;
      target.addEventListener("keydown", onKeyDown);
      target.addEventListener("keyup", onKeyUp);
      target.addEventListener("blur", onTargetBlur);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", onDocumentVisibilityChange);
      }
    },
    detach: () => {
      clearTarget();
    },
    update,
  };
}

export function gameplayCallbacksFor(game: Game): GameplayInputCallbacks {
  return {
    moveLeft: () => game.moveLeft(),
    moveRight: () => game.moveRight(),
    softDrop: () => game.softDrop(),
    softDropToContact: () => softDropToContact(game),
    rotateCw: () => game.rotateCw(),
    rotateCcw: () => game.rotateCcw(),
    rotate180: () => game.rotate180(),
    hardDrop: () => game.hardDrop(),
    hold: () => game.hold(),
  };
}
