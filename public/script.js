// public/script.js (オンライン対戦用の新しいコード)

'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // Part 1: サーバーへの接続とHTML要素の取得
    // =========================================================
    const socket = io(); // この一行でサーバーに接続します
    let myPlayerId = null; // サーバーから自分のIDを教えてもらうための変数

    // ロビー画面の要素
    const lobbyScreen = document.getElementById('lobby-screen');
    const findGameButton = document.getElementById('find-game-button');
    const statusMessage = document.getElementById('status-message');

    // ゲーム画面の要素
    const gameContainer = document.getElementById('main-game-container');
    const playerHand = document.getElementById('player-hand');
    const opponentHand = document.getElementById('opponent-hand');
    const playerInfo = document.querySelector('#player-ai-controls'); // プレイヤー情報表示エリア
    const opponentInfo = document.querySelector('#opponent-ai-controls'); // 相手情報表示エリア
    const potAmount = document.getElementById('pot-amount');
    const messageArea = document.getElementById('message-area');
    const betButton = document.getElementById('bet-button');
    const checkButton = document.getElementById('check-button');
    const callButton = document.getElementById('call-button');
    const foldButton = document.getElementById('fold-button');
    const actionsContainer = document.getElementById('actions');
    
    // =========================================================
    // Part 2: サーバーにイベントを送信する処理 (emit)
    // =========================================================

    // 「対戦相手を探す」ボタンがクリックされたときの処理
    if (findGameButton) {
        findGameButton.addEventListener('click', () => {
            socket.emit('findGame');
            findGameButton.disabled = true;
            if(statusMessage) statusMessage.textContent = 'サーバーに接続し、相手を探しています...';
        });
    }

    // ゲームのアクションボタンが押されたときの処理
    betButton.addEventListener('click', () => socket.emit('playerAction', { action: 'bet' }));
    checkButton.addEventListener('click', () => socket.emit('playerAction', { action: 'check' }));
    callButton.addEventListener('click', () => socket.emit('playerAction', { action: 'call' }));
    foldButton.addEventListener('click', () => socket.emit('playerAction', { action: 'fold' }));


    // =========================================================
    // Part 3: サーバーからのイベントを受信する処理 (on)
    // =========================================================

    // サーバーから自分のIDを教えてもらう
    socket.on('assignId', (id) => {
        myPlayerId = id;
    });

    // サーバーから「ゲーム開始」または「状態更新」の通知が来たら、画面を再描画する
    socket.on('gameStart', renderGame);
    socket.on('gameStateUpdate', renderGame);

    // サーバーからステータスメッセージが届いたら
    socket.on('statusUpdate', (message) => {
        if(statusMessage) statusMessage.textContent = message;
    });


    // =========================================================
    // Part 4: ゲーム画面を描画する関数
    // =========================================================
    function renderGame(state) {
        console.log("サーバーから新しいゲーム状態を受信:", state);
        if (!state || !state.players) return;

        // ロビーを隠してゲーム画面を表示
        if(lobbyScreen) lobbyScreen.style.display = 'none';
        if(gameContainer) gameContainer.style.display = 'block';

        // 自分のIDを保存（初回のみ）
        if (state.myId) myPlayerId = state.myId;

        const me = state.players.find(p => p.id === myPlayerId);
        const opponent = state.players.find(p => p.id !== myPlayerId);

        if (!me || !opponent) return;

        // プレイヤー情報（名前とチップ）
        playerInfo.innerHTML = `あなた (${me.name})<br>チップ: ${me.chips}`;
        opponentInfo.innerHTML = `相手 (${opponent.name})<br>チップ: ${opponent.chips}`;
        
        // カードの表示
        playerHand.innerHTML = `<div class="card">${me.hand[0]}</div>`;
        opponentHand.innerHTML = `<div class="card ${state.phase === 'showdown' ? '' : 'facedown'}">${state.phase === 'showdown' ? opponent.hand[0] : ''}</div>`;

        // ポットとメッセージ
        potAmount.textContent = state.pot;
        messageArea.textContent = state.message;
        
        // アクションボタンの表示制御
        const isMyTurn = state.players[state.turnIndex]?.id === myPlayerId;
        actionsContainer.classList.toggle('hidden', !isMyTurn || state.phase !== 'betting');

        if(isMyTurn) {
             // 相手がベットしてきたか？
            const opponentBet = opponent.bet > me.bet;
            betButton.classList.toggle('hidden', opponentBet);
            checkButton.classList.toggle('hidden', opponentBet);
            callButton.classList.toggle('hidden', !opponentBet);
            foldButton.classList.toggle('hidden', !opponentBet);
        }
    }

});