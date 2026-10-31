/* ==========================================================
   user-menu.js — Menú de usuario reutilizable (Card Binder)
   Avatar + usuario + badge + 🔔 + Logros + Perfil + Salir
   Uso (UNA sola línea, en el <head> o antes de </body>):
     <script src="user-menu.js"></script>
   Lleva su propio CSS (no necesita Tailwind) y carga portal.css si falta.
   Opciones (atributos del <script>):
     data-no-css       -> no cargar portal.css
   ========================================================== */
(function () {
    const SELF = document.currentScript;
    const BASE = SELF && SELF.src ? SELF.src.replace(/[^/]*$/, '') : '';

    // ---------- Dependencias (se cargan solo si faltan) ----------
    function ensureDependencies() {
        if (!SELF || !SELF.hasAttribute('data-no-css')) {
            const hasCss = [...document.querySelectorAll('link[rel="stylesheet"]')]
                .some((l) => /portal\.css/.test(l.getAttribute('href') || ''));
            if (!hasCss) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = new URL('css/portal.css', document.baseURI).href;
                document.head.appendChild(link);
            }
        }
    }
    ensureDependencies();

    // ---------- Estilos propios (sin Tailwind; usan la paleta de portal.css) ----------
    const D = { panel: '20 14 9', gold: '179 146 88', 'amber-100': '254 243 199', 'amber-200': '253 230 138',
        'amber-300': '252 211 77', 'amber-400': '251 191 36', 'ink-3': '15 10 6', raised: '44 29 15' };
    const c = (n, a) => `rgb(var(--c-${n}, ${D[n]})${a === undefined ? '' : ' / ' + a})`;
    if (!document.getElementById('user-menu-css')) {
        const st = document.createElement('style');
        st.id = 'user-menu-css';
        st.textContent = `
        .um-bar{position:absolute;top:1.5rem;right:1.5rem;z-index:1000;display:flex;align-items:center;gap:.75rem;
            background:${c('panel', .97)};border:1px solid ${c('gold', .6)};padding:.5rem 1rem;border-radius:.75rem;
            box-shadow:0 25px 50px -12px rgba(0,0,0,.6);backdrop-filter:blur(12px);font-family:'Inter',sans-serif}
        .um-panel{position:absolute;top:6rem;right:1.5rem;z-index:1000;width:20rem;background:${c('panel', .95)};
            border:2px solid ${c('gold')};border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);
            backdrop-filter:blur(12px);padding:1rem;font-family:'Inter',sans-serif}
        .um-panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}
        .um-panel-title{margin:0;color:${c('amber-200')};font-weight:700;font-size:.875rem;letter-spacing:.025em}
        .um-panel-sum{font-size:.75rem;color:${c('amber-300', .7)}}
        .um-user{display:flex;align-items:center;gap:.5rem;color:${c('amber-100')};font-size:.875rem}
        .um-name{font-weight:600;color:${c('amber-400')}}
        .um-badge{font-size:.75rem;padding:.125rem .5rem;border-radius:.25rem;background:${c('gold', .2)};
            border:1px solid ${c('gold', .4)};color:${c('amber-300')}}
        .um-actions{display:flex;align-items:center;gap:.5rem;padding-left:.5rem;border-left:1px solid ${c('gold', .4)}}
        .um-rel{position:relative}
        .um-bell{position:relative;padding:0 .375rem;font-size:1.125rem;line-height:1.5;background:none;border:none;
            color:${c('amber-300')};cursor:pointer;transition:color .2s}
        .um-bell:hover{color:${c('amber-100')}}
        .um-count{position:absolute;top:-.375rem;right:-.375rem;min-width:18px;height:18px;padding:0 .25rem;
            border-radius:9999px;background:#dc2626;color:#fff;font-size:.625rem;font-weight:700;
            display:flex;align-items:center;justify-content:center}
        .um-notif{position:absolute;right:0;top:100%;margin-top:.75rem;width:18rem;max-height:20rem;overflow-y:auto;
            z-index:1010;display:flex;flex-direction:column;gap:.5rem;background:${c('panel', .95)};
            border:2px solid ${c('gold')};border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.6);
            backdrop-filter:blur(12px);padding:.75rem}
        .um-btn{display:inline-block;padding:.25rem .625rem;font-family:inherit;font-size:.75rem;font-weight:500;
            line-height:1.4;border-radius:.25rem;border:none;background:${c('gold', .3)};color:${c('amber-200')};
            cursor:pointer;text-decoration:none;transition:background .2s}
        .um-btn:hover{background:${c('gold', .5)}}
        .um-btn-out{background:rgba(69,10,10,.6);color:#fecaca;border:1px solid rgba(153,27,27,.5)}
        .um-btn-out:hover{background:#7f1d1d}
        .um-row{display:block;background:${c('ink-3')};padding:.5rem;border-radius:.5rem;text-decoration:none;
            border:1px solid ${c('gold', .6)};transition:background .2s}
        .um-row:hover{background:${c('raised')}}
        .um-row-name{margin:0;font-size:.875rem;font-weight:700;color:${c('amber-100')};overflow:hidden;
            text-overflow:ellipsis;white-space:nowrap}
        .um-row-text{margin:0;font-size:.75rem;color:${c('amber-200', .7)}}
        .um-empty{margin:0;font-size:.75rem;font-style:italic;color:${c('amber-200', .6)}}
        .um-bar .hidden,.um-panel.hidden,.um-notif.hidden,.um-count.hidden{display:none}
        @media(max-width:640px){
            .um-bar{top:.5rem;left:.5rem;right:.5rem;box-sizing:border-box;flex-wrap:wrap;justify-content:space-between;
                gap:.3rem;padding:.4rem .55rem}
            .um-user{flex:1 1 100%;min-width:0;justify-content:center;gap:.3rem;font-size:.75rem}
            .um-name,.um-badge{max-width:35vw;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
            .um-actions{flex:1 1 100%;justify-content:space-around;gap:.25rem;padding:.25rem 0 0;border-left:0;
                border-top:1px solid ${c('gold', .4)}}
            .um-btn{padding:.22rem .4rem;font-size:.7rem}
            .um-panel{top:5.25rem;left:.5rem;right:.5rem;box-sizing:border-box;width:auto}
            .um-notif{width:min(18rem,calc(100vw - 2rem))}
        }`;
        document.head.appendChild(st);
    }

    const API_BASE = '';
    const LOGIN_PAGE = 'login.html';

    function init() {
        // Evita duplicarlo si la página ya lo trae
        if (document.getElementById('user-menu')) return;

        // ---------- Sesión ----------
        let userData = null;
        try { userData = JSON.parse(localStorage.getItem('cardbinder_user')); } catch (e) { /* sesión corrupta */ }
        if (!userData) {
            window.location.href = LOGIN_PAGE;
            return;
        }

        const escapeHtml = (v) => String(v ?? '').replace(/[&<>'"]/g,
            (t) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));

        // ---------- Contenedores ----------
        const userMenuContainer = document.createElement('div');
        userMenuContainer.id = 'user-menu';
        userMenuContainer.className = 'um-bar';

        const achievementsPanel = document.createElement('div');
        achievementsPanel.id = 'achievements-panel';
        achievementsPanel.className = 'um-panel hidden';
        achievementsPanel.innerHTML = `
            <div class="um-panel-head">
                <h2 class="um-panel-title">🏅 Medallas</h2>
                <span id="achievements-summary" class="um-panel-sum"></span>
            </div>
            <div id="achievements-grid" class="medal-grid"></div>`;

        document.body.prepend(achievementsPanel);
        document.body.prepend(userMenuContainer);

        // ---------- Contenido ----------
        userMenuContainer.innerHTML = `
            <div class="um-user">
                <span class="um-name">${escapeHtml(userData.username)}</span>
                <span class="um-badge">(${escapeHtml(userData.badge)})</span>
            </div>
            <div class="um-actions">
                <div class="um-rel">
                    <button id="notif-btn" type="button" aria-label="Notificaciones" aria-expanded="false"
                        class="um-bell">
                        🔔
                        <span id="notif-count" class="um-count hidden"></span>
                    </button>
                    <div id="notif-menu" class="um-notif hidden"></div>
                </div>
                <button id="profile-btn" class="um-btn">Logros</button>
                <a href="profile.html" class="um-btn">Perfil</a>
                <a href="stats.html" class="um-btn">Estadísticas</a>
                <button id="logout-btn" class="um-btn um-btn-out">Salir</button>
            </div>`;

        // ---------- Avatar ----------
        const initial = (userData.username || '?').trim().charAt(0).toUpperCase() || '?';

        function buildInitialAvatar() {
            const div = document.createElement('div');
            div.className = 'avatar-initial';
            div.textContent = initial;
            div.title = userData.username || '';
            return div;
        }

        const resolveAvatarUrl = (u) =>
            (typeof u === 'string' && u.startsWith('/api/')) ? API_BASE + u : u;
        const localAvatar = (u) => typeof u === 'string' && u.startsWith('/api/');

        function avatarCandidatesFor(u) {
            const list = localAvatar(u.avatar) ? [u.avatar] : [
                u.avatar,
                ...(Array.isArray(u.avatar_fallbacks) ? u.avatar_fallbacks : []),
                u.image_url,
                u.picture,
                u.image && u.image.link,
                u.image && u.image.versions && u.image.versions.medium
            ];
            return list.map(resolveAvatarUrl)
                .filter((x, i, arr) => typeof x === 'string' &&
                    (/^https:\/\//.test(x) || x.startsWith(API_BASE + '/api/')) &&
                    arr.indexOf(x) === i);
        }

        let avatarEl = null;
        function renderAvatar(urls) {
            let next;
            if (urls.length) {
                let attempt = 0;
                const img = document.createElement('img');
                img.alt = userData.username || '';
                img.referrerPolicy = 'no-referrer';
                img.className = 'avatar-img';
                img.addEventListener('error', () => {
                    attempt += 1;
                    if (attempt < urls.length) { img.src = urls[attempt]; return; }
                    const initialEl = buildInitialAvatar();
                    img.replaceWith(initialEl);
                    if (avatarEl === img) avatarEl = initialEl;
                });
                img.src = urls[0];
                next = img;
            } else {
                next = buildInitialAvatar();
            }
            if (avatarEl && avatarEl.isConnected) avatarEl.replaceWith(next);
            else userMenuContainer.prepend(next);
            avatarEl = next;
        }
        renderAvatar(avatarCandidatesFor(userData));

        (async () => {
            try {
                const res = await fetch(API_BASE + '/api/profile/me', {
                    headers: { Accept: 'application/json' }, credentials: 'same-origin'
                });
                if (res.status === 401) {
                    try { localStorage.removeItem('cardbinder_user'); localStorage.removeItem('user_session'); } catch (e) {}
                    window.location.href = LOGIN_PAGE;
                    return;
                }
                if (!res.ok) return;
                const me = await res.json();
                // Otras partes de la página (p. ej. index.js) reaccionan al perfil confirmado por el servidor
                if (me.auth_type === '42' && window.cbEnableTheme42) window.cbEnableTheme42();
                window.dispatchEvent(new CustomEvent('cb:profile', { detail: me }));
                if (me.avatar) {
                    if (me.avatar === userData.avatar) return;
                    userData.avatar = me.avatar;
                    delete userData.avatar_fallbacks;
                } else if (localAvatar(userData.avatar)) {
                    delete userData.avatar;
                } else {
                    return;
                }
                localStorage.setItem('cardbinder_user', JSON.stringify(userData));
                renderAvatar(avatarCandidatesFor(userData));
            } catch (e) { /* sin servidor */ }
        })();

        // ---------- Salir ----------
        document.getElementById('logout-btn').addEventListener('click', () => {
            try { navigator.sendBeacon('/api/auth/logout'); } catch (e) { /* sin cookie que cerrar */ }
            localStorage.removeItem('cardbinder_user');
            window.location.href = LOGIN_PAGE;
        });

        // ---------- Notificaciones ----------
        const notifBtn = document.getElementById('notif-btn');
        const notifMenu = document.getElementById('notif-menu');
        const notifCount = document.getElementById('notif-count');
        let notifTimer = null;

        function notifRow(name, text, href) {
            const a = document.createElement('a');
            a.href = href;
            a.className = 'um-row';
            const p1 = document.createElement('p');
            p1.className = 'um-row-name';
            p1.textContent = name;
            const p2 = document.createElement('p');
            p2.className = 'um-row-text';
            p2.textContent = text;
            a.append(p1, p2);
            return a;
        }

        function setNotifOpen(open) {
            notifMenu.classList.toggle('hidden', !open);
            notifBtn.setAttribute('aria-expanded', String(open));
        }

        function renderNotifications(n) {
            notifCount.textContent = n.total > 99 ? '99+' : String(n.total);
            notifCount.classList.toggle('hidden', !n.total);
            notifCount.classList.toggle('flex', !!n.total);
            const rows = [
                ...n.requests.map((u) => notifRow(u.username, '👥 Quiere ser tu amigo', 'profile.html#solicitudes')),
                ...n.messages.map((m) => notifRow(m.username,
                    '💬 ' + (m.count === 1 ? '1 mensaje nuevo' : m.count + ' mensajes nuevos'),
                    'profile.html#chat=' + encodeURIComponent(m.username))),
            ];
            if (!rows.length) {
                const empty = document.createElement('p');
                empty.className = 'um-empty';
                empty.textContent = 'No tienes notificaciones.';
                rows.push(empty);
            }
            notifMenu.replaceChildren(...rows);
        }

        async function loadNotifications() {
            try {
                const res = await fetch(API_BASE + '/api/social/notifications', {
                    headers: { Accept: 'application/json' }, credentials: 'same-origin'
                });
                if (res.status === 401) { clearInterval(notifTimer); return; }
                if (res.ok) renderNotifications(await res.json());
            } catch (e) { /* sin servidor */ }
        }

        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setNotifOpen(notifMenu.classList.contains('hidden'));
        });
        notifMenu.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => setNotifOpen(false));
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNotifOpen(false); });

        loadNotifications();
        notifTimer = setInterval(() => { if (!document.hidden) loadNotifications(); }, 10000);

        // ---------- Panel de medallas ----------
        const achievementsGrid = document.getElementById('achievements-grid');
        const achievementsSummary = document.getElementById('achievements-summary');

        const fetchAchievements = () => fetch(`${API_BASE}/api/achievements/`, { credentials: 'same-origin' });

        function showAchievementsMessage(text, isError) {
            achievementsSummary.textContent = '';
            achievementsGrid.innerHTML = '';
            const span = document.createElement('span');
            span.className = 'medal-msg' + (isError ? ' medal-msg-error' : '');
            span.textContent = text;
            achievementsGrid.appendChild(span);
        }

        function renderAchievements(data) {
            const list = data.achievements || [];
            const unlockedCount = list.filter(a => a.unlocked).length;
            achievementsSummary.textContent = `${unlockedCount}/${list.length} desbloqueadas`;
            achievementsGrid.innerHTML = list.map(a => {
                const pct = a.target ? Math.round((a.progress / a.target) * 100) : 0;
                const state = a.unlocked ? '¡Conseguida!' : `Progreso: ${a.progress}/${a.target}`;
                return `
                    <div class="medal ${a.unlocked ? 'unlocked' : 'locked'}">
                        <div class="medal-body">
                            <div class="medal-icon">${escapeHtml(a.icon)}</div>
                            <div class="medal-name">${escapeHtml(a.name)}</div>
                            <div class="medal-bar"><div class="medal-bar-fill" style="width:${pct}%"></div></div>
                            <div class="medal-progress">${a.progress}/${a.target}</div>
                        </div>
                        <div class="medal-tip">
                            <span class="medal-tip-name">${escapeHtml(a.name)}</span>
                            <span class="medal-tip-desc">${escapeHtml(a.description)}</span>
                            <span class="medal-tip-state">${escapeHtml(state)}</span>
                        </div>
                    </div>`;
            }).join('');
        }

        async function loadAchievements() {
            showAchievementsMessage('Cargando medallas...', false);
            try {
                const res = await fetchAchievements();
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                renderAchievements(await res.json());
            } catch (error) {
                console.error('Error cargando medallas:', error);
                showAchievementsMessage('No se pudieron cargar las medallas.', true);
            }
        }

        document.getElementById('profile-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = achievementsPanel.classList.contains('hidden');
            achievementsPanel.classList.toggle('hidden');
            if (willOpen) loadAchievements();
        });

        document.addEventListener('click', (e) => {
            if (!achievementsPanel.classList.contains('hidden') &&
                !achievementsPanel.contains(e.target) &&
                !userMenuContainer.contains(e.target)) {
                achievementsPanel.classList.add('hidden');
            }
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
