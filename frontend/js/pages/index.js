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

    document.addEventListener('DOMContentLoaded', () => {
        const searchForm = document.querySelector('.hero-search');
        const searchInput = document.getElementById('home-card-search');
        if (searchForm && searchInput) {
            searchForm.addEventListener('submit', (event) => {
                if (!searchInput.value.trim()) {
                    event.preventDefault();
                    searchInput.focus();
                }
            });
        }
    });
})();
