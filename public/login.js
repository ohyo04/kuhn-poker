'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const username = loginForm.username.value.trim();
        const password = loginForm.password.value.trim();

        if (username === '' || password === '') {
            errorMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        // 既存のユーザーデータをlocalStorageから取得
        const users = JSON.parse(localStorage.getItem('kuhn_poker_users')) || {};

        // ユーザーが存在し、かつパスワードが一致するかチェック
        if (users[username] && users[username].password === password) {
            // ログイン成功
            errorMessage.textContent = '';
            alert('ログイン成功！ゲーム画面に進みます。');
            
            // ★重要：誰がログインしたかを一時的に保存
            sessionStorage.setItem('loggedInUser', username);

            // ゲーム画面 (index.html) に移動
            window.location.href = 'index.html';
        } else {
            // ログイン失敗
            errorMessage.textContent = 'ユーザー名またはパスワードが間違っています。';
        }
    });
});