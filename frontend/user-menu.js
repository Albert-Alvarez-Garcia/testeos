/* ==========================================================
   user-menu.js — Menú de usuario reutilizable (Card Binder)
   Avatar + usuario + badge + 🔔 + Logros + Perfil + Salir
   Uso (UNA sola línea, en el <head> o antes de </body>):
     <script src="user-menu.js"></script>
   Carga por sí solo portal.css y Tailwind si la página no los tiene.
   Opciones (atributos del <script>):
     data-no-tailwind  -> no cargar Tailwind (si la página ya usa otro CSS)
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
                link.href = BASE + 'portal.css';
                document.head.appendChild(link);
            }
        }
        if (!SELF || !SELF.hasAttribute('data-no-tailwind')) {
            const hasTw = window.tailwind ||
                [...document.scripts].some((s) => /cdn\.tailwindcss\.com/.test(s.src));
            if (!hasTw) {
                const tw = document.createElement('script');
                tw.src = 'https://cdn.tailwindcss.com';
                document.head.appendChild(tw);
            }
        }
    }
    ensureDependencies();

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
        userMenuContainer.className = 'absolute top-6 right-6 z-40 flex items-center space-x-3 bg-[#140e09]/90 border border-[#b39258]/60 px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md';

        const achievementsPanel = document.createElement('div');
        achievementsPanel.id = 'achievements-panel';
        achievementsPanel.className = 'absolute top-24 right-6 z-40 w-80 hidden bg-[#140e09]/95 border-2 border-[#b39258] rounded-2xl shadow-2xl backdrop-blur-md p-4 font-sans';
        achievementsPanel.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <h2 class="text-amber-200 font-bold text-sm tracking-wide">🏅 Medallas</h2>
                <span id="achievements-summary" class="text-xs text-amber-300/70"></span>
            </div>
            <div id="achievements-grid" class="medal-grid"></div>`;

        document.body.prepend(achievementsPanel);
        document.body.prepend(userMenuContainer);

        // ---------- Contenido ----------
        userMenuContainer.innerHTML = `
            <div class="flex items-center space-x-2 text-amber-100 text-sm font-sans">
                <span class="font-semibold text-amber-400">${escapeHtml(userData.username)}</span>
                <span class="text-xs px-2 py-0.5 rounded bg-[#b39258]/20 border border-[#b39258]/40 text-amber-300">(${escapeHtml(userData.badge)})</span>
            </div>
            <div class="flex items-center space-x-2 pl-2 border-l border-[#b39258]/40">
                <div class="relative">
                    <button id="notif-btn" type="button" aria-label="Notificaciones" aria-expanded="false"
                        class="relative px-1.5 text-lg text-amber-300 hover:text-amber-100 transition-colors cursor-pointer">
                        🔔
                        <span id="notif-count" class="hidden absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold items-center justify-center"></span>
                    </button>
                    <div id="notif-menu" class="hidden absolute right-0 top-full mt-3 w-72 max-h-80 overflow-y-auto bg-[#140e09]/95 border-2 border-[#b39258] rounded-2xl shadow-2xl backdrop-blur-md p-3 space-y-2 font-sans z-50"></div>
                </div>
                <button id="profile-btn" class="px-2.5 py-1 text-xs font-medium rounded bg-[#b39258]/30 hover:bg-[#b39258]/50 text-amber-200 transition-colors cursor-pointer">Logros</button>
                <a href="profile.html" class="px-2.5 py-1 text-xs font-medium rounded bg-[#b39258]/30 hover:bg-[#b39258]/50 text-amber-200 transition-colors cursor-pointer">Perfil</a>
                <button id="logout-btn" class="px-2.5 py-1 text-xs font-medium rounded bg-red-950/60 hover:bg-red-900 text-red-200 border border-red-800/50 transition-colors cursor-pointer">Salir</button>
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
                    headers: { Accept: 'application/json', 'X-Username': userData.username }
                });
                if (!res.ok) return;
                const me = await res.json();
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
            a.className = 'block bg-[#0f0a06] p-2 rounded-lg border border-[#b39258]/60 hover:bg-[#2c1d0f] transition-colors';
            const p1 = document.createElement('p');
            p1.className = 'text-sm font-bold text-amber-100 truncate';
            p1.textContent = name;
            const p2 = document.createElement('p');
            p2.className = 'text-xs text-amber-200/70';
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
                empty.className = 'text-xs text-amber-200/60 italic';
                empty.textContent = 'No tienes notificaciones.';
                rows.push(empty);
            }
            notifMenu.replaceChildren(...rows);
        }

        async function loadNotifications() {
            try {
                const res = await fetch(API_BASE + '/api/social/notifications', {
                    headers: { Accept: 'application/json', 'X-Username': userData.username }
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

        const fetchAchievements = (name) => fetch(`${API_BASE}/api/achievements/`, { headers: { 'X-Username': name } });

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
                let res = await fetchAchievements(userData.username);
                if (res.status === 401 && userData.user_login && userData.user_login !== userData.username) {
                    res = await fetchAchievements(userData.user_login);
                }
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
