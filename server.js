// Part 1: 必要なモジュールの読み込み
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const { createDeck, shuffle, deal, checkWinner } = require('./game-logic');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const prisma = new PrismaClient();
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// デバッグ用：接続先データベースを確認
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV);

// 接続テスト
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected successfully:', res.rows[0]);
        
        // テーブル一覧を取得
        pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `, (err, res) => {
            if (err) {
                console.error('Error fetching tables:', err);
            } else {
                console.log('Available tables:', res.rows.map(row => row.table_name));
                
                // GameRecordテーブルのカラム情報を取得
                pool.query(`
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'GameRecord' AND table_schema = 'public'
                `, (err, res) => {
                    if (err) {
                        console.error('Error fetching GameRecord columns:', err);
                    } else {
                        console.log('GameRecord columns:', res.rows);
                    }
                });
            }
        });
    }
});

// Part 2: ExpressとSocket.IOの初期設定
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Part 3: ミドルウェアとルート設定
app.use(express.json());

// ★★★ ルートURLの処理を、静的ファイル配信より「前」に書きます ★★★
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 静的ファイル配信 (ルートURL処理の「後」に置きます)
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

        // ★★★ アクション直後にゲーム状態を更新・送信 ★★★
        broadcastGameState(roomId);

        // --- 以下、ラウンド終了の判定 ---
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
                // ★ 次のプレイヤーのターンであることも送信
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

    // 公開する手札を初期化
    gameState.showdownHands = {};

    // --- フォールド時の処理 ---
    if (reason === 'fold') {
        winner.chips += gameState.pot;
        gameState.phase = 'showdown'; // フェーズは常に'showdown'
        gameState.message = `${loser.name}がフォールドしました。${winner.name}がポットを獲得。`;
        // フォールド時は、勝者のカードは公開、敗者のカードは非公開('?')
        gameState.showdownHands = {
            [winner.id]: winner.hand[0],
            [loser.id]: '?'
        };
    } else {
        // --- ショーダウン時の処理 ---
        winner.chips += gameState.pot;
        gameState.phase = 'showdown';
        gameState.message = `${winner.name}が勝利しました！`;
        // ショーダウン時は、両方のプレイヤーのカードを公開
        gameState.showdownHands = {
            [winner.id]: winner.hand[0],
            [loser.id]: loser.hand[0]
        };
    }

    // データベースに保存
    try {
        const winnerRecord = await prisma.user.findUnique({ where: { name: winner.name } });
        const loserRecord = await prisma.user.findUnique({ where: { name: loser.name } });
        if (winnerRecord && loserRecord) {
            await prisma.gameRecord.create({
                data: {
                    winnerId: winnerRecord.id,
                    loserId: loserRecord.id,
                    winnerHand: winner.hand[0] || '?',
                    loserHand: loser.hand[0] || '?',
                    actions: gameState.actions.join(', '),
                    roomId: roomId
                }
            });
        }
    } catch (error) {
        console.error('データベースへのゲーム履歴記録に失敗しました:', error);
    }

    // 全プレイヤーにゲーム状態を送信
    io.to(roomId).emit('gameState', gameState);
}

function startNewRound(roomId) {
    const gameState = activeGames[roomId];
    if (!gameState || !gameState.players || gameState.players.length < 2) return;

    console.log(`${roomId}で新しいラウンドを開始します。`);
    const deck = shuffle(createDeck());
    gameState.isPlayerFirst = !gameState.isPlayerFirst;
    
    // ★★★ ここからが新しいルールです ★★★
    
    // 1. 各プレイヤーの手持ちチップを「1」に設定
    gameState.players.forEach((p) => {
        p.chips = 1; // 手持ちチップを1にする
        p.hand = deal(deck, 1);
        p.bet = 0;   // このラウンドでまだ支払っていないのでベット額は「0」
        p.hasActed = false;
        p.isFolded = false;
    });
    
    // 2. ポットは最初から2チップで始まる
    gameState.pot = 2; 
    
    // ★★★ ここまで ★★★
    
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

app.post('/api/login', async (req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            return res.status(400).json({ error: 'ユーザー名とパスワードは必須です。' });
        }
        const user = await prisma.user.findUnique({
            where: { name: name },
        });
        if (!user) {
            return res.status(404).json({ error: 'ユーザーが存在しません。' });
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'パスワードが間違っています。' });
        }
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
            // take: 20,
        });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

app.get('/api/game-history/:roomId', async (req, res) => {
    try {
        // roomIdフィールドが復活したため、ルーム別戦績を返す
        const records = await prisma.gameRecord.findMany({
            where: { roomId: req.params.roomId },
            orderBy: { createdAt: 'desc' },
            include: {
                winner: { select: { name: true } },
                loser: { select: { name: true } },
            },
        });
        res.json(records);
    } catch (error) {
        console.error('ルーム別戦績取得エラー:', error);
        res.status(500).json({ error: 'サーバーエラー' });
    }
});

// Part 8: サーバーの起動
server.listen(port, () => {
    console.log(`サーバーが http://localhost:${port} で起動しました`);
});