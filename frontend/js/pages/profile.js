/* profile.js · Perfil, avatar, colección, sistema social y mensajes directos (profile.html).
   Estilos propios en css/profile.css; el resto con Tailwind y css/portal.css. */
(() => {
    'use strict';

    const API = '';
    const MAX_AVATAR_BYTES = 1024 * 1024;
    const $ = (id) => document.getElementById(id);

    // ---------- Sesión (la misma que usa el resto de la web: localStorage.cardbinder_user) ----------
    function readSession() {
        try {
            const u = JSON.parse(localStorage.getItem('cardbinder_user'));
            return u && u.username ? u : null;
        } catch (e) { return null; }
    }
    let session = readSession();

    function patchSession(patch) {
        session = { ...session, ...patch };
        Object.keys(patch).forEach((k) => { if (patch[k] === undefined) delete session[k]; });
        try { localStorage.setItem('cardbinder_user', JSON.stringify(session)); } catch (e) {}
    }

    function showNoSession(reason) {
        $('username-display').textContent = 'Sesión no válida';
        const p = $('email-display');
        p.textContent = '';
        p.append(reason + ' ');
        const a = document.createElement('a');
        a.href = 'login.html';
        a.className = 'text-[rgb(var(--c-accent))] underline';
        a.textContent = 'Inicia sesión de nuevo';
        p.append(a, '.');
        $('avatar-panel').classList.add('hidden');
        $('social-panel').classList.add('hidden');
        $('collection-panel').classList.add('hidden');
        $('avatar-slot').replaceChildren(avatarNode(null, session ? session.username : '?', 128));
    }

    // ---------- Utilidades ----------
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    let toastTimer = null;
    function toast(message, isError) {
        const t = $('toast');
        t.textContent = message;
        t.className = 'is-visible' + (isError ? ' is-error' : '');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.classList.remove('is-visible'); }, 3200);
    }

    const resolveAvatar = (u) => (typeof u === 'string' && u.startsWith('/api/') ? API + u : u);

    // Imagen redonda; si no hay avatar o falla la carga, círculo con la inicial (estilos .avatar-* en profile.css)
    function avatarNode(url, username, size) {
        const initial = () => {
            const d = el('div', 'avatar-fallback', ((username || '?').trim().charAt(0) || '?').toUpperCase());
            d.style.setProperty('--sz', size + 'px');
            return d;
        };
        const src = resolveAvatar(url);
        if (!src) return initial();
        const img = el('img', 'avatar-round');
        img.style.setProperty('--sz', size + 'px');
        img.alt = 'Avatar de ' + username;
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => img.replaceWith(initial()));
        img.src = src;
        return img;
    }

    async function api(path, opts = {}) {
        const headers = { ...(opts.headers || {}) };
        let body = opts.body;
        if (opts.json !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(opts.json);
        }
        const res = await fetch(API + (opts.base || '/api/profile') + path, { method: opts.method || 'GET', headers, body, credentials: 'same-origin' });
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (res.status === 401) {
            showNoSession('Tu sesión ha caducado.');
            throw new Error('Sesión caducada');
        }
        if (!res.ok) {
            const d = data && data.detail;
            throw new Error(Array.isArray(d) ? d.map((x) => x.msg).join(', ') : (d || `Error ${res.status}`));
        }
        return data;
    }

    // ---------- Perfil ----------
    function renderProfile(me) {
        $('username-display').textContent = me.username;
        $('email-display').textContent = me.email || '';
        const badge = $('badge-display');
        badge.textContent = me.badge || 'Miembro';
        badge.classList.remove('hidden');

        // Si no hay avatar propio se muestra el que trajo el login de 42 (si lo hay) y, si no, la inicial
        const shown = me.avatar || (session.avatar && !me.avatar ? session.avatar : null);
        $('avatar-slot').replaceChildren(avatarNode(shown, me.username, 128));
        $('remove-avatar-btn').classList.toggle('hidden', !me.avatar);

        // La página de inicio lee el avatar de la sesión
        if (me.avatar) patchSession({ avatar: me.avatar });
    }

    async function loadProfile() {
        renderProfile(await api('/me'));
    }

    // ---------- Avatar: subir y quitar ----------
    async function sendAvatar(blob) {
        if (!blob.type.startsWith('image/')) { toast('Eso no es una imagen.', true); return; }
        if (blob.size > MAX_AVATAR_BYTES) { toast('La imagen supera 1 MB.', true); return; }
        const data = await api('/avatar', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type } });
        patchSession({ avatar: data.avatar, avatar_fallbacks: undefined });
        await loadProfile();
    }

    $('upload-btn').addEventListener('click', async () => {
        const input = $('custom-avatar-input');
        if (!input.files.length) { toast('Selecciona una imagen primero.', true); return; }
        try {
            await sendAvatar(input.files[0]);
            input.value = '';
            toast('Avatar actualizado.');
        } catch (e) { toast(e.message, true); }
    });

    $('remove-avatar-btn').addEventListener('click', async () => {
        if (!confirm('¿Quitar tu avatar?')) return;
        try {
            await api('/avatar', { method: 'DELETE' });
            patchSession({ avatar: undefined, avatar_fallbacks: undefined });
            await loadProfile();
            toast('Avatar eliminado.');
        } catch (e) { toast(e.message, true); }
    });

    // ---------- Avatares predefinidos ----------
    // Se localiza avatar1 probando carpeta y extensión; el resto sigue el mismo patrón. Al elegir uno se sube
    // como avatar propio, así que se ve igual en toda la web (inicio, amigos...) sin depender de la carpeta estática.
    const PRESET_COUNT = 10;
    const PRESET_BASES = ['public/assets/avatars/', 'assets/avatars/', '/public/assets/avatars/'];
    const PRESET_EXTS = ['jpeg', 'jpg', 'png', 'webp'];

    const canLoad = (url) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });

    // Reduce la imagen ya cargada a 256x256 (JPEG): evita el límite de 1 MB y formatos raros
    function shrinkToBlob(img) {
        return new Promise((resolve, reject) => {
            if (!img.naturalWidth) { reject(new Error('La imagen no está cargada.')); return; }
            const size = 256;
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.9);
        });
    }

    async function setupPresets() {
        let pattern = null;
        for (const base of PRESET_BASES) {
            for (const ext of PRESET_EXTS) {
                if (await canLoad(`${base}avatar1.${ext}`)) { pattern = { base, ext }; break; }
            }
            if (pattern) break;
        }
        if (!pattern) return; // no hay predefinidos en el servidor: se oculta el bloque

        const grid = $('predefined-avatars-grid');
        for (let i = 1; i <= PRESET_COUNT; i++) {
            const url = `${pattern.base}avatar${i}.${pattern.ext}`;
            const btn = el('button', 'hover:scale-105 transition border border-[rgb(var(--c-gold-dark))] rounded-lg overflow-hidden focus:border-[rgb(var(--c-accent-hi))] bg-[rgb(var(--c-ink-3))]');
            btn.type = 'button';
            btn.title = 'Avatar ' + i;
            const img = el('img', 'w-full h-16 object-cover');
            img.alt = 'Avatar predefinido ' + i;
            img.src = url;
            img.addEventListener('error', () => btn.remove());
            btn.append(img);
            btn.addEventListener('click', async () => {
                try {
                    await sendAvatar(await shrinkToBlob(img));
                    toast('Avatar actualizado.');
                } catch (e) { toast(e.message, true); }
            });
            grid.append(btn);
        }
        $('presets-block').classList.remove('hidden');
    }

    // ---------- Resumen de la colección ----------
    // Mismos endpoints que usa hub.js: totales del informe y nº de contenedores.
    async function collectionGet(path) {
        return fetch(API + path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    }

    async function loadCollection() {
        const note = $('collection-note');
        const showNote = (text, isError) => {
            note.textContent = text;
            note.className = 'text-xs mt-3 ' + (isError ? 'text-red-400' : 'text-[color:var(--text-muted)] italic');
        };
        try {
            const [rep, cont] = await Promise.all([
                collectionGet('/api/reports/collection?page_size=1'),
                collectionGet('/api/containers/'),
            ]);
            if (!rep.ok) throw new Error('informe ' + rep.status);
            const r = await rep.json();
            const list = cont.ok ? await cont.json() : null;
            const values = {
                copies: r.total_copies,
                cards: r.total_cards,
                containers: Array.isArray(list) ? list.length : null,
            };
            for (const [key, value] of Object.entries(values)) {
                document.querySelectorAll(`[data-stat="${key}"]`).forEach((n) => {
                    n.textContent = value == null ? '—' : Number(value).toLocaleString('es-ES');
                });
            }
            if (!r.total_copies) showNote('Aún no tienes cartas guardadas. Añade la primera desde Mi colección.', false);
        } catch (e) {
            console.warn('No se pudo cargar el resumen de la colección:', e);
            showNote('No se pudo cargar el resumen de tu colección.', true);
        }
    }

    // ---------- Social ----------
    function actionBtn(label, kind, onClick) {
        const styles = { primary: 'btn-fantasy btn-sm', danger: 'btn-danger', ghost: 'btn-ghost' };
            const b = el('button', styles[kind] || styles.ghost, label);
        b.type = 'button';
        b.addEventListener('click', async () => {
            b.disabled = true;
            try { await onClick(); } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
        });
        return b;
    }

    function userRow(user, note, buttons, onOpen) {
        const row = el('div', 'flex items-center justify-between gap-3 bg-[rgb(var(--c-ink-3))] p-2.5 rounded-lg border border-[rgb(var(--c-gold-dark))]');
        const left = el('div', 'flex items-center gap-3 min-w-0');
        left.append(avatarNode(user.avatar, user.username, 36));
        const text = el('div', 'min-w-0');
        text.append(el('p', 'text-sm font-bold text-[color:var(--text-main)] truncate', user.username));
        if (note) text.append(el('p', 'text-xs text-[color:var(--text-muted)]', note));
        left.append(text);
        if (onOpen) {
            left.classList.add('cursor-pointer', 'hover:opacity-80', 'transition');
            left.tabIndex = 0;
            left.setAttribute('role', 'button');
            left.title = 'Ver perfil y mensajes';
            left.addEventListener('click', onOpen);
            left.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } });
        }
        const right = el('div', 'flex flex-wrap gap-2 justify-end');
        buttons.forEach((b) => right.append(b));
        row.append(left, right);
        return row;
    }

    async function act(path, opts, okMessage) {
        const data = await api(path, opts);
        toast(okMessage || (data && data.message) || 'Hecho.');
        await Promise.all([loadSocial(), runSearch()]);
    }

    const request = (u) => act('/friends/request', { method: 'POST', json: { username: u } });
    const accept = (u) => act('/friends/accept', { method: 'POST', json: { username: u } });
    const reject = (u) => act('/friends/reject', { method: 'POST', json: { username: u } });
    const removeFriend = (u) => act('/friends/' + encodeURIComponent(u), { method: 'DELETE' });
    const unblock = (u) => act('/block/' + encodeURIComponent(u), { method: 'DELETE' });
    const block = async (u) => {
        if (!confirm(`¿Seguro que deseas bloquear a ${u}? Se eliminará cualquier amistad o solicitud con esa persona.`)) return;
        await act('/block', { method: 'POST', json: { username: u } });
    };

    function section(title, items, emptyText, build) {
        const box = el('div');
        box.append(el('h4', 'text-sm font-semibold font-magic text-[color:var(--text-main)] mb-2', `${title} (${items.length})`));
        const list = el('div', 'space-y-2 max-h-56 overflow-y-auto pr-1');
        if (!items.length) list.append(el('p', 'text-xs text-[color:var(--text-muted)] italic', emptyText));
        items.forEach((u) => list.append(build(u)));
        box.append(list);
        return box;
    }

    async function loadSocial() {
        const box = $('social-lists');
        try {
            const s = await api('/friends');
            box.replaceChildren(
                section('Solicitudes recibidas', s.incoming, 'No tienes solicitudes pendientes.', (u) =>
                    userRow(u, 'quiere ser tu amigo', [actionBtn('Aceptar', 'primary', () => accept(u.username)), actionBtn('Rechazar', 'ghost', () => reject(u.username))])),
                section('Solicitudes enviadas', s.outgoing, 'No has enviado ninguna solicitud.', (u) =>
                    userRow(u, 'pendiente de respuesta', [actionBtn('Cancelar', 'ghost', () => reject(u.username))])),
                section('Amigos', s.friends, 'Aún no tienes amigos añadidos.', (u) =>
                    userRow(u, u.online ? '🟢 En línea' : '⚫ Desconectado', [actionBtn('Mensaje', 'primary', () => openFriend(u)), actionBtn('Eliminar', 'ghost', () => removeFriend(u.username)), actionBtn('Bloquear', 'danger', () => block(u.username))], () => openFriend(u))),
                section('Bloqueados', s.blocked, 'No has bloqueado a nadie.', (u) =>
                    userRow(u, null, [actionBtn('Desbloquear', 'ghost', () => unblock(u.username))]))
            );
        } catch (e) {
            if (e.message !== 'Sesión caducada') box.replaceChildren(el('p', 'text-xs text-red-400', 'No se pudo cargar la lista: ' + e.message));
        }
    }

    // El estado en línea de los amigos se refresca solo cada 15 s mientras la pestaña está visible
    setInterval(() => { if (!document.hidden) loadSocial(); }, 15000);

    // Búsqueda con resultados accionables
    const searchInput = $('search-input');
    let searchTimer = null;
    let searchSeq = 0;

    async function runSearch() {
        const q = searchInput.value.trim();
        const box = $('search-results');
        if (q.length < 2) { box.replaceChildren(); return; }
        const mine = ++searchSeq;
        try {
            const { results } = await api('/search?q=' + encodeURIComponent(q));
            if (mine !== searchSeq) return;
            if (!results.length) { box.replaceChildren(el('p', 'text-xs text-[color:var(--text-muted)] italic', 'Ningún usuario coincide.')); return; }
            box.replaceChildren(...results.map((u) => {
                const buttons = {
                    friend: [el('span', 'text-xs text-green-400', '✔ Ya sois amigos')],
                    pending_out: [el('span', 'text-xs text-yellow-400', 'Solicitud enviada')],
                    pending_in: [actionBtn('Aceptar', 'primary', () => accept(u.username))],
                    blocked: [actionBtn('Desbloquear', 'ghost', () => unblock(u.username))],
                }[u.relation] || [actionBtn('Añadir', 'primary', () => request(u.username)), actionBtn('Bloquear', 'danger', () => block(u.username))];
                return userRow(u, null, buttons);
            }));
        } catch (e) { /* el aviso de sesión ya lo muestra api() */ }
    }

    searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 300); });
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('send-request-btn').click(); } });
    $('send-request-btn').addEventListener('click', async () => {
        const name = searchInput.value.trim();
        if (!name) { toast('Escribe el nombre de usuario.', true); return; }
        try {
            await act('/friends/request', { method: 'POST', json: { username: name } });
            searchInput.value = '';
            $('search-results').replaceChildren();
        } catch (e) { toast(e.message, true); }
    });

    // ---------- Perfil de amigo y mensajes directos ----------
    // El chat consulta el servidor cada 3 s mientras la ventana está abierta (sin WebSocket).
    const fm = { user: null, lastId: 0, timer: null, queue: Promise.resolve(), pending: 0 };
    const fmBox = $('fm-messages');
    const socialApi = (path, opts = {}) => api(path, { ...opts, base: '/api/social' });

    const GIF_RE = /^gif:(https:\/\/(?:[a-z0-9-]+\.)*giphy\.com\/[^\s"'<>]{1,400})$/i;
    const INVITE_RE = /^invite:lobby:([A-Za-z0-9_-]{3,40})$/;

    // Contenido de un mensaje: GIF (solo de Giphy), invitación a sala o texto plano (textContent)
    function dmContent(m) {
        const g = GIF_RE.exec(m.message);
        if (g) {
            const img = el('img', 'max-w-full rounded');
            img.src = g[1]; img.alt = 'GIF'; img.loading = 'lazy';
            return img;
        }
        const inv = INVITE_RE.exec(m.message);
        if (inv) {
            const box = el('div', 'flex flex-col gap-2');
            box.append(el('p', 'font-semibold', m.mine ? '🎮 Has invitado a jugar' : '🎮 Te invita a jugar'));
            const a = el('a', 'btn-fantasy text-xs text-center', 'Entrar a la sala');
            a.href = 'lobby.html?room=' + encodeURIComponent(inv[1]);
            box.append(a);
            return box;
        }
        return el('p', 'whitespace-pre-wrap', m.message);
    }

    function showTyping(on) {
        const t = $('fm-typing');
        t.classList.toggle('hidden', !on);
        if (on) t.textContent = fm.user + ' está escribiendo…';
    }

    // ✓ enviado · ✓✓ recibido · ✓✓ azul = visto
    function setTick(n, status) {
        const T = { sent: ['✓', 'Enviado'], delivered: ['✓✓', 'Recibido'], read: ['✓✓', 'Visto'] };
        const [txt, title] = T[status] || T.sent;
        n.textContent = txt;
        n.title = title;
        n.setAttribute('aria-label', title);
        n.className = 'ml-1 ' + (status === 'read' ? 'text-sky-400' : 'text-[color:var(--text-muted)]');
    }

    function updateTicks(map) {
        if (!map) return;
        fmBox.querySelectorAll('[data-mid]').forEach((n) => { if (map[n.dataset.mid]) setTick(n, map[n.dataset.mid]); });
    }

    function fmBubble(m) {
        const wrap = el('div', 'flex ' + (m.mine ? 'justify-end' : 'justify-start'));
        const b = el('div', 'max-w-[80%] px-3 py-2 rounded-lg text-sm break-words border ' +
            (m.mine ? 'bg-[rgb(var(--c-raised))] border-[rgb(var(--c-gold))] text-[rgb(var(--c-amber-100))]' : 'bg-[rgb(var(--c-ink-3))] border-[rgb(var(--c-gold-dark))] text-[color:var(--text-main)]'));
        b.append(dmContent(m)); // textContent / DOM: nunca se interpreta HTML
        const t = new Date(m.created_at);
        const meta = el('p', 'text-[10px] text-[color:var(--text-muted)] mt-1 text-right',
            isNaN(t) ? null : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        if (m.mine) {
            const tick = el('span', '', '');
            tick.dataset.mid = String(m.id);
            setTick(tick, m.status);
            meta.append(tick);
        }
        b.append(meta);
        wrap.append(b);
        return wrap;
    }

    function appendDm(list) {
        if (!list.length) {
            if (!fm.lastId && !fmBox.children.length) {
                fmBox.append(el('p', 'text-xs text-[color:var(--text-muted)] italic text-center py-6', 'Aún no habéis hablado. Escribe el primer mensaje.'));
            }
            return;
        }
        if (!fm.lastId) fmBox.replaceChildren(); // quita el aviso de "sin mensajes"
        const nearBottom = fmBox.scrollHeight - fmBox.scrollTop - fmBox.clientHeight < 60;
        list.forEach((m) => { fmBox.append(fmBubble(m)); fm.lastId = Math.max(fm.lastId, m.id); });
        if (nearBottom || list.length > 1) fmBox.scrollTop = fmBox.scrollHeight;
    }

    async function doPoll(first) {
        const who = fm.user;
        if (!who) return;
        try {
            const data = await socialApi('/dm/' + encodeURIComponent(who) + '?after_id=' + fm.lastId);
            if (fm.user === who) { appendDm(data.messages || []); updateTicks(data.statuses); showTyping(!!data.typing); }
        } catch (e) {
            if (first && e.message !== 'Sesión caducada') toast(e.message, true);
        }
    }

    // Las consultas se encolan para que no se solapen ni dupliquen mensajes
    function pollDm(first) {
        if (!first && fm.pending) return fm.queue; // los avisos del temporizador no se acumulan
        fm.pending++;
        fm.queue = fm.queue.then(() => doPoll(first)).finally(() => { fm.pending--; });
        return fm.queue;
    }

    async function openFriend(u) {
        clearInterval(fm.timer);
        const who = u.username;
        fm.user = who;
        fm.lastId = 0;
        $('fm-name').textContent = who;
        $('fm-avatar').replaceChildren(avatarNode(u.avatar, who, 64));
        $('fm-badge').classList.add('hidden');
        document.querySelectorAll('[data-fm-stat]').forEach((n) => { n.textContent = '—'; });
        fmBox.replaceChildren();
        $('fm-modal').classList.remove('hidden');
        $('fm-input').focus();
        fm.timer = setInterval(() => { if (!document.hidden) pollDm(false); }, 3000);
        pollDm(true);
        try {
            const p = await socialApi('/user/' + encodeURIComponent(who));
            if (fm.user !== who) return;
            $('fm-avatar').replaceChildren(avatarNode(p.avatar, who, 64));
            if (p.badge) {
                $('fm-badge').textContent = p.badge;
                $('fm-badge').classList.remove('hidden');
            }
            const c = p.collection || {};
            document.querySelectorAll('[data-fm-stat]').forEach((n) => {
                const v = c[n.dataset.fmStat];
                n.textContent = v == null ? '—' : Number(v).toLocaleString('es-ES');
            });
        } catch (e) {
            if (fm.user === who && e.message !== 'Sesión caducada') toast(e.message, true);
        }
    }

    function closeFriend() {
        clearInterval(fm.timer);
        fm.user = null;
        $('fm-modal').classList.add('hidden');
        $('fm-gif-picker').classList.add('hidden');
        $('fm-typing').classList.add('hidden');
    }

    $('fm-close').addEventListener('click', closeFriend);
    $('fm-modal').addEventListener('click', (e) => { if (e.target === $('fm-modal')) closeFriend(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fm.user) closeFriend(); });

    $('fm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('fm-input');
        const text = input.value.trim();
        if (!text || !fm.user) return;
        try {
            await socialApi('/dm/' + encodeURIComponent(fm.user), { method: 'POST', json: { message: text } });
            input.value = '';
            await pollDm(true);
        } catch (err) {
            if (err.message !== 'Sesión caducada') toast(err.message, true);
        }
    });

    // ---------- Escribiendo, GIFs e invitaciones ----------
    let lastTypingPing = 0;
    $('fm-input').addEventListener('input', () => {
        const now = Date.now();
        if (!fm.user || now - lastTypingPing < 2500) return;
        lastTypingPing = now;
        socialApi('/dm/' + encodeURIComponent(fm.user) + '/typing', { method: 'POST' }).catch(() => {});
    });

    async function sendDm(text) {
        if (!fm.user) return;
        try {
            await socialApi('/dm/' + encodeURIComponent(fm.user), { method: 'POST', json: { message: text } });
            await pollDm(true);
        } catch (err) {
            if (err.message !== 'Sesión caducada') toast(err.message, true);
        }
    }

    const gifPicker = $('fm-gif-picker'), gifResults = $('fm-gif-results'), gifSearch = $('fm-gif-search');
    let gifTimer = null;
    $('fm-gif-btn').addEventListener('click', () => {
        gifPicker.classList.toggle('hidden');
        if (!gifPicker.classList.contains('hidden')) gifSearch.focus();
    });
    gifSearch.addEventListener('input', () => {
        clearTimeout(gifTimer);
        const q = gifSearch.value.trim();
        if (!q) { gifResults.replaceChildren(); return; }
        gifTimer = setTimeout(async () => {
            try {
                const res = await fetch('/api/giphy/search?q=' + encodeURIComponent(q) + '&limit=9', { credentials: 'same-origin' });
                if (!res.ok) throw new Error('Giphy ' + res.status);
                const data = await res.json();
                gifResults.replaceChildren(...(data.data || [])
                    .filter((g) => g.images && g.images.fixed_height_small && g.images.fixed_height_small.url)
                    .map((g) => {
                        const url = g.images.fixed_height_small.url;
                        const b = el('button', 'rounded overflow-hidden border border-[rgb(var(--c-gold-dark))]');
                        b.type = 'button';
                        const img = el('img', 'w-full h-16 object-cover');
                        img.alt = 'GIF'; img.src = url;
                        b.append(img);
                        b.addEventListener('click', () => {
                            gifPicker.classList.add('hidden'); gifSearch.value = ''; gifResults.replaceChildren();
                            sendDm('gif:' + url);
                        });
                        return b;
                    }));
            } catch (e) { toast('No se pudieron cargar los GIFs.', true); }
        }, 400);
    });

    $('fm-invite-btn').addEventListener('click', () => {
        sendDm('invite:lobby:duelo-' + Math.random().toString(36).slice(2, 8));
    });

    // ---------- Enlaces desde la campana del inicio: #chat=usuario y #solicitudes ----------
    function handleHash() {
        let h = '';
        try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
        if (h.startsWith('chat=') && h.length > 5) openFriend({ username: h.slice(5), avatar: null });
        else if (h === 'solicitudes') $('social-panel').scrollIntoView({ behavior: 'smooth' });
        if (h) history.replaceState(null, '', location.pathname + location.search);
    }

    // ---------- Arranque ----------
    if (!session) {
        showNoSession('No hay sesión iniciada.');
    } else {
        loadProfile().then(() => {
            loadCollection(); loadSocial().finally(handleHash); setupPresets();
        }).catch((e) => {
            if (e.message !== 'Sesión caducada') {
                $('username-display').textContent = 'Error de sincronización';
                $('email-display').textContent = e.message;
            }
        });
    }
})();
