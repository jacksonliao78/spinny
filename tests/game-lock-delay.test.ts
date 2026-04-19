import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../engine/game";
import { Piece } from "../engine/piece";

type GameInternals = {
  lockDelayRemainingMs: number | null;
  lockDelayResetsUsed: number;
};

function clearBoard(game: Game): void {
  for (let y = 0; y < game.board.height; y++) {
    for (let x = 0; x < game.board.width; x++) {
      game.board.board[y][x] = null;
    }
  }
}

function setGroundedPiece(game: Game): void {
  clearBoard(game);
  game.board.rotation = 0;
  game.activePiece = new Piece("O", 1, game.board.height - 3);
  game.gameOver = false;
}

function internals(game: Game): GameInternals {
  return game as unknown as GameInternals;
}

test("ground contact starts lock delay instead of immediate lock", () => {
  const game = new Game(6, 8, 10_000);
  setGroundedPiece(game);

  game.tick(100);

  assert.equal(game.getSnapshot().boardRotation, 0);
  assert.notEqual(game.activePiece, null);
});

test("piece locks after 500ms on ground", () => {
  const game = new Game(6, 8, 10_000);
  setGroundedPiece(game);

  game.tick(499);
  assert.equal(game.getSnapshot().boardRotation, 0);

  game.tick(1);
  assert.equal(game.getSnapshot().boardRotation, 1);
});

test("move/rotate lock-delay resets are capped at 15", () => {
  const game = new Game(6, 8, 10_000);
  setGroundedPiece(game);

  game.tick(1);
  for (let i = 0; i < 15; i++) {
    game.rotateCw();
    assert.equal(internals(game).lockDelayResetsUsed, i + 1);
    game.tick(400);
    assert.equal(game.getSnapshot().boardRotation, 0);
  }

  game.rotateCw();
  assert.equal(internals(game).lockDelayResetsUsed, 15);
  game.tick(99);
  assert.equal(game.getSnapshot().boardRotation, 0);
  game.tick(1);
  assert.equal(game.getSnapshot().boardRotation, 1);
});

test("downward movement resets the lock-delay reset counter", () => {
  const game = new Game(6, 8, 10_000);
  setGroundedPiece(game);

  game.rotateCw();
  game.rotateCw();
  assert.equal(internals(game).lockDelayResetsUsed, 2);

  if (game.activePiece) {
    game.activePiece.y -= 1;
  }

  game.softDrop();
  assert.equal(internals(game).lockDelayResetsUsed, 0);
});

test("hard drop locks immediately", () => {
  const game = new Game(6, 8, 10_000);
  clearBoard(game);
  game.board.rotation = 0;
  game.activePiece = new Piece("O", 1, 0);

  game.hardDrop();

  assert.equal(game.getSnapshot().boardRotation, 1);
});
