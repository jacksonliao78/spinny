import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../engine/game";
import { Piece } from "../engine/piece";

const lockState = (game: Game) => game as unknown as {
  lockDelayResetsUsed: number;
  lowestProgress: number;
  hasTouchedGround: boolean;
  gravityIntervalMs: number;
};

test("post-contact rotate consumes reset even while airborne", () => {
  const game = new Game();
  const piece = new Piece("O", 2, 4);
  game.activePiece = piece;

  const state = lockState(game);
  state.lowestProgress = (game as any).pieceLow(piece);
  state.hasTouchedGround = true;
  state.lockDelayResetsUsed = 0;

  assert.equal((game as any).isOnGround(), false);
  game.rotateCw();

  assert.equal(state.lockDelayResetsUsed, 1);
});

test("moving to a strict new low refreshes resets instead of consuming", () => {
  const game = new Game();
  const piece = new Piece("O", 2, 4);
  game.activePiece = piece;

  const state = lockState(game);
  state.lowestProgress = (game as any).pieceLow(piece);
  state.hasTouchedGround = true;
  state.lockDelayResetsUsed = 7;

  game.softDrop();

  assert.equal(state.lockDelayResetsUsed, 0);
  assert.equal(state.hasTouchedGround, false);
});

test("passive gravity fall past lowest does not consume rotation resets", () => {
  const game = new Game();
  const piece = new Piece("O", 2, 4);
  game.activePiece = piece;

  const state = lockState(game);
  state.lowestProgress = (game as any).pieceLow(piece);
  state.hasTouchedGround = true;
  state.lockDelayResetsUsed = 4;

  game.tick(state.gravityIntervalMs);

  assert.equal(state.lockDelayResetsUsed, 0);
  assert.equal(state.hasTouchedGround, false);
});

test("15 non-progress actions exhaust reset cap and force lock", () => {
  const game = new Game();
  const piece = new Piece("O", 4, 19);
  game.activePiece = piece;

  // Give the piece in-bounds support so lock exhaustion leads to lock, not border out.
  game.board.board[22][5] = "I";
  game.board.board[22][6] = "I";

  const state = lockState(game);
  state.lowestProgress = (game as any).pieceLow(piece);
  state.hasTouchedGround = true;
  state.lockDelayResetsUsed = 0;

  for (let i = 0; i < 20; i += 1) game.rotateCw();
  assert.equal(state.lockDelayResetsUsed, 15);

  game.tick(1);

  assert.equal(game.gameOver, false);
  assert.notEqual(game.activePiece, piece);
});
