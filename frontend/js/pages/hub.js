/********************************************************************************
 * [MODULE]: PÁGINAS INTERMEDIAS (hub.js)
 * [DESCRIPTION]: Comprueba la sesión y rellena los datos vivos de cada página intermedia.
 *   - body[data-hub="coleccion"]: totales de la colección
 *   - body[data-hub="juegos"]:    acceso a Pong (solo cuentas de 42), preguntado al servidor
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
        const request = (id) => fetch(API + path, { headers: { Accept: 'application/json', 'X-Username': id } });
        let res = await request(user.username);
        if (res.status === 401 && user.user_login && user.user_login !== user.username) {
            res = await request(user.user_login);
        }
        return res;
    }

    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const fmt = (n) => Number(n || 0).toLocaleString('es-ES');

    // ------------------------------------------------------------------------
    // Mi colección: totales en la tarjeta principal
    // ------------------------------------------------------------------------
    async function loadCollectionStats() {
        try {
            // Totales del informe (/api/reports/collection) y nº de contenedores (/api/containers/)
            const [rep, cont] = await Promise.all([apiGet('/reports/collection?page_size=1'), apiGet('/containers/')]);
            if (!rep.ok) return; // sin totales la página sigue funcionando
            const r = await rep.json();
            const list = cont.ok ? await cont.json() : null;
            const values = { copies: r.total_copies, cards: r.total_cards, containers: Array.isArray(list) ? list.length : '—' };
            for (const [key, value] of Object.entries(values)) {
                document.querySelectorAll(`[data-stat="${key}"]`).forEach((el) => { el.textContent = fmt(value); });
            }
        } catch (e) {
            console.warn('No se pudieron cargar los totales:', e);
        }
    }

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
                    '<p style="margin-top:8px">Entra con tu cuenta de 42 para jugar.</p>');
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

    const page = document.body.dataset.hub;
    if (page === 'coleccion') loadCollectionStats();
    if (page === 'juegos') checkPong();
})();
