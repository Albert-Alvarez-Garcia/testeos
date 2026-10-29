/* auth.js · Sesión en el navegador para las páginas de contenedores.
   Comprueba que hay sesión en el navegador, hace las peticiones con la cookie de sesión (misma origen)
   y manda al login si no hay sesión o el servidor responde 401.
   Uso: CBAuth.fetch('/api/containers/', { method: 'GET' }) */
(function () {
    'use strict';

    function username() {
        const keys = ['cardbinder_user', 'user_session'];
        for (const key of keys) {
            try {
                const user = JSON.parse(localStorage.getItem(key));
                if (user && user.username) return user.username;
            } catch (e) { /* valor corrupto: se ignora */ }
        }
        return null;
    }

    function redirectToLogin() {
        location.href = 'login.html';
    }

    function requireSession() {
        if (username()) return true;
        redirectToLogin();
        return false;
    }

    // La identidad viaja solo en la cookie de sesión (HttpOnly); ya no se envía X-Username
    function headers(extra) {
        return Object.assign({}, extra || {});
    }

    async function apiFetch(url, options) {
        if (!requireSession()) throw new Error('Sin sesión');
        const opts = Object.assign({}, options);
        opts.headers = headers(opts.headers);
        opts.credentials = 'same-origin';
        const res = await fetch(url, opts);
        if (res.status === 401) {
            redirectToLogin();
            throw new Error('Sesión no válida');
        }
        return res;
    }

    window.CBAuth = { username, headers, requireSession, redirectToLogin, fetch: apiFetch };
})();
