// game-logic.js

const CARDS = { 'A': 3, 'K': 2, 'Q': 1 };
const DECK = ['A', 'K', 'Q'];

// デッキを作成する関数
function createDeck() {
    return [...DECK];
}

// デッキをシャッフルする関数
function shuffle(deck) {
    return deck.sort(() => Math.random() - 0.5);
}

// カードを配る関数
function deal(deck, count) {
    return deck.splice(0, count);
}

// 勝者を判定する関数
function checkWinner(players) {
    const activePlayers = players.filter(p => !p.isFolded);
    if (activePlayers.length === 1) {
        return activePlayers[0];
    }

    const player1 = activePlayers[0];
    const player2 = activePlayers[1];

    if (CARDS[player1.hand[0]] > CARDS[player2.hand[0]]) {
        return player1;
    } else {
        return player2;
    }
}

// 作った関数を他のファイルで使えるようにする
module.exports = {
    createDeck,
    shuffle,
    deal,
    checkWinner
};