import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "@game/game";
import { createBoard } from "@game/board/factory";
import { createInputController, softDropToContact } from "../../input/controller";
import { DEFAULT_INPUT_SETTINGS } from "../../input/settings";

type Listener = (event: Event) => void;

class FakeTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== "function") return;
    const fn = listener as Listener;
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== "function") return;
    this.listeners.get(type)?.delete(listener as Listener);
  }

  emit(type: string, event: Event): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const listener of set) listener(event);
  }
}

function keyEvent(code: string, target: unknown): KeyboardEvent {
  return {
    code,
    repeat: false,
    target,
    preventDefault() {},
  } as unknown as KeyboardEvent;
}

test("controller applies DCD when switching direction via keyup takeover", () => {
  let moveLeftCalls = 0;
  let moveRightCalls = 0;

  const ctrl = createInputController(
    () => ({
      moveLeft: () => {
        moveLeftCalls += 1;
      },
      moveRight: () => {
        moveRightCalls += 1;
      },
      softDrop: () => {},
      softDropToContact: () => {},
      rotateCw: () => {},
      rotateCcw: () => {},
      hardDrop: () => {},
      hold: () => {},
    }),
    {
      ...DEFAULT_INPUT_SETTINGS,
      dasMs: 0,
      arrMs: 1000,
      dcdMs: 60,
    },
  );

  const target = new FakeTarget();
  ctrl.attach(target as unknown as HTMLElement);
  ctrl.setEnabled(true);

  target.emit("keydown", keyEvent("ArrowLeft", target));
  target.emit("keydown", keyEvent("ArrowRight", target));
  target.emit("keyup", keyEvent("ArrowLeft", target));

  const rightAfterTakeover = moveRightCalls;
  ctrl.update(30, 700);
  assert.equal(moveRightCalls, rightAfterTakeover);

  ctrl.update(40, 700);
  assert.equal(moveRightCalls, rightAfterTakeover + 1);
  assert.equal(moveLeftCalls, 1);

  ctrl.detach();
});

test("controller clears held state on blur", () => {
  let moveRightCalls = 0;

  const ctrl = createInputController(
    () => ({
      moveLeft: () => {},
      moveRight: () => {
        moveRightCalls += 1;
      },
      softDrop: () => {},
      softDropToContact: () => {},
      rotateCw: () => {},
      rotateCcw: () => {},
      hardDrop: () => {},
      hold: () => {},
    }),
    {
      ...DEFAULT_INPUT_SETTINGS,
      dasMs: 10,
      arrMs: 10,
      dcdMs: 0,
    },
  );

  const target = new FakeTarget();
  ctrl.attach(target as unknown as HTMLElement);
  ctrl.setEnabled(true);

  target.emit("keydown", keyEvent("ArrowRight", target));
  assert.equal(moveRightCalls, 1);

  target.emit("blur", { target } as unknown as Event);
  ctrl.update(100, 700);
  assert.equal(moveRightCalls, 1);

  ctrl.detach();
});

test("softDropToContact reaches contact on boards taller than the old fixed cap", () => {
  const game = new Game({
    boardFactory: (width, height) => createBoard("rectangular", width, height),
    config: {
      board: { width: 10, height: 100 },
      mode: { kind: "zen" },
    },
  });
  const startY = game.activePiece!.y;

  softDropToContact(game);

  const active = game.activePiece;
  assert.ok(active);
  assert.ok(active.y - startY > 64);
  const [gx, gy] = game.board.gravityDelta();
  assert.equal(game.canMovePiece(active, gx, gy), false);
});
