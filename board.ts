import {PieceType, Piece} from './piece';

const GRAVITY_DIR = {
   U: [0, 1],
   D: [0, -1],
   L: [1, 0],
   R: [-1, 0]
}


class Board {

    width: number;
    height: number;
    board: (PieceType | null)[][];

    center: number; // this is the center of rotation for the 3x3 initial board
    rotation: number; // to indicate which gravity is used


    constructor( width: number, height: number ) {
        this.width = width;
        this.height = height;
        
        this.board = Array.from({ length: height }, () => Array(width).fill(null));
        this.center = width / 2 - 1; // idk incorrect?

        this.rotation = 0
    }

    //"rotates" the center board once
    rotate() {
        this.rotation = ( this.rotation + 1 ) % 4
    } 

    canMove( piece: Piece, dx: number, dy: number ) {

    }

    canRotate( piece: Piece, rotations: number ) {
        let newRotation = (((piece.rotation + rotations) % 4) + 4 ) % 4;
        
        let curPiece = piece.get_shape( newRotation );

        for( const[rowIdx, row] of curPiece.entries() ) {
            for( const[colIdx, cell] of row.entries() ) {
                if( cell === 0 ) continue
                else
                {
                    
                }
            }
        }
    }
}

export {Board}