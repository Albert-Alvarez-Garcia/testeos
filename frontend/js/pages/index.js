/* index.js · Página principal: sesión, vuelta del login con 42 y tema 42.
   El menú de usuario lo pinta js/shared/user-menu.js y el chat js/shared/chat.js. */
(() => {
    'use strict';

    // ---------- Vuelta del login con 42: el servidor redirige a index.html?auth42=<base64 de un JSON> ----------
    const auth42 = new URLSearchParams(location.search).get('auth42');
    if (auth42) {
        try {
            const bytes = Uint8Array.from(atob(auth42), (c) => c.charCodeAt(0));
            const data = JSON.parse(new TextDecoder().decode(bytes));
            localStorage.setItem('cardbinder_user', JSON.stringify(data));
            history.replaceState({}, document.title, location.pathname);
        } catch (error) {
            console.error('Error procesando la autenticación de 42:', error);
            localStorage.removeItem('cardbinder_user');
            location.href = 'login.html';
            return;
        }
    }

    // ---------- Sesión ----------
    let user = null;
    try { user = JSON.parse(localStorage.getItem('cardbinder_user')); } catch (e) { /* sesión corrupta */ }
    if (!user) {
        location.href = 'login.html';
        return;
    }

    // ---------- Tema 42: fondo propio (theme.js) y logo abajo a la derecha ----------
    const isFortyTwo = (u) => !!u && (u.auth_type === '42' || /42/.test(String(u.badge || '')));

    function applyTheme(on) {
        if (on && window.cbEnableTheme42) window.cbEnableTheme42();
        const logo = document.getElementById('logo-42');
        if (logo) logo.classList.toggle('hidden', !on);
    }

    document.addEventListener('DOMContentLoaded', () => applyTheme(isFortyTwo(user)));
    // user-menu.js avisa cuando el servidor confirma el perfil (tipo de cuenta incluido)
    window.addEventListener('cb:profile', (e) => applyTheme(e.detail.auth_type === '42' || isFortyTwo(user)));
})();
