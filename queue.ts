import {Piece, PieceType} from './piece';

let pieces: PieceType[] = ['O', 'I', 'Z', 'S', 'L', 'J', 'T']

class Queue {

    queue: Piece[] = [];
    bag: Piece[] = [];

    constructor() {
        this.generate_bag(1);
        for( let i = 0; i < 5; i++ ) {
            let piece = this.bag.pop();
            if( piece !== undefined )
                this.queue.push( piece );
        }
    }

    generate_bag( n: number ) {
        this.bag = [];
        for( let _ = 0; _ < n; _++ ) {
            let set = [...pieces];
            let pieceSet = set.map((element => new Piece( element, 0, 0 )));
            pieceSet = this.shuffle( pieceSet );
            this.bag = [...this.bag, ...pieceSet]
        }
    }

    get_piece() {
        if( this.bag.length == 0 ) {
            this.generate_bag( 2 );
        }
        return this.bag.pop();
    }
    
    //shuffles a bag of pieces, returning the shuffled bag
    shuffle<T>( arr: T[]) {
        for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor( Math.random() * (i + 1) );
        [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
}
}