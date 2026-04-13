import { Piece, PieceType } from "./piece";

const ALL_TYPES: PieceType[] = ["O", "I", "Z", "S", "L", "J", "T"];

class Queue {
  private preview: PieceType[] = [];
  private bag: Piece[] = [];

  constructor() {
    this.refillBag();
    while (this.preview.length < 5) {
      this.preview.push(this.takeFromBag().type);
    }
  }

  private shuffle<T>( arr: T[] ): T[] {
    const a = [ ...arr ];
    for ( let i = a.length - 1; i > 0; i-- ) {
      const j = Math.floor( Math.random() * (i + 1) );
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private refillBag(): void {
    const shuffled = this.shuffle( ALL_TYPES.map((t) => new Piece(t, 0, 0)) );
    this.bag.push( ...shuffled );
  }

  private takeFromBag(): Piece {
    if ( this.bag.length === 0 ) this.refillBag();
    return this.bag.pop()!;
  }

  peekNext( n: number ): PieceType[] {
    return this.preview.slice(0, n);
  }

  consumeNext( spawnX: number, spawnY: number ): Piece {
    const t = this.preview.shift()!;
    this.preview.push( this.takeFromBag().type );
    return new Piece( t, spawnX, spawnY );
  }
}

export { Queue };
