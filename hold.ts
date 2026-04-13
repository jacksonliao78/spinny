import { Piece, PieceType } from "./piece";

class Hold {
  holdPiece: Piece | null = null;

  constructor() {}

  /**
   * If hold was empty: stores `piece` and returns null.
   * If hold had a piece: swaps with `piece` and returns the previously held piece.
   */
  hold(piece: Piece): Piece | null {
    if (this.holdPiece !== null) {
      const temp = this.holdPiece;
      this.holdPiece = piece;
      return temp;
    }
    this.holdPiece = piece;
    return null;
  }

  getHoldType(): PieceType | null {
    return this.holdPiece?.type ?? null;
  }
}

export { Hold };
