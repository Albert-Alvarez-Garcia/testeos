/********************************************************************************
 * [MODULE]: HUB DE JUEGOS (hub.js)
 * [DESCRIPTION]: Comprueba el acceso a Pong para mostrarlo solo a cuentas de 42.
 ********************************************************************************/
(() => {
    'use strict';

    const API = '/api';

    function getUser() {
        try { return JSON.parse(localStorage.getItem('cardbinder_user')); } catch (e) { return null; }
    }

    const user = getUser();
    if (!user || !user.username) {
        location.href = 'login.html';
        return;
    }

    // Igual que index.html: si el servidor no reconoce el username, se prueba con el login de 42
    async function apiGet(path) {
        return fetch(API + path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    }

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    // ------------------------------------------------------------------------
    // Juegos: Pong solo para cuentas de 42 (la decisión la toma el servidor)
    // ------------------------------------------------------------------------
    const PONG = {
        icon: '🏓',
        title: 'Pong isométrico',
        text: 'Pong 1 contra 1 en línea, o a dos en el mismo teclado.'
    };

    function pongMarkup(tag, attrs, extra) {
        return `<${tag} class="hub-card${tag === 'div' ? ' is-locked' : ''}" ${attrs}>
            <span class="hub-orb metal-orb" aria-hidden="true">${PONG.icon}</span>
            <span>
                <h2>${PONG.title}</h2>
                <p>${PONG.text}</p>
                ${extra}
            </span>
        </${tag}>`;
    }

    async function checkPong() {
        const slot = document.getElementById('pongSlot');
        if (!slot) return;

        const show = (state) => {
            if (state === 'allowed') {
                slot.innerHTML = pongMarkup('a', 'href="/pong/"', '');
            } else if (state === 'locked') {
                slot.innerHTML = pongMarkup('div', 'role="group"',
                    '<span class="hub-lock">🔒 Solo para usuarios de 42</span>' +
                    '<p class="hub-note">Entra con tu cuenta de 42 para jugar.</p>');
            } else if (state === 'error') {
                slot.innerHTML = pongMarkup('div', 'role="group"',
                    '<span class="hub-lock">No se pudo comprobar tu acceso <button type="button" class="hub-retry" id="pongRetry">Reintentar</button></span>');
                document.getElementById('pongRetry').addEventListener('click', checkPong);
            } else {
                slot.innerHTML = pongMarkup('div', 'role="group" aria-busy="true"', '<span class="hub-lock">Comprobando acceso…</span>');
            }
        };

        show('checking');
        try {
            const res = await apiGet('/access/pong');
            if (res.status === 401) { location.href = 'login.html'; return; }
            show(res.ok ? 'allowed' : res.status === 403 ? 'locked' : 'error');
        } catch (e) {
            show('error');
        }
    }

    if (document.body.dataset.hub === 'juegos') checkPong();
})();
