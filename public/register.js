'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');

    registerForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const username = registerForm.username.value.trim();
        const password = registerForm.password.value.trim();

        if (username === '' || password === '') {
            errorMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        // 既存のユーザーデータをlocalStorageから取得
        const users = JSON.parse(localStorage.getItem('kuhn_poker_users')) || {};

        // ユーザー名が既に使われていないかチェック
        if (users[username]) {
            errorMessage.textContent = 'そのユーザー名は既に使用されています。';
            return;
        }

        // 新しいユーザー情報を作成
        users[username] = {
            password: password,
            stats: { // 初期統計データ
                gamesPlayed: 0,
                playerWins: 0,
                totalProfit: 0,
                // 今後、詳細なアクションデータをここに追加していく
            },
            history: [] // ゲーム履歴
        };

        // 更新したユーザーデータをlocalStorageに保存
        localStorage.setItem('kuhn_poker_users', JSON.stringify(users));

        alert('ユーザー登録が完了しました！ログイン画面に移動します。');
        window.location.href = 'login.html'; // ログイン画面へ移動
    });
});