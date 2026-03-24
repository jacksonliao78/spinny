import {Piece} from './piece';

class Hold {
    holdPiece: Piece | null = null;

    constructor() {
    }

    // returns the held piece, if found. otherwise, stores the current piece in the hold position
    hold( piece: Piece) {
        if ( this.holdPiece !== null ) {
            let temp = this.holdPiece;
            this.holdPiece = piece;
            return temp
        }
        this.holdPiece = piece;
        return null;
    }

}