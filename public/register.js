'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('register-form');
    const errorMessage = document.getElementById('error-message');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const username = registerForm.username.value.trim();
        const password = registerForm.password.value.trim();
        errorMessage.textContent = '';

        if (username === '' || password === '') {
            errorMessage.textContent = 'ユーザー名とパスワードを入力してください。';
            return;
        }

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: username, password: password }),
            });

            const data = await response.json();

            if (response.ok) {
                alert('登録が完了しました！ログインページに移動します。');
                window.location.href = '/login.html';
            } else {
                errorMessage.textContent = 'エラー: ' + data.error;
            }
        } catch (error) {
            errorMessage.textContent = 'サーバーとの通信に失敗しました。';
        }
    });
});