// server.js (完全版)

// =================================================================
// Part 1: 必要なモジュールの読み込み
// =================================================================
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const { createDeck, shuffle, deal, checkWinner } = require('./game-logic');

// =================================================================
// Part 2: サーバーとSocket.IOの初期化
// =================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// =================================================================
// Part 3: 静的ファイル配信の設定
// =================================================================
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
// Part 4: ゲーム状態とマッチメイキングの管理
// =================================================================
let activeGames = {};
let waitingPlayer = null;

// =================================================================
// Part 5: クライアント接続時の処理
// =================================================================
io.on('connection', (socket) => {
  console.log(`ユーザーが接続しました: ${socket.id}`);
  socket.emit('assignId', socket.id); // 接続時にクライアントにIDを教える

  // --- チャット機能 ---
  socket.on('chatMessage', (msg) => {
    const roomId = findRoomBySocketId(socket.id);
    if (roomId) {
        io.to(roomId).emit('chatMessage', `[${socket.id.substring(0, 4)}]: ${msg}`);
    }
  });

  // --- マッチメイキング機能 ---
  socket.on('findGame', () => {
    console.log(`${socket.id}が対戦相手を探しています`);
    
    if (waitingPlayer) {
      const player1 = waitingPlayer;
      const player2 = socket;
      waitingPlayer = null;

      const roomId = `game-${player1.id}-${player2.id}`;
      player1.join(roomId);
      player2.join(roomId);

      const deck = shuffle(createDeck());
      const players = [
          { id: player1.id, name: `Player ${player1.id.substring(0, 4)}`, hand: deal(deck, 1), chips: 10, bet: 1, hasActed: false, isFolded: false },
          { id: player2.id, name: `Player ${player2.id.substring(0, 4)}`, hand: deal(deck, 1), chips: 10, bet: 1, hasActed: false, isFolded: false }
      ];
      players.forEach(p => p.chips--);
      
      const newGame = {
          roomId,
          players,
          deck,
          pot: 2,
          turnIndex: 0,
          phase: 'betting',
          isPlayerFirst: true,
          message: `${players[0].name}のターンです。`
      };
      
      activeGames[roomId] = newGame;
      console.log(`ゲーム開始: ルームID ${roomId}`);
      broadcastGameState(roomId);

    } else {
      waitingPlayer = socket;
      socket.emit('statusUpdate', '対戦相手を待っています...');
    }
  });

  // --- ゲームアクションの処理 ---
  socket.on('playerAction', (data) => {
    const roomId = findRoomBySocketId(socket.id);
    if (!roomId || !activeGames[roomId]) return;
    
    let gameState = activeGames[roomId];
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    const player = gameState.players[playerIndex];

    if (playerIndex !== gameState.turnIndex || gameState.phase !== 'betting') {
      return; // 自分のターンでない、またはベットフェーズでない場合は無視
    }

    const opponent = gameState.players.find(p => p.id !== socket.id);
    let actionIsValid = true;

    switch(data.action) {
      case 'bet':
        if (player.chips < 1 || opponent.bet > player.bet) { actionIsValid = false; }
        else { player.chips--; player.bet++; gameState.pot++; }
        break;
      case 'check':
        if (opponent.bet > player.bet) { actionIsValid = false; }
        break;
      case 'call':
        const callAmount = opponent.bet - player.bet;
        if (player.chips < callAmount) { actionIsValid = false; }
        else { player.chips -= callAmount; player.bet += callAmount; gameState.pot += callAmount; }
        break;
      case 'fold':
        player.isFolded = true;
        break;
    }

    if (!actionIsValid) {
      return socket.emit('statusUpdate', 'そのアクションは実行できません。');
    }
    
    player.hasActed = true;
    gameState.message = `${player.name}が${data.action}しました。`;

    const activePlayers = gameState.players.filter(p => !p.isFolded);
    if (activePlayers.length === 1) {
      endRound(roomId, activePlayers[0]);
    } else {
        const betsAreEqual = gameState.players[0].bet === gameState.players[1].bet;
        const allPlayersActed = gameState.players.every(p => p.hasActed || p.isFolded);

        if (betsAreEqual && allPlayersActed) {
            const winner = checkWinner(gameState.players);
            endRound(roomId, winner);
        } else {
             gameState.turnIndex = (gameState.turnIndex + 1) % 2;
             gameState.message = `${gameState.players[gameState.turnIndex].name}のターンです。`;
             broadcastGameState(roomId);
        }
    }
  });

  // --- 切断処理 ---
  socket.on('disconnect', () => {
    console.log(`ユーザーが切断しました: ${socket.id}`);
    if (waitingPlayer && waitingPlayer.id === socket.id) {
      waitingPlayer = null;
      console.log('待機中のプレイヤーが切断しました。');
    }
    const roomId = findRoomBySocketId(socket.id);
    if (roomId && activeGames[roomId]) {
        io.to(roomId).emit('gameOver', { message: "対戦相手が切断しました。ゲーム終了です。" });
        delete activeGames[roomId];
    }
  });
});

// =================================================================
// Part 6: ヘルパー関数
// =================================================================
function findRoomBySocketId(socketId) {
    return Object.keys(activeGames).find(roomId => 
        activeGames[roomId].players.some(player => player.id === socketId)
    );
}

function broadcastGameState(roomId) {
    const gameState = activeGames[roomId];
    if (!gameState) return;

    gameState.players.forEach(player => {
        const stateForPlayer = JSON.parse(JSON.stringify(gameState));
        stateForPlayer.players.forEach(p => {
            if (p.id !== player.id && stateForPlayer.phase !== 'showdown') {
                p.hand = ['?']; 
            }
        });
        stateForPlayer.myId = player.id;
        io.to(player.id).emit('gameStateUpdate', stateForPlayer);
    });
}

function endRound(roomId, winner) {
    let gameState = activeGames[roomId];
    if (!gameState) return;

    gameState.phase = 'showdown';
    if(winner) {
        const winnerPlayer = gameState.players.find(p => p.id === winner.id);
        winnerPlayer.chips += gameState.pot;
        gameState.message = `${winnerPlayer.name}の勝利！ ポット(${gameState.pot})を獲得。`;
    } else {
        gameState.message = `引き分けです。`;
    }
    
    broadcastGameState(roomId);

    setTimeout(() => {
        startNewRound(roomId);
    }, 5000);
}

function startNewRound(roomId) {
    let gameState = activeGames[roomId];
    if (!gameState) return;

    if (gameState.players.some(p => p.chips <= 0)) {
        io.to(roomId).emit('gameOver', { message: "どちらかのチップがなくなりました。ゲーム終了です。" });
        delete activeGames[roomId];
        return;
    }

    console.log(`${roomId}で新しいラウンドを開始します。`);
    const deck = shuffle(createDeck());
    gameState.isPlayerFirst = !gameState.isPlayerFirst;
    
    gameState.players.forEach((p) => {
        p.hand = deal(deck, 1);
        p.bet = 1;
        p.hasActed = false;
        p.isFolded = false;
        p.chips--;
    });
    
    gameState.pot = 2;
    gameState.turnIndex = gameState.isPlayerFirst ? 0 : 1;
    gameState.phase = 'betting';
    gameState.message = `${gameState.players[gameState.turnIndex].name}のターンです。`;

    broadcastGameState(roomId);
}

// =================================================================
// Part 7: サーバーの起動
// =================================================================
server.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});
