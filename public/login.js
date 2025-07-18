'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = loginForm.username.value.trim();
        const password = loginForm.password.value.trim();
        errorMessage.textContent = '';

        if (username === '' || password === '') {
            errorMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: username, password: password }),
            });

            if (response.ok) {
                // ログイン成功
                sessionStorage.setItem('loggedInUser', username);
                window.location.href = '/index.html';
            } else {
                // --- ▼▼▼ ここからが修正箇所 ▼▼▼ ---
                // ログイン失敗時の処理
                if (response.status === 404) {
                    // ユーザーが存在しない場合
                    if (confirm('ユーザーが存在しません。新規登録ページに移動しますか？')) {
                        window.location.href = '/register.html';
                    }
                } else {
                    // パスワード間違いなど、その他のエラーの場合
                    const data = await response.json();
                    errorMessage.textContent = 'エラー: ' + data.error;
                }
                // --- ▲▲▲ ここまでが修正箇所 ▲▲▲ ---
            }
        } catch (error) {
            errorMessage.textContent = 'サーバーとの通信に失敗しました。';
        }
    });
});