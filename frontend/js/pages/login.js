/* login.js · Pestañas, inicio de sesión, registro y acceso con 42 (login.html) */
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);

    function switchTab(tab) {
        const isLogin = tab === 'login';
        $('tabLoginBtn').classList.toggle('active', isLogin);
        $('tabRegisterBtn').classList.toggle('active', !isLogin);
        $('loginFormContainer').classList.toggle('hidden', !isLogin);
        $('registerFormContainer').classList.toggle('hidden', isLogin);
    }

    // Guarda la sesión del navegador (la cookie de sesión la pone el servidor)
    function saveSession(data, fallbackName) {
        localStorage.setItem('cardbinder_user', JSON.stringify({
            username: data.username || fallbackName,
            badge: data.badge || 'Homebrewer'
        }));
        if (data.id) localStorage.setItem('user_id', data.id);
    }

    async function postJson(url, body, failMessage) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || failMessage);
        return data;
    }

    async function handleLogin(e) {
        e.preventDefault();
        const identifier = $('loginUser').value;
        const password = $('loginPass').value;
        try {
            const data = await postJson('/api/auth/login',
                { username_or_email: identifier, password }, 'Credenciales inválidas');
            saveSession(data, identifier);
            window.location.href = 'index.html';
        } catch (error) {
            alert('Error al entrar al Grimorio: ' + error.message);
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = $('regUser').value;
        const email = $('regEmail').value;
        const password = $('regPass').value;
        try {
            const data = await postJson('/api/auth/register',
                { username, email, password }, 'No se pudo completar el registro');
            saveSession(data, username);
            alert('¡Cuenta civil creada con éxito!');
            window.location.href = 'index.html';
        } catch (error) {
            alert('Error en el registro: ' + error.message);
        }
    }

    // Redirección al endpoint de OAuth de FastAPI para la Intra de 42
    const loginWith42 = () => { window.location.href = '/api/auth/42/login'; };

    document.querySelectorAll('[data-tab]').forEach((btn) =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
    $('loginForm').addEventListener('submit', handleLogin);
    $('registerForm').addEventListener('submit', handleRegister);
    document.querySelectorAll('[data-action="login42"]').forEach((el) =>
        el.addEventListener('click', (e) => { e.preventDefault(); loginWith42(); }));
})();
