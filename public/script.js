'use strict';

document.addEventListener('DOMContentLoaded', () => {

    let socket; // 複数の関数で使えるように、外側で宣言

    // =========================================================
    // 1. HTML要素の取得 & 2. モード選択
    // =========================================================
    const lobbyScreen = document.getElementById('lobby-screen');
    const mainContainer = document.querySelector('.container');
    const matchmakingScreen = document.getElementById('matchmaking-screen');
    const navTabs = document.querySelector('.nav-tabs');
    const contentScreens = document.querySelectorAll('.content-screen');

    // --- モード選択関連の要素 ---
    const statusMessage = document.getElementById('status-message');
    const modeSelectionArea = document.getElementById('mode-selection-area');
    const friendMatchArea = document.getElementById('friend-match-area');

    // --- ボタン要素 ---
    const randomMatchButton = document.getElementById('random-match-button');
    const friendMatchButton = document.getElementById('friend-match-button');
    const findAiButton = document.getElementById('find-ai-button');
    const backToModeSelectButton = document.getElementById('back-to-mode-select-button');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const cancelMatchmakingButton = document.getElementById('cancel-matchmaking-button');

    // --- フレンドマッチ用UI要素 ---
    const roomIdInput = document.getElementById('room-id-input');
    const roomInfo = document.getElementById('room-info');


    // --- モード選択ボタンのクリック処理 ---

    // 「ランダムマッチ」ボタン
    randomMatchButton.addEventListener('click', () => {
        lobbyScreen.style.display = 'none';
        matchmakingScreen.style.display = 'flex';
        startMatchmaking(); // ランダムマッチング処理を開始
    });

    // 「フレンドと対戦」ボタン
    friendMatchButton.addEventListener('click', () => {
        modeSelectionArea.style.display = 'none';
        friendMatchArea.style.display = 'block';
    });

    // 「戻る」ボタン
    backToModeSelectButton.addEventListener('click', () => {
        friendMatchArea.style.display = 'none';
        modeSelectionArea.style.display = 'block';
    });

    // 「AIと対戦」ボタン
    findAiButton.addEventListener('click', () => {
        lobbyScreen.style.display = 'none';
        mainContainer.style.display = 'flex';
        initializeOfflineMode(); // オフラインモードを初期化
    });

    // =========================================================
    // 3. オンラインモード (PvP) のロジック
    // =========================================================
    /**
     * Socket.IOに接続し、サーバーからのイベントリスナーを設定する共通関数
     */
    function connectAndSetupListeners() {
        if (socket && socket.connected) {
            return; // すでに接続済みの場合は何もしない
        }

        socket = io(); // サーバーに接続

        // サーバーからエラーが送られてきた時の処理
        socket.on('gameError', (message) => {
            alert('エラー: ' + message);
            window.location.reload(); // エラー時はリロードして初期状態に戻す
        });

        // 部屋が正常に作成された時の処理
        socket.on('roomCreated', (roomId) => {
            statusMessage.textContent = '相手の参加を待っています...';
            roomInfo.innerHTML = `部屋ID: <strong>${roomId}</strong><br>このIDを友達に教えてください。`;
            // ボタンを無効化して、待機中であることを示す
            createRoomButton.disabled = true;
            joinRoomButton.disabled = true;
            roomIdInput.disabled = true;
        });

        // マッチングが成功し、ゲーム状態が送られてきた時の処理
        socket.on('gameStateUpdate', (state) => {
            initializeOnlineMode(state); // ゲーム画面の初期化と描画に移る
        });
    }

    /**
     * ランダムマッチングを開始する関数
     */
    function startMatchmaking() {
        connectAndSetupListeners(); // 接続とリスナー設定
        const username = "Player" + Math.floor(Math.random() * 1000);
        socket.emit('findGame', { username: username }); // サーバーに「ランダム対戦探してます」と伝える

        // キャンセルボタンが押された時の処理
        cancelMatchmakingButton.onclick = () => {
            socket.emit('cancelFindGame');
            socket.disconnect();
            matchmakingScreen.style.display = 'none';
            lobbyScreen.style.display = 'flex';
        };
    }

    // 「部屋を作る」ボタンのクリック処理
    createRoomButton.addEventListener('click', () => {
        connectAndSetupListeners();
        const username = "Player" + Math.floor(Math.random() * 1000);
        socket.emit('createRoom', { username: username }); // サーバーに「部屋作って」と伝える
    });

    // 「部屋に入る」ボタンのクリック処理
    joinRoomButton.addEventListener('click', () => {
        const roomId = roomIdInput.value.trim();
        if (!roomId) {
            alert('部屋IDを入力してください。');
            return;
        }
        connectAndSetupListeners();
        const username = "Player" + Math.floor(Math.random() * 1000);
        socket.emit('joinRoom', { roomId: roomId, username: username }); // サーバーに「この部屋入ります」と伝える
    });


    /**
     * マッチングが成功した後、ゲーム画面を初期化して最初の状態を描画する関数
     * (この関数の中身は変更ありません)
     */
    function initializeOnlineMode(initialState) {
        // ... (この中のコードは変更なしなので、元のままでOKです)
        matchmakingScreen.style.display = 'none';
        lobbyScreen.style.display = 'none'; // 念のためロビーも隠す
        friendMatchArea.style.display = 'none'; // フレンドマッチエリアも隠す
        mainContainer.style.display = 'flex';

        // (以下、元のrenderOnlineGameを含むロジックをそのままペースト)
        const onlinePlayerName = document.querySelector('#player-ai-controls');
        const onlineOpponentName = document.querySelector('#opponent-ai-controls');
        const onlinePlayerHand = document.getElementById('player-hand');
        const onlineOpponentHand = document.getElementById('opponent-hand');
        const onlinePot = document.querySelector('#pot-area #pot-amount');
        const onlineMessage = document.querySelector('#game-table #message-area');
        const onlineActions = document.querySelector('#game-table #actions');
        
        socket.off('gameStateUpdate'); 
        socket.on('gameStateUpdate', renderOnlineGame);
        
        document.getElementById('bet-button').onclick = () => socket.emit('playerAction', { action: 'bet' });
        document.getElementById('check-button').onclick = () => socket.emit('playerAction', { action: 'check' });
        document.getElementById('call-button').onclick = () => socket.emit('playerAction', { action: 'call' });
        document.getElementById('fold-button').onclick = () => socket.emit('playerAction', { action: 'fold' });
        
        renderOnlineGame(initialState);

        function renderOnlineGame(state) {
            if (!state || !state.players) return;
            const myId = socket.id;
            const me = state.players.find(p => p.id === myId);
            const opponent = state.players.find(p => p.id !== myId);
            if (!me || !opponent) return;

            onlinePlayerName.innerHTML = `<strong>あなた (${me.name})</strong><br>チップ: ${me.chips}`;
            onlineOpponentName.innerHTML = `<strong>相手 (${opponent.name})</strong><br>チップ: ${opponent.chips}`;
            onlinePlayerHand.innerHTML = `<div class="card">${me.hand[0]}</div>`;
            
            const opponentCardClass = state.phase === 'showdown' || state.phase === 'fold' ? '' : 'facedown';
            const opponentCardValue = state.phase === 'showdown' || state.phase === 'fold' ? opponent.hand[0] : '';
            onlineOpponentHand.innerHTML = `<div class="card ${opponentCardClass}">${opponentCardValue}</div>`;

            onlinePot.textContent = state.pot;
            onlineMessage.textContent = state.message;

            const isMyTurn = state.players[state.turnIndex]?.id === myId;
            // アクションボタン全体の表示/非表示を更新
            const actionsContainer = document.getElementById('actions');
            const newGameButton = document.getElementById('new-game-button');

            // オンラインモードではnewGameButtonはサーバー制御に任せる想定なので、基本的には隠す
            newGameButton.classList.add('hidden'); 
            
            if(state.phase === 'betting' && isMyTurn) {
                actionsContainer.classList.remove('hidden');
                const opponentHasBet = opponent.bet > me.bet;
                document.getElementById('bet-button').classList.toggle('hidden', opponentHasBet);
                document.getElementById('check-button').classList.toggle('hidden', opponentHasBet);
                document.getElementById('call-button').classList.toggle('hidden', !opponentHasBet);
                document.getElementById('fold-button').classList.toggle('hidden', !opponentHasBet);
            } else {
                actionsContainer.classList.add('hidden');
            }
        }
    }
    
    // =========================================================
    // 4. オフラインモード (PvAI) & シミュレーターのロジック
    // =========================================================
    function initializeOfflineMode() {
        const elements = {
            playerAiTypeSelect: document.getElementById('player-ai-type'),
            opponentAiTypeSelect: document.getElementById('opponent-ai-type'),
            playerChipsSpan: document.getElementById('player-chips'),
            opponentChipsSpan: document.getElementById('opponent-chips'),
            potAmountSpan: document.querySelector('#pot-area #pot-amount'),
            playerHandDiv: document.getElementById('player-hand'),
            opponentHandDiv: document.getElementById('opponent-hand'),
            messageArea: document.querySelector('#game-table #message-area'),
            actionsDiv: document.getElementById('actions'),
            betButton: document.getElementById('bet-button'),
            checkButton: document.getElementById('check-button'),
            callButton: document.getElementById('call-button'),
            foldButton: document.getElementById('fold-button'),
            newGameButton: document.getElementById('new-game-button'),
            playerWinsSpan: document.getElementById('player-wins'),
            opponentWinsSpan: document.getElementById('opponent-wins'),
            playerEvSpan: document.getElementById('player-ev'),
            simPlayer1Select: document.getElementById('sim-player1-ai'),
            simPlayer2Select: document.getElementById('sim-player2-ai'),
            simGameCountInput: document.getElementById('sim-game-count'),
            startSimButton: document.getElementById('start-simulation-button'),
            simResultsDiv: document.getElementById('simulator-results'),
            simResultTextDiv: document.getElementById('sim-result-text'),
            simEvChartCanvas: document.getElementById('sim-ev-chart'),
            simP1StrategyCard: document.getElementById('sim-p1-strategy-card'),
            simP2StrategyCard: document.getElementById('sim-p2-strategy-card'),
            strategyDetailsOverlay: document.getElementById('strategy-details-overlay'),
            simulatorScreen: document.getElementById('simulator-screen'),
        };

        const CARDS = { 'A': 3, 'K': 2, 'Q': 1 };
        const DECK = ['A', 'K', 'Q'];
        let player, opponent, pot, isPlayerTurn;
        let stats = { playerWins: 0, opponentWins: 0, totalEv: 0, gamesPlayed: 0 };
        let simChart = null; 

        const aiProfiles = {
            gto: { name: "GTO AI", s1_a_bet: 0.333, s1_k_bet: 0.0, s1_q_bet: 0.333, s1_a_call: 1.0, s1_k_call: 0.0, s1_q_call: 0.0, s2_a_bet: 1.0, s2_k_bet: 0.0, s2_q_bet: 0.333, s2_a_call: 1.0, s2_k_call: 0.333, s2_q_call: 0.0 },
            kensjitsu: { name: "堅実", s1_a_bet: 0.8, s1_k_bet: 0.0, s1_q_bet: 0.1, s1_a_call: 1.0, s1_k_call: 0.1, s1_q_call: 0.0, s2_a_bet: 1.0, s2_k_bet: 0.0, s2_q_bet: 0.1, s2_a_call: 1.0, s2_k_call: 0.2, s2_q_call: 0.0 },
            kiai: { name: "気合", s1_a_bet: 1.0, s1_k_bet: 0.8, s1_q_bet: 0.7, s1_a_call: 1.0, s1_k_call: 0.9, s1_q_call: 0.8, s2_a_bet: 1.0, s2_k_bet: 0.8, s2_q_bet: 0.7, s2_a_call: 1.0, s2_k_call: 0.9, s2_q_call: 0.8 },
            mitaiman: { name: "見たいマン", s1_a_bet: 0.2, s1_k_bet: 0.1, s1_q_bet: 0.0, s1_a_call: 1.0, s1_k_call: 0.9, s1_q_call: 0.9, s2_a_bet: 0.2, s2_k_bet: 0.1, s2_q_bet: 0.0, s2_a_call: 1.0, s2_k_call: 0.9, s2_q_call: 0.9 },
            tightaggressive: { name: "タイトアグレ", s1_a_bet: 1.0, s1_k_bet: 0.1, s1_q_bet: 0.8, s1_a_call: 1.0, s1_k_call: 0.0, s1_q_call: 0.0, s2_a_bet: 1.0, s2_k_bet: 0.1, s2_q_bet: 0.8, s2_a_call: 1.0, s2_k_call: 0.0, s2_q_call: 0.0 },
        };
        
        function initializeGame() {
            player = { name: 'あなた', type: elements.playerAiTypeSelect.value, chips: 100, hand: null, bet: 0, isFolded: false, hasActed: false };
            opponent = { name: '相手 (CPU)', type: elements.opponentAiTypeSelect.value, chips: 100, hand: null, bet: 0, isFolded: false, hasActed: false };
            stats = { playerWins: 0, opponentWins: 0, totalEv: 0, gamesPlayed: 0 };
            startNewHand();
        }

        function startNewHand() {
            if (player.chips <= 0 || opponent.chips <= 0) {
                 elements.messageArea.textContent = "チップがなくなりました。新しいゲームを開始します。";
                 initializeGame();
                 return;
            }

            const deck = [...DECK].sort(() => Math.random() - 0.5);
            player.hand = deck.pop();
            opponent.hand = deck.pop();
            
            player.chips -= 1;
            opponent.chips -= 1;
            pot = 2;
            
            player.bet = 1;
            opponent.bet = 1;
            player.isFolded = false;
            opponent.isFolded = false;
            player.hasActed = false;
            opponent.hasActed = false;
            
            isPlayerTurn = true;

            updateUI();
            elements.newGameButton.classList.add('hidden');
            elements.actionsDiv.classList.remove('hidden');

            if (player.type !== 'human') {
                handleAiTurn(player);
            }
        }

        function updateUI() {
            elements.playerChipsSpan.textContent = player.chips;
            elements.opponentChipsSpan.textContent = opponent.chips;
            elements.potAmountSpan.textContent = pot;
            elements.playerHandDiv.innerHTML = `<div class="card">${player.hand}</div>`;
            elements.opponentHandDiv.innerHTML = `<div class="card facedown"></div>`;
            
            elements.playerWinsSpan.textContent = stats.playerWins;
            elements.opponentWinsSpan.textContent = stats.opponentWins;
            elements.playerEvSpan.textContent = (stats.totalEv / (stats.gamesPlayed || 1)).toFixed(2);

            if (isPlayerTurn && player.type === 'human') {
                const canCheck = player.bet === opponent.bet;
                elements.betButton.classList.toggle('hidden', !canCheck);
                elements.checkButton.classList.toggle('hidden', !canCheck);
                elements.callButton.classList.toggle('hidden', canCheck);
                elements.foldButton.classList.toggle('hidden', canCheck);
                elements.messageArea.textContent = "あなたのアクションを選択してください。";
            }
        }
        
        function handlePlayerAction(action) {
            if (!isPlayerTurn || player.type !== 'human') return;
            performAction(player, opponent, action);
        }

        function handleAiTurn(aiPlayer) {
            setTimeout(() => {
                const otherPlayer = aiPlayer === player ? opponent : player;
                const action = getAIAction(aiPlayer, otherPlayer);
                performAction(aiPlayer, otherPlayer, action);
            }, 1000);
        }

        function performAction(actor, other, action) {
            actor.hasActed = true;
            let betAmount = 1;

            switch (action) {
                case 'bet':
                    actor.chips -= betAmount;
                    actor.bet += betAmount;
                    pot += betAmount;
                    break;
                case 'call':
                    const callAmount = other.bet - actor.bet;
                    actor.chips -= callAmount;
                    actor.bet += callAmount;
                    pot += callAmount;
                    break;
                case 'fold':
                    actor.isFolded = true;
                    break;
                case 'check':
                    break;
            }

            const betsAreEqual = player.bet === opponent.bet;
            const bothHaveActed = player.hasActed && opponent.hasActed;

            if (actor.isFolded) {
                endHand(other);
            } else if (betsAreEqual && bothHaveActed) {
                showdown();
            } else if ((action === 'check' || action === 'bet') && !other.hasActed) {
                 isPlayerTurn = !isPlayerTurn;
                 const nextPlayer = isPlayerTurn ? player : opponent;
                 elements.messageArea.textContent = `${nextPlayer.name}のターンです。`;
                 if (nextPlayer.type !== 'human') handleAiTurn(nextPlayer);
                 else updateUI();
            } else {
                showdown();
            }
        }

        function showdown() {
            const winner = CARDS[player.hand] > CARDS[opponent.hand] ? player : opponent;
            endHand(winner, true);
        }

        function endHand(winner, wasShowdown = false) {
            stats.gamesPlayed++;
            let profit = 0;

            if (winner === player) {
                stats.playerWins++;
                profit = pot - player.bet;
                player.chips += pot;
                elements.messageArea.textContent = `あなたの勝利！ ${pot}チップを獲得。`;
            } else {
                stats.opponentWins++;
                profit = -player.bet;
                opponent.chips += pot;
                elements.messageArea.textContent = `相手の勝利！ ${pot}を獲得。`;
            }
            stats.totalEv += profit;

            if (wasShowdown) {
                elements.opponentHandDiv.innerHTML = `<div class="card">${opponent.hand}</div>`;
            }
            
            updateUI();
            elements.actionsDiv.classList.add('hidden');
            elements.newGameButton.classList.remove('hidden');
        }

        function getAIAction(ai, otherPlayer) {
            const aiType = ai.type;
            const settings = aiProfiles[aiType];
            if (!settings) return 'check'; 

            const card = ai.hand;
            const cardKey = card.toLowerCase();
            const opponentHasBet = otherPlayer.bet > ai.bet;
            
            if (opponentHasBet) {
                const callProbKey = `s2_${cardKey}_call`;
                return (Math.random() < settings[callProbKey]) ? 'call' : 'fold';
            } 
            else {
                const betProbKey = `s1_${cardKey}_bet`;
                return (Math.random() < settings[betProbKey]) ? 'bet' : 'check';
            }
        }
        
        elements.betButton.addEventListener('click', () => handlePlayerAction('bet'));
        elements.checkButton.addEventListener('click', () => handlePlayerAction('check'));
        elements.callButton.addEventListener('click', () => handlePlayerAction('call'));
        elements.foldButton.addEventListener('click', () => handlePlayerAction('fold'));
        elements.newGameButton.addEventListener('click', startNewHand);
        
        elements.playerAiTypeSelect.addEventListener('change', (e) => {
            player.type = e.target.value;
            initializeGame();
        });
        elements.opponentAiTypeSelect.addEventListener('change', (e) => {
            opponent.type = e.target.value;
            initializeGame();
        });

        // initializeOfflineMode 関数の中
        navTabs.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.nav-tab');
            if (!clickedTab) return;
            
            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
            contentScreens.forEach(screen => screen.classList.remove('active'));
            
            const screenId = clickedTab.dataset.screen;
            document.getElementById(screenId).classList.add('active');
            clickedTab.classList.add('active');
        });
        
        /**
         * サーバーからゲーム履歴を取得して画面に表示する関数
         */
        async function loadAndDisplayGameHistory() {
            const replayList = document.getElementById('replay-list');
            if (!replayList) return; // リスト要素がなければ何もしない

            try {
                const response = await fetch('/api/game-history');
                if (!response.ok) {
                    throw new Error('ゲーム履歴の取得に失敗しました。');
                }
                const records = await response.json();

                replayList.innerHTML = ''; // リストを一旦空にする

                if (records.length === 0) {
                    replayList.innerHTML = '<li>まだ対戦履歴がありません。</li>';
                    return;
                }

                records.forEach(record => {
                    const listItem = document.createElement('li');

                    // 表示する日時のフォーマット
                    const gameDate = new Date(record.createdAt).toLocaleString('ja-JP');

                    // li要素の中身を作成
                    listItem.innerHTML = `
                        <div class="replay-info">
                            <span style="color: #aaa; font-size: 0.9em;">${gameDate}</span><br>
                            <strong>${record.winner.name}</strong> (手札: ${record.winnerHand}) vs <strong>${record.loser.name}</strong> (手札: ${record.loserHand})
                        </div>
                        <div class="replay-result win">
                            ${record.actions}
                        </div>
                    `;
                    replayList.appendChild(listItem);
                });

            } catch (error) {
                console.error(error);
                replayList.innerHTML = '<li>履歴の読み込み中にエラーが発生しました。</li>';
            }
        }
        
        // --- 初期化処理 ---
        const firstTab = navTabs.querySelector('.nav-tab');
        const firstScreenId = firstTab.dataset.screen;
        document.getElementById(firstScreenId).classList.add('active');
        firstTab.classList.add('active');

        if (document.getElementById('main-game-screen').classList.contains('active')) {
             initializeOfflineMode();
        }
    }
    function initializeSimulator() {
        
        function populateAiSelectors() {
            const aiOptions = Object.keys(aiProfiles).map(key => `<option value="${key}">${aiProfiles[key].name}</option>`).join('');
            elements.simPlayer1Select.innerHTML = aiOptions;
            elements.simPlayer2Select.innerHTML = aiOptions;
            elements.simPlayer1Select.value = 'kensjitsu';
            elements.simPlayer2Select.value = 'gto';
        }

        function calculateAiTendencies(aiSettings) {
            const betKeys = ['s1_a_bet', 's1_k_bet', 's1_q_bet', 's2_a_bet', 's2_k_bet', 's2_q_bet'];
            const callKeys = ['s1_a_call', 's1_k_call', 's1_q_call', 's2_a_call', 's2_k_call', 's2_q_call'];
            const bluffKeys = ['s1_q_bet', 's2_q_bet'];
            const betSum = betKeys.reduce((sum, key) => sum + (aiSettings[key] || 0), 0);
            const callSum = callKeys.reduce((sum, key) => sum + (aiSettings[key] || 0), 0);
            const bluffSum = bluffKeys.reduce((sum, key) => sum + (aiSettings[key] || 0), 0);
            return {
                betFreq: (betSum / betKeys.length) * 100,
                callFreq: (callSum / callKeys.length) * 100,
                bluffFreq: (bluffSum / bluffKeys.length) * 100,
            };
        }

        function displayAiStrategyCard(containerElement, aiSettings, aiName, detailsId) {
            const tendencies = calculateAiTendencies(aiSettings);
            containerElement.innerHTML = ''; 

            const title = document.createElement('h4');
            title.textContent = aiName;
            containerElement.appendChild(title);

            const createMeter = (labelText, value, color) => {
                const meterDiv = document.createElement('div');
                meterDiv.className = 'tendency-meter';
                meterDiv.innerHTML = `
                    <label>${labelText}</label>
                    <div class="meter-bar-container">
                        <div class="meter-bar" style="width: ${value.toFixed(1)}%; background-color: ${color || ''};">
                            ${value.toFixed(1)}%
                        </div>
                    </div>
                `;
                return meterDiv;
            };

            containerElement.appendChild(createMeter('ベット頻度', tendencies.betFreq, '#76c7c0'));
            containerElement.appendChild(createMeter('コール頻度 (vs ベット)', tendencies.callFreq, '#f0ad4e'));
            containerElement.appendChild(createMeter('ブラフ頻度 (Qでベット)', tendencies.bluffFreq, '#d9534f'));

            const detailsButton = document.createElement('button');
            detailsButton.className = 'action-button view-details-button';
            detailsButton.dataset.detailsId = detailsId;
            detailsButton.textContent = '詳細な戦略';
            containerElement.appendChild(detailsButton);
        }

        function showStrategyDetails(aiSettings, aiName) {
            const toPercent = (val) => `${(val * 100).toFixed(1)}%`;
            const tableHTML = `
            <div class="strategy-details-content">
                <h3>${aiName}の戦略詳細</h3>
                <table class="strategy-table">
                    <thead>
                        <tr><th>状況</th><th>カード</th><th>行動確率</th></tr>
                    </thead>
                    <tbody>
                        <tr><td rowspan="3">先行: 初手</td><td>A</td><td>ベット: ${toPercent(aiSettings.s1_a_bet)}</td></tr>
                        <tr><td>K</td><td>ベット: ${toPercent(aiSettings.s1_k_bet)}</td></tr>
                        <tr><td>Q</td><td>ベット: ${toPercent(aiSettings.s1_q_bet)}</td></tr>
                        <tr><td rowspan="3">先行: C→相手B</td><td>A</td><td>コール: ${toPercent(aiSettings.s1_a_call)}</td></tr>
                        <tr><td>K</td><td>コール: ${toPercent(aiSettings.s1_k_call)}</td></tr>
                        <tr><td>Q</td><td>コール: ${toPercent(aiSettings.s1_q_call)}</td></tr>
                        <tr><td rowspan="3">後攻: 相手C</td><td>A</td><td>ベット: ${toPercent(aiSettings.s2_a_bet)}</td></tr>
                        <tr><td>K</td><td>ベット: ${toPercent(aiSettings.s2_k_bet)}</td></tr>
                        <tr><td>Q</td><td>ベット: ${toPercent(aiSettings.s2_q_bet)}</td></tr>
                        <tr><td rowspan="3">後攻: 相手B</td><td>A</td><td>コール: ${toPercent(aiSettings.s2_a_call)}</td></tr>
                        <tr><td>K</td><td>コール: ${toPercent(aiSettings.s2_k_call)}</td></tr>
                        <tr><td>Q</td><td>コール: ${toPercent(aiSettings.s2_q_call)}</td></tr>
                    </tbody>
                </table>
                <button class="close-overlay-button">閉じる</button>
            </div>`;
            
            elements.strategyDetailsOverlay.innerHTML = tableHTML;
            elements.strategyDetailsOverlay.classList.add('active');
            
            elements.strategyDetailsOverlay.querySelector('.close-overlay-button').addEventListener('click', () => {
                elements.strategyDetailsOverlay.classList.remove('active');
            });
        }

        function updateSimulatorStrategyDisplay() {
                const p1AiKey = elements.simPlayer1Select.value;
                const p2AiKey = elements.simPlayer2Select.value;
                const p1Settings = aiProfiles[p1AiKey];
                const p2Settings = aiProfiles[p2AiKey];
                displayAiStrategyCard(elements.simP1StrategyCard, p1Settings, p1Settings.name, 'p1');
                displayAiStrategyCard(elements.simP2StrategyCard, p2Settings, p2Settings.name, 'p2');
        }

        function getPayoff(p1Card, p2Card, p1Settings, p2Settings, isP1First) {
            const isP1Winner = CARDS[p1Card] > CARDS[p2Card];
            const p1CardKey = p1Card.toLowerCase();
            const p2CardKey = p2Card.toLowerCase();

            const firstActor = isP1First ? p1Settings : p2Settings;
            const secondActor = isP1First ? p2Settings : p1Settings;
            const firstCardKey = isP1First ? p1CardKey : p2CardKey;
            const secondCardKey = isP1First ? p2CardKey : p1CardKey;

            const prob_first_bet = firstActor[`s1_${firstCardKey}_bet`];
            const prob_first_check = 1 - prob_first_bet;

            const prob_second_bet_after_check = secondActor[`s2_${secondCardKey}_bet`];
            const prob_second_check_after_check = 1 - prob_second_bet_after_check;

            const prob_first_call = firstActor[`s1_${firstCardKey}_call`];
            const prob_first_fold = 1 - prob_first_call;
            
            const prob_second_call = secondActor[`s2_${secondCardKey}_call`];
            const prob_second_fold = 1 - prob_second_call;

            let ev = 0;
            const payoff_bet_call = isP1Winner ? 2 : -2;
            const payoff_bet_fold = 1;
            const ev_after_bet = prob_second_call * payoff_bet_call + prob_second_fold * payoff_bet_fold;
            
            const payoff_check_check = isP1Winner ? 1 : -1;
            const payoff_check_bet_call = isP1Winner ? 2 : -2;
            const payoff_check_bet_fold = -1;
            const ev_after_check_bet = prob_first_call * payoff_check_bet_call + prob_first_fold * payoff_check_bet_fold;
            const ev_after_check = prob_second_check_after_check * payoff_check_check + prob_second_bet_after_check * ev_after_check_bet;

            ev = prob_first_bet * ev_after_bet + prob_first_check * ev_after_check;
            
            return isP1First ? ev : -ev;
        }

        function calculateTheoreticalEV(p1Settings, p2Settings) {
            let totalEv = 0;
            const cardPairs = [['A', 'K'], ['A', 'Q'], ['K', 'A'], ['K', 'Q'], ['Q', 'A'], ['Q', 'K']];

            for (const [p1Card, p2Card] of cardPairs) {
                totalEv += getPayoff(p1Card, p2Card, p1Settings, p2Settings, true);
                totalEv += getPayoff(p1Card, p2Card, p1Settings, p2Settings, false);
            }
            
            return totalEv / 12.0;
        }

        function runSimulation(p1Type, p2Type, numGames) {
            elements.startSimButton.disabled = true;
            elements.startSimButton.textContent = 'シミュレーション実行中...';
            elements.simResultsDiv.classList.add('hidden');

            setTimeout(() => {
                const p1Settings = aiProfiles[p1Type];
                const p2Settings = aiProfiles[p2Type];
                let p1Wins = 0;
                let p1TotalProfit = 0;
                const evHistory = [];

                for (let i = 0; i < numGames; i++) {
                    const { winner, profit } = simulateHand(p1Settings, p2Settings);
                    if (winner === 'p1') {
                        p1Wins++;
                    }
                    p1TotalProfit += profit;
                    evHistory.push(p1TotalProfit / (i + 1));
                }
                
                const theoreticalEV = calculateTheoreticalEV(p1Settings, p2Settings);
                displaySimulationResults(p1Settings, p2Settings, p1Wins, numGames, p1TotalProfit, evHistory, theoreticalEV);
                
                elements.startSimButton.disabled = false;
                elements.startSimButton.textContent = 'シミュレーション開始';
            }, 100);
        }

        function simulateHand(p1, p2) {
            const deck = [...DECK].sort(() => Math.random() - 0.5);
            const p1Card = deck[0];
            const p2Card = deck[1];
            let pot = 2;
            let p1Invested = 1;
            
            const p1BetProb = p1[`s1_${p1Card.toLowerCase()}_bet`];
            const p1Action = Math.random() < p1BetProb ? 'bet' : 'check';

            if (p1Action === 'check') {
                const p2BetProb = p2[`s2_${p2Card.toLowerCase()}_bet`];
                const p2Action = Math.random() < p2BetProb ? 'bet' : 'check';
                if (p2Action === 'bet') {
                    pot++;
                    const p1CallProb = p1[`s1_${p1Card.toLowerCase()}_call`];
                    const p1Response = Math.random() < p1CallProb ? 'call' : 'fold';
                    if (p1Response === 'fold') {
                        return { winner: 'p2', profit: -p1Invested };
                    }
                    p1Invested++;
                    pot++;
                }
            } else {
                p1Invested++;
                pot++;
                const p2CallProb = p2[`s2_${p2Card.toLowerCase()}_call`];
                const p2Action = Math.random() < p2CallProb ? 'call' : 'fold';
                if (p2Action === 'fold') {
                    return { winner: 'p1', profit: pot - p1Invested };
                }
                pot++;
            }
            
            const isP1Winner = CARDS[p1Card] > CARDS[p2Card];
            if (isP1Winner) {
                return { winner: 'p1', profit: pot - p1Invested };
            } else {
                return { winner: 'p2', profit: -p1Invested };
            }
        }
        
        function displaySimulationResults(p1, p2, p1Wins, numGames, p1TotalProfit, evHistory, theoreticalEV) {
            elements.simResultsDiv.classList.remove('hidden');
            const p1WinRate = (p1Wins / numGames * 100).toFixed(2);
            const p2Wins = numGames - p1Wins;
            const p2WinRate = (100 - p1WinRate).toFixed(2);
            const practicalEV = (p1TotalProfit / numGames).toFixed(4);

            elements.simResultTextDiv.innerHTML = `
                <strong>結果 (${numGames}ゲーム):</strong><br>
                - ${p1.name}: ${p1Wins}勝 (${p1WinRate}%)<br>
                - ${p2.name}: ${p2Wins}勝 (${p2WinRate}%)<br>
                <hr style="border-color: rgba(255,255,255,0.2); margin: 8px 0;">
                - 実践EV (シミュレーション結果): <strong>${practicalEV}</strong><br>
                - 理論EV (確率からの計算値): <strong>${theoreticalEV.toFixed(4)}</strong>
            `;
            
            if (simChart) simChart.destroy();
            simChart = new Chart(elements.simEvChartCanvas, {
                type: 'line',
                data: {
                    labels: Array.from({ length: numGames }, (_, i) => i + 1),
                    datasets: [{
                        label: `${p1.name}の実践EV推移`,
                        data: evHistory,
                        borderColor: 'rgba(255, 206, 86, 1)',
                        backgroundColor: 'rgba(255, 206, 86, 0.2)',
                        borderWidth: 1,
                        pointRadius: 0,
                    }]
                },
                options: {
                    scales: {
                        x: { title: { display: true, text: 'ゲーム数' } },
                        y: { title: { display: true, text: '期待利得 (EV)' } }
                    }
                }
            });
        }

        populateAiSelectors();
        updateSimulatorStrategyDisplay();

        elements.startSimButton.addEventListener('click', () => {
            const p1AiType = elements.simPlayer1Select.value;
            const p2AiType = elements.simPlayer2Select.value;
            const gameCount = parseInt(elements.simGameCountInput.value, 10);
            if (isNaN(gameCount) || gameCount <= 0) {
                alert("有効なゲーム回数を入力してください。");
                return;
            }
            runSimulation(p1AiType, p2AiType, gameCount);
        });
        elements.simPlayer1Select.addEventListener('change', updateSimulatorStrategyDisplay);
        elements.simPlayer2Select.addEventListener('change', updateSimulatorStrategyDisplay);

        elements.simulatorScreen.addEventListener('click', (e) => {
            if (e.target.classList.contains('view-details-button')) {
                const detailsId = e.target.dataset.detailsId;
                const aiKey = (detailsId === 'p1') ? elements.simPlayer1Select.value : elements.simPlayer2Select.value;
                const settings = aiProfiles[aiKey];
                showStrategyDetails(settings, settings.name);
            }
        });
    }
});