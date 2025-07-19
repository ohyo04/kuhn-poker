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
            const data = await response.json();
            if (response.ok) {
                sessionStorage.setItem('loggedInUser', username);
                window.location.href = '/index.html';
            } else {
                if (response.status === 404) {
                    if (confirm('ユーザーが存在しません。\n新規登録ページに移動しますか？')) {
                        window.location.href = '/register.html';
                    }
                } else {
                    errorMessage.textContent = 'エラー: ' + data.error;
                }
            }
        } catch (error) {
            errorMessage.textContent = 'サーバーとの通信に失敗しました。';
        }
    });
});