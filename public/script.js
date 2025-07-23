'use strict';

document.addEventListener('DOMContentLoaded', () => {

    // --- ログイン状態を確認 ---
    const loggedInUser = sessionStorage.getItem('loggedInUser');
    if (!loggedInUser && !window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html')) {
        alert('ログインしていません。ログインページに戻ります。');
        window.location.href = '/login.html';
        return;
    }
    console.log(`ようこそ、${loggedInUser || 'ゲスト'}さん`);

    // --- グローバル変数・定数 ---
    let socket;
    let offlineGameManager; // オフラインゲームの状態を管理するオブジェクト
    const CARDS = { 'A': 3, 'K': 2, 'Q': 1 };
    const DECK = ['A', 'K', 'Q'];
    const aiProfiles = {
        gto: { name: "GTO AI", s1_a_bet: 0.333, s1_k_bet: 0.0, s1_q_bet: 0.333, s1_a_call: 1.0, s1_k_call: 0.0, s1_q_call: 0.0, s2_a_bet: 1.0, s2_k_bet: 0.0, s2_q_bet: 0.333, s2_a_call: 1.0, s2_k_call: 0.333, s2_q_call: 0.0 },
        kensjitsu: { name: "堅実", s1_a_bet: 0.8, s1_k_bet: 0.0, s1_q_bet: 0.1, s1_a_call: 1.0, s1_k_call: 0.1, s1_q_call: 0.0, s2_a_bet: 1.0, s2_k_bet: 0.0, s2_q_bet: 0.1, s2_a_call: 1.0, s2_k_call: 0.2, s2_q_call: 0.0 },
        kiai: { name: "気合", s1_a_bet: 1.0, s1_k_bet: 0.8, s1_q_bet: 0.7, s1_a_call: 1.0, s1_k_call: 0.9, s1_q_call: 0.8, s2_a_bet: 1.0, s2_k_bet: 0.8, s2_q_bet: 0.7, s2_a_call: 1.0, s2_k_call: 0.9, s2_q_call: 0.8 },
    };
    
    // --- HTML要素の取得 ---
    const elements = {
        lobbyScreen: document.getElementById('lobby-screen'),
        mainContainer: document.querySelector('.container'),
        matchmakingScreen: document.getElementById('matchmaking-screen'),
        navTabs: document.querySelector('.nav-tabs'),
        contentScreens: document.querySelectorAll('.content-screen'),
        modeSelectionArea: document.getElementById('mode-selection-area'),
        friendMatchArea: document.getElementById('friend-match-area'),
        randomMatchButton: document.getElementById('random-match-button'),
        friendMatchButton: document.getElementById('friend-match-button'),
        findAiButton: document.getElementById('find-ai-button'),
        backToModeSelectButton: document.getElementById('back-to-mode-select-button'),
        createRoomButton: document.getElementById('create-room-button'),
        joinRoomButton: document.getElementById('join-room-button'),
        cancelMatchmakingButton: document.getElementById('cancel-matchmaking-button'),
        roomIdInput: document.getElementById('room-id-input'),
        roomInfo: document.getElementById('room-info'),
        playerAiTypeSelect: document.getElementById('player-ai-type'),
        opponentAiTypeSelect: document.getElementById('opponent-ai-type'),
        simPlayer1Select: document.getElementById('sim-player1-ai'),
        simPlayer2Select: document.getElementById('sim-player2-ai'),
        startSimButton: document.getElementById('start-simulation-button'),
        simGameCountInput: document.getElementById('sim-game-count'),
        simResultsDiv: document.getElementById('simulator-results'),
        simResultTextDiv: document.getElementById('sim-result-text'),
        replayList: document.getElementById('replay-list'),
    };

    // --- イベントリスナー設定 ---
    if(elements.lobbyScreen){
        elements.randomMatchButton.addEventListener('click', startMatchmaking);
        elements.friendMatchButton.addEventListener('click', () => {
            elements.modeSelectionArea.style.display = 'none';
            elements.friendMatchArea.style.display = 'block';
        });
        elements.backToModeSelectButton.addEventListener('click', () => {
            elements.friendMatchArea.style.display = 'none';
            elements.modeSelectionArea.style.display = 'block';
        });
        elements.findAiButton.addEventListener('click', () => {
            elements.lobbyScreen.style.display = 'none';
            elements.mainContainer.style.display = 'flex';
            initializeOfflineGame();
        });
        elements.createRoomButton.addEventListener('click', () => {
            connectAndSetupListeners();
            socket.emit('createRoom', { username: loggedInUser });
        });
        elements.joinRoomButton.addEventListener('click', () => {
            const roomId = elements.roomIdInput.value.trim();
            if (!roomId) return alert('部屋IDを入力してください。');
            connectAndSetupListeners();
            socket.emit('joinRoom', { roomId: roomId, username: loggedInUser });
        });
    }

    if (elements.navTabs) {
        elements.navTabs.addEventListener('click', (event) => {
            const clickedTab = event.target.closest('.nav-tab');
            if (!clickedTab || clickedTab.classList.contains('active')) return;

            document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
            elements.contentScreens.forEach(screen => screen.classList.remove('active'));

            const screenId = clickedTab.dataset.screen;
            document.getElementById(screenId).classList.add('active');
            clickedTab.classList.add('active');

            if (screenId === 'simulator-screen') {
                initializeSimulator();
            } else if (screenId === 'stats-hub-screen'){
                fetchAndShowGameHistory();
            }
        });
    }

    // --- オンラインモード関連の関数 ---
    
    function connectAndSetupListeners() {
        if (socket && socket.connected) return;
        socket = io();
        socket.on('gameError', (message) => { alert('エラー: ' + message); window.location.reload(); });
        socket.on('roomCreated', (roomId) => { elements.roomInfo.innerHTML = `部屋ID: <strong>${roomId}</strong><br>このIDを友達に教えてください。`; });
        socket.on('gameStateUpdate', (state) => {
            elements.lobbyScreen.style.display = 'none';
            elements.matchmakingScreen.style.display = 'none';
            elements.mainContainer.style.display = 'flex';
            renderOnlineGame(state);
            // ラウンド終了時（betting以外のphase）に戦績を更新
            if (state.phase !== 'betting') {
                fetchAndShowRoomWinLose(state.roomId);
            }
            // fetchAndShowRoomGameHistory(state.roomId);
            fetchAndShowRoomWinLose(state.roomId);
        });
    }

    function startMatchmaking() {
        elements.lobbyScreen.style.display = 'none';
        elements.matchmakingScreen.style.display = 'flex';
        connectAndSetupListeners();
        socket.emit('findGame', { username: loggedInUser });
    }

    function renderOnlineGame(state) {
        if (!state || !state.players) return;
        const ui = {
            pHand: document.getElementById('player-hand'),
            oHand: document.getElementById('opponent-hand'),
            pot: document.querySelector('#pot-area #pot-amount'),
            msg: document.querySelector('#game-table #message-area'),
            actions: document.getElementById('actions'),
            betBtn: document.getElementById('bet-button'),
            checkBtn: document.getElementById('check-button'),
            callBtn: document.getElementById('call-button'),
            foldBtn: document.getElementById('fold-button'),
            newBtn: document.getElementById('new-game-button'),
        };

        const me = state.players.find(p => p.id === socket.id);
        const opponent = state.players.find(p => p.id !== socket.id);
        if (!me || !opponent) return;

        // 自分の手札は常に表向きで表示
        ui.pHand.innerHTML = `<div class="card">${me.hand[0]}</div>`;

        // 相手の手札は常に裏向きで表示（ショーダウン以外）
        ui.oHand.innerHTML = `<div class="card facedown"></div>`;

        ui.pot.textContent = state.pot;
        ui.msg.textContent = state.message;
        ui.newBtn.classList.add('hidden');
        const isMyTurn = state.players[state.turnIndex]?.id === socket.id;

        if (state.phase === 'betting' && isMyTurn) {
            ui.actions.classList.remove('hidden');
            const hasOpponentBet = opponent.bet > me.bet;
            ui.betBtn.style.display = hasOpponentBet ? 'none' : 'inline-block';
            ui.checkBtn.style.display = hasOpponentBet ? 'none' : 'inline-block';
            ui.callBtn.style.display = hasOpponentBet ? 'inline-block' : 'none';
            ui.foldBtn.style.display = hasOpponentBet ? 'inline-block' : 'none';
        } else {
            ui.actions.classList.add('hidden');
        }
    }
    
    // 戦歴を取得して表示する関数
    async function fetchAndShowGameHistory() {
        console.log('★★ fetchAndShowGameHistory実行 ★★');
        try {
            const res = await fetch('/api/game-history');
            const records = await res.json();
            function normalizeName(name) {
                return (name || '').trim().toLowerCase().replace(/\s/g, '').normalize('NFKC');
            }
            let myName = normalizeName(sessionStorage.getItem('loggedInUser'));
            console.log('myName:', myName);
            let winCount = 0, loseCount = 0;
            records.forEach(r => {
                const winnerName = normalizeName(r.winner.name);
                const loserName = normalizeName(r.loser.name);
                console.log('myName:', myName, 'winner:', winnerName, 'loser:', loserName);
                if (winnerName === myName) winCount++;
                if (loserName === myName) loseCount++;
            });
            document.getElementById('player-wins').textContent = winCount;
            document.getElementById('opponent-wins').textContent = loseCount;
        } catch (e) {
            console.error('戦歴の取得に失敗しました', e);
        }
    }

    // ページ表示時に戦歴を取得（オフラインモード時のみ）
    // fetchAndShowGameHistory();
    
    // オンライン用のアクションボタン設定
    document.getElementById('bet-button').onclick = () => socket && socket.emit('playerAction', { action: 'bet' });
    document.getElementById('check-button').onclick = () => socket && socket.emit('playerAction', { action: 'check' });
    document.getElementById('call-button').onclick = () => socket && socket.emit('playerAction', { action: 'call' });
    document.getElementById('fold-button').onclick = () => socket && socket.emit('playerAction', { action: 'fold' });


    // --- オフラインモード関連 ---
    
    function initializeOfflineGame() {
        if (offlineGameManager) {
            return;
        }

        const ui = {
            playerChips: document.getElementById('player-chips'),
            opponentChips: document.getElementById('opponent-chips'),
            pot: document.querySelector('#pot-area #pot-amount'),
            pHand: document.getElementById('player-hand'),
            oHand: document.getElementById('opponent-hand'),
            msg: document.querySelector('#game-table #message-area'),
            actions: document.getElementById('actions'),
            betBtn: document.getElementById('bet-button'),
            checkBtn: document.getElementById('check-button'),
            callBtn: document.getElementById('call-button'),
            foldBtn: document.getElementById('fold-button'),
            newBtn: document.getElementById('new-game-button'),
            pWins: document.getElementById('player-wins'),
            oWins: document.getElementById('opponent-wins'),
            pEv: document.getElementById('player-ev'),
        };

        let player = { name: 'あなた', type: 'human', chips: 100 };
        let opponent = { name: '相手 (CPU)', type: 'kensjitsu', chips: 100 };
        let pot = 0;
        let isPlayerTurn = true;
        let stats = { pWins: 0, oWins: 0, totalEv: 0, gamesPlayed: 0 };
        
        function startNewHand() {
            if (player.chips <= 0 || opponent.chips <= 0) {
                 ui.msg.textContent = "チップがなくなりました。新しいゲームを開始します。";
                 Object.assign(player, { chips: 100 });
                 Object.assign(opponent, { chips: 100 });
            }
            const deck = [...DECK].sort(() => Math.random() - 0.5);
            player.hand = deck.pop();
            opponent.hand = deck.pop();
            player.chips -= 1;
            opponent.chips -= 1;
            pot = 2;
            player.bet = 1;
            opponent.bet = 1;
            player.hasActed = false;
            opponent.hasActed = false;
            isPlayerTurn = true;
            updateUI();
            ui.newBtn.classList.add('hidden');
            ui.actions.classList.remove('hidden');
            if (player.type !== 'human') handleAiTurn(player);
        }

        function updateUI(state) {
            // const player = state.players.find(p => p.id === socket.id);
            // const opponentPlayer = state.players.find(p => p.id !== socket.id);

            // 自分の手札表示
            const playerCardContainer = document.getElementById('player-card');
            playerCardContainer.innerHTML = '';
            if (player) {
                let playerCard = '?';
                if (state.phase === 'showdown' && state.showdownHands) {
                    playerCard = state.showdownHands[player.id] || '?';
                } else if (player.hand && player.hand.length > 0) {
                    playerCard = player.hand[0];
                }
                const playerCardDiv = createCardDiv(playerCard);
                playerCardContainer.appendChild(playerCardDiv);
                document.getElementById('player-name').textContent = player.name;
                document.getElementById('player-chips').textContent = `チップ: ${player.chips}`;
            }

            // 相手プレイヤーのカード表示
            const opponentCardContainer = document.getElementById('opponent-card');
            opponentCardContainer.innerHTML = '';
            if (opponentPlayer) {
                let opponentCard = '?';
                if (state.phase === 'showdown' && state.showdownHands) {
                    opponentCard = state.showdownHands[opponentPlayer.id] || '?';
                }
                const opponentCardDiv = createCardDiv(opponentCard);
                opponentCardContainer.appendChild(opponentCardDiv);
                document.getElementById('opponent-name').textContent = opponentPlayer.name;
                document.getElementById('opponent-chips').textContent = `チップ: ${opponentPlayer.chips}`;
            }

            if (isPlayerTurn && player.type === 'human') {
                const canCheck = player.bet === opponent.bet;
                ui.betBtn.style.display = canCheck ? 'inline-block' : 'none';
                ui.checkBtn.style.display = canCheck ? 'inline-block' : 'none';
                ui.callBtn.style.display = !canCheck ? 'inline-block' : 'none';
                ui.foldBtn.style.display = !canCheck ? 'inline-block' : 'none';
                ui.msg.textContent = "あなたのアクションを選択してください。";
            }
        }
        
        function performAction(actor, other, action) {
            if (actor.type === 'human' && !isPlayerTurn) return;
            actor.hasActed = true;
            if (action === 'bet') { actor.chips--; actor.bet++; pot++; }
            if (action === 'call') { const callAmount = other.bet - actor.bet; actor.chips -= callAmount; actor.bet += callAmount; pot += callAmount; }
            if (action === 'fold') { actor.isFolded = true; }
            ui.msg.textContent = `${actor.name}が${action}しました。`;
            if (actor.isFolded) { endHand(other); }
            else if (player.hasActed && opponent.hasActed) { CARDS[player.hand] > CARDS[opponent.hand] ? endHand(player, true) : endHand(opponent, true); }
            else { isPlayerTurn = !isPlayerTurn; const nextPlayer = isPlayerTurn ? player : opponent; if (nextPlayer.type !== 'human') handleAiTurn(nextPlayer); else updateUI(); }
        }

        function endHand(winner, wasShowdown = false) {
            stats.gamesPlayed++;
            let profit = (winner === player) ? pot - player.bet : -player.bet;
            stats.totalEv += profit;
            if (winner === player) { stats.pWins++; player.chips += pot; } else { stats.oWins++; opponent.chips += pot; }
            if (wasShowdown) {
                // ショーダウン時は相手の手札を公開
                ui.oHand.innerHTML = `<div class="card">${opponent.hand}</div>`;
            }
            ui.msg.textContent = `${winner.name}の勝利！ ${pot}チップを獲得。`;
            updateUI();
            ui.actions.classList.add('hidden');
            ui.newBtn.classList.remove('hidden');
        }

        function getAIAction(ai, otherPlayer) {
            const settings = aiProfiles[ai.type];
            if (!settings) return 'check';
            const cardKey = ai.hand.toLowerCase();
            const opponentHasBet = otherPlayer.bet > ai.bet;
            const probKey = opponentHasBet ? `s2_${cardKey}_call` : `s1_${cardKey}_bet`;
            return (Math.random() < settings[probKey]) ? (opponentHasBet ? 'call' : 'bet') : (opponentHasBet ? 'fold' : 'check');
        }
        
        function handleAiTurn(aiPlayer) {
            setTimeout(() => {
                const otherPlayer = aiPlayer === player ? opponent : player;
                performAction(aiPlayer, otherPlayer, getAIAction(aiPlayer, otherPlayer));
            }, 500);
        }
        
        // ★★★ オフライン用のアクションボタン設定 ★★★
        ui.betBtn.onclick = () => performAction(player, opponent, 'bet');
        ui.checkBtn.onclick = () => performAction(player, opponent, 'check');
        ui.callBtn.onclick = () => performAction(player, opponent, 'call');
        ui.foldBtn.onclick = () => performAction(player, opponent, 'fold');
        ui.newBtn.onclick = startNewHand;

        elements.playerAiTypeSelect.onchange = (e) => {
            player.type = e.target.value;
            if (player.type !== 'human' && isPlayerTurn) handleAiTurn(player);
            startNewHand();
        };
        elements.opponentAiTypeSelect.onchange = (e) => {
            opponent.type = e.target.value;
            startNewHand();
        };
        
        offlineGameManager = { reset: startNewHand };
        startNewHand();
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

    async function fetchAndShowRoomGameHistory(roomId) {
        const res = await fetch(`/api/game-history/${roomId}`);
        const records = await res.json();
        const list = document.getElementById('game-history-list');
        if (!list) return;
        list.innerHTML = '';
        records.forEach(r => {
            const li = document.createElement('li');
            // アクション履歴を表示せず、勝者・手札・対戦者名のみ
            li.textContent = `${r.winner.name}（${r.winnerHand}） vs ${r.loser.name}（${r.loserHand}） | 勝者: ${r.winner.name}`;
            list.appendChild(li);
        });
    }

    async function fetchAndShowRoomWinLose(roomId) {
        const res = await fetch(`/api/game-history/${roomId}`);
        const records = await res.json();
        function normalizeName(name) {
            return (name || '').trim().toLowerCase().replace(/\s/g, '').normalize('NFKC');
        }
        let myName = normalizeName(sessionStorage.getItem('loggedInUser'));
        let winCount = 0, loseCount = 0;
        records.forEach r => {
            const winnerName = normalizeName(r.winner.name);
            const loserName = normalizeName(r.loser.name);
            if (winnerName === myName) winCount++;
            if (loserName === myName) loseCount++;
        });
        document.getElementById('player-wins').textContent = winCount;
        document.getElementById('opponent-wins').textContent = loseCount;
    }
});