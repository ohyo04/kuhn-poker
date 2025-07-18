// Part 1: 必要なモジュールの読み込み
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const { createDeck, shuffle, deal, checkWinner } = require('./game-logic');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Part 2: ExpressとSocket.IOの初期設定
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Part 3: ミドルウェアと静的ファイル配信
app.use(express.json());

app.get('/', (req, res) => {
    console.log("★★ルートURL ('/') へのアクセスを検知しました。login.html を送信します。★★");
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Part 4: ゲーム状態の管理
let activeGames = {};
let waitingPlayer = null;

// Part 5: Socket.IO 接続時の処理
io.on('connection', (socket) => {
    console.log(`ユーザーが接続しました: ${socket.id}`);

    const createNewGameState = (roomId, players) => ({
        roomId, players, pot: 0, turnIndex: 0, phase: 'waiting',
        isPlayerFirst: true, message: '相手の参加を待っています...', actions: [],
    });

    socket.on('createRoom', (data) => {
        if (!data || !data.username) return socket.emit('gameError', 'ユーザー情報がありません。');
        socket.username = data.username;
        const roomId = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
        const players = [{ id: socket.id, name: socket.username, hand: [], chips: 10, bet: 0, hasActed: false, isFolded: false }];
        activeGames[roomId] = createNewGameState(roomId, players);
        socket.join(roomId);
        console.log(`${socket.username} (${socket.id}) が部屋を作成しました: ${roomId}`);
        socket.emit('roomCreated', roomId);
    });

    socket.on('joinRoom', (data) => {
        if (!data || !data.roomId || !data.username) return socket.emit('gameError', 'リクエスト情報が不十分です。');
        const { roomId, username } = data;
        const game = activeGames[roomId];
        socket.username = username;
        if (!game) return socket.emit('gameError', '指定された部屋が見つかりません。');
        if (game.players.length >= 2) return socket.emit('gameError', 'この部屋は満員です。');
        socket.join(roomId);
        game.players.push({ id: socket.id, name: socket.username, hand: [], chips: 10, bet: 0, hasActed: false, isFolded: false });
        console.log(`ゲーム開始: ${game.players[0].name} vs ${game.players[1].name} in room ${roomId}`);
        startNewRound(roomId);
    });

    socket.on('findGame', (data) => {
        if (!data || !data.username) return;
        socket.username = data.username;
        console.log(`${socket.username} (${socket.id}) が対戦待機中です。`);
        if (waitingPlayer) {
            const player1 = waitingPlayer;
            const player2 = socket;
            const roomId = `game_${player1.id}_${player2.id}`;
            const players = [
                { id: player1.id, name: player1.username, hand: [], chips: 10, bet: 0, hasActed: false, isFolded: false },
                { id: player2.id, name: player2.username, hand: [], chips: 10, bet: 0, hasActed: false, isFolded: false }
            ];
            activeGames[roomId] = createNewGameState(roomId, players);
            player1.join(roomId);
            player2.join(roomId);
            console.log(`ゲーム開始: ${player1.username} vs ${player2.username} in room ${roomId}`);
            startNewRound(roomId);
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
        }
    });

    socket.on('playerAction', async (data) => {
        const roomId = findRoomBySocketId(socket.id);
        if (!roomId || !activeGames[roomId]) return;
        let gameState = activeGames[roomId];
        const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || playerIndex !== gameState.turnIndex || gameState.phase !== 'betting') return;
        
        const player = gameState.players[playerIndex];
        const opponent = gameState.players.find(p => p.id !== socket.id);
        let actionIsValid = true;
        switch (data.action) {
            case 'bet':
                if (player.chips < 1 || opponent.bet > player.bet) actionIsValid = false;
                else { player.chips--; player.bet++; gameState.pot++; }
                break;
            case 'check':
                if (opponent.bet > player.bet) actionIsValid = false;
                break;
            case 'call':
                const callAmount = opponent.bet - player.bet;
                if (player.chips < callAmount) actionIsValid = false;
                else { player.chips -= callAmount; player.bet += callAmount; gameState.pot += callAmount; }
                break;
            case 'fold':
                player.isFolded = true;
                break;
        }
        if (!actionIsValid) return;
        player.hasActed = true;
        gameState.message = `${player.name}が${data.action}しました。`;
        gameState.actions.push(`${player.name}: ${data.action}`);

        const activePlayers = gameState.players.filter(p => !p.isFolded);
        if (activePlayers.length === 1) {
            await endRound(roomId, activePlayers[0], 'fold');
        } else {
            const betsAreEqual = gameState.players[0].bet === gameState.players[1].bet;
            const allPlayersActed = gameState.players.every(p => p.hasActed || p.isFolded);
            if (betsAreEqual && allPlayersActed) {
                const winner = checkWinner(gameState.players);
                await endRound(roomId, winner, 'showdown');
            } else {
                gameState.turnIndex = (gameState.turnIndex + 1) % 2;
                gameState.message = `${gameState.players[gameState.turnIndex].name}のターンです。`;
                broadcastGameState(roomId);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`ユーザーが切断しました: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.id === socket.id) waitingPlayer = null;
        const roomId = findRoomBySocketId(socket.id);
        if (roomId && activeGames[roomId]) {
            io.to(roomId).emit('gameError', "対戦相手が切断しました。");
            delete activeGames[roomId];
        }
    });
});

// Part 6: ヘルパー関数
function findRoomBySocketId(socketId) {
    return Object.keys(activeGames).find(roomId =>
        activeGames[roomId].players.some(player => player.id === socketId)
    );
}

function broadcastGameState(roomId) {
    const gameState = activeGames[roomId];
    if (!gameState) return;
    io.to(roomId).emit('gameStateUpdate', gameState);
}

async function endRound(roomId, winner, reason) {
    const gameState = activeGames[roomId];
    if (!gameState) return;
    const loser = gameState.players.find(p => p.id !== winner.id);
    if (!loser) return;

    try {
        const dummyPassword = await bcrypt.hash('default_password', 10);
        const winnerRecord = await prisma.user.upsert({
            where: { name: winner.name },
            update: {},
            create: { name: winner.name, password: dummyPassword },
        });
        const loserRecord = await prisma.user.upsert({
            where: { name: loser.name },
            update: {},
            create: { name: loser.name, password: dummyPassword },
        });

        await prisma.gameRecord.create({
            data: {
                winnerId: winnerRecord.id, loserId: loserRecord.id,
                winnerHand: winner.hand[0] || '?', loserHand: loser.hand[0] || '?',
                actions: gameState.actions.join(', ')
            }
        });
        console.log(`ゲーム履歴を記録しました: Winner: ${winner.name}, Loser: ${loser.name}`);
    } catch (error) {
        console.error("データベースへのゲーム履歴記録に失敗しました:", error);
    }

    winner.chips += gameState.pot;
    gameState.phase = reason;
    if (reason === 'fold') {
        gameState.message = `${loser.name}がフォールドしました。${winner.name}がポットを獲得。`;
    } else {
        gameState.message = `${winner.name}が${winner.hand[0]}で勝利しました！`;
    }
    broadcastGameState(roomId);
    setTimeout(() => startNewRound(roomId), 4000);
}

function startNewRound(roomId) {
    const gameState = activeGames[roomId];
    if (!gameState || !gameState.players || gameState.players.length < 2) return;
    if (gameState.players.some(p => p.chips <= 0)) {
        io.to(roomId).emit('gameError', "チップがなくなりました。ゲーム終了。");
        delete activeGames[roomId];
        return;
    }

    console.log(`${roomId}で新しいラウンドを開始します。`);
    const deck = shuffle(createDeck());
    gameState.isPlayerFirst = !gameState.isPlayerFirst;
    
    gameState.players.forEach((p) => {
        p.chips -= 1; p.hand = deal(deck, 1);
        p.bet = 1; p.hasActed = false; p.isFolded = false;
    });
    
    gameState.pot = 2;
    gameState.turnIndex = gameState.isPlayerFirst ? 0 : 1;
    gameState.phase = 'betting';
    gameState.message = `${gameState.players[gameState.turnIndex].name}のターンです。`;
    gameState.actions = [];
    broadcastGameState(roomId);
}

// Part 7: API エンドポイント
app.post('/api/register', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
        const existingUser = await prisma.user.findUnique({ where: { name } });
        if (existingUser) return res.status(400).json({ error: 'そのユーザー名は既に使用されています。' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: { name: name, password: hashedPassword },
        });
        console.log(`新しいユーザーが登録されました: ${newUser.name}`);
        res.status(201).json({ message: 'ユーザー登録が完了しました。' });
    } catch (error) {
        console.error("ユーザー登録中にエラーが発生しました:", error);
        res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
    }
});

// --- ログインAPI ---
app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
        }

        // 1. ユーザーを名前で検索
        const user = await prisma.user.findUnique({
            where: { name: name },
        });
        if (!user) {
            // ★★★ ステータスコードを 404 に変更 ★★★
            return res.status(404).json({ error: 'ユーザーが存在しません。' });
        }

        // 2. パスワードを比較
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが間違っています。' });
        }

        // 3. ログイン成功
        console.log(`ユーザーがログインしました: ${user.name}`);
        res.status(200).json({ message: 'ログインに成功しました。' });

    } catch (error) {
        console.error("ログイン中にエラーが発生しました:", error);
        res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
    }
});

app.get('/api/game-history', async (req, res) => {
    try {
        const records = await prisma.gameRecord.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                winner: { select: { name: true } },
                loser: { select: { name: true } },
            },
            take: 20,
        });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// Part 8: サーバーの起動
server.listen(port, () => {
  console.log(`サーバーが http://localhost:${port} で起動しました`);
});