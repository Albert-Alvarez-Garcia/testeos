/* Navegación común del portal. Las páginas indican su sección con data-shell-page. */
(() => {
    'use strict';

    const body = document.body;
    const appMain = document.querySelector('.app-main');
    const page = body.dataset.shellPage;
    if (!appMain || !page || document.querySelector('.app-sidebar')) return;

    const links = [
        ['/index.html', '⌂', 'Inicio', 'home', 'NAVEGACIÓN'],
        ['/report.html', '▤', 'Mi colección', 'collection', 'COLECCIÓN'],
        ['/visor-admin-25d.html', '＋', 'Añadir cartas', 'add', ''],
        ['/containers.html', '▣', 'Contenedores', 'containers', ''],
        ['/hub-juegos.html', '✧', 'Juegos', 'games', 'JUEGOS Y SOCIAL'],
        ['/gacha.html', '✦', 'Abrir sobres', 'gacha', ''],
        ['/profile.html', '◎', 'Social y perfiles', 'profile', ''],
    ];
    const activePage = ['games', 'rooms', 'lobby', 'game'].includes(page) ? 'games' : page;
    const navLink = ([href, icon, label, key]) => `<a class="app-nav-link${activePage === key ? ' active' : ''}" href="${href}"${activePage === key ? ' aria-current="page"' : ''}><span>${icon}</span> ${label}</a>`;
    const navMarkup = links.map((item) => `${item[4] ? `<span class="app-nav-label">${item[4]}</span>` : ''}${navLink(item)}`).join('');
    const chatMarkup = document.querySelector('#chat-box, #pong-global-chat')
        ? '<button class="app-nav-link" id="chat-float-btn" type="button"><span>◌</span> Chat global</button>'
        : '';

    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.setAttribute('aria-label', 'Navegación principal');
    sidebar.innerHTML = `
        <a class="app-brand" href="/index.html" aria-label="Card Binder Pro, inicio">
            <img src="/public/assets/logo_cards.png" alt="">
            <span><strong>CARD BINDER PRO</strong><small>ARCHIVO PERSONAL</small></span>
        </a>
        <nav class="app-nav">
            ${navMarkup}
            ${chatMarkup}
        </nav>
        <div class="app-sidebar-bottom">
            <a class="app-nav-link${page === 'stats' ? ' active' : ''}" href="/stats.html"${page === 'stats' ? ' aria-current="page"' : ''}><span>⌁</span> Estadísticas</a>
            <a class="app-nav-link" href="/readme.html"><span>ⓘ</span> Sobre el proyecto</a>
        </div>`;
    body.insertBefore(sidebar, appMain);

    const contexts = {
        home: 'BIBLIOTECA ARCANA / INICIO',
        collection: 'COLECCIÓN / TODAS MIS CARTAS',
        add: 'COLECCIÓN / AÑADIR CARTAS',
        containers: 'COLECCIÓN / CONTENEDORES',
        profile: 'COMUNIDAD / PERFIL',
        games: 'JUEGOS Y SOCIAL / JUEGOS',
        gacha: 'JUEGOS Y SOCIAL / ABRIR SOBRES',
        rooms: 'JUEGOS Y SOCIAL / SALAS',
        lobby: 'JUEGOS Y SOCIAL / VESTÍBULO',
        game: 'JUEGOS Y SOCIAL / PARTIDA',
        stats: 'CARD BINDER PRO / ESTADÍSTICAS',
    };
    const header = document.createElement('header');
    header.className = `home-topbar${page === 'collection' ? ' collection-topbar' : ''}${page === 'add' ? ' add-cards-topbar' : ''}`;
    header.innerHTML = `
        <button class="mobile-menu-toggle" id="mobile-menu-toggle" type="button" aria-label="Abrir navegación" aria-expanded="false">☰</button>
        <span class="topbar-context">${(body.dataset.shellContext || contexts[page] || 'CARD BINDER PRO').split(' / ').map((part, index) => `${index ? '<span aria-hidden="true">/</span>' : ''}${part}`).join(' ')}</span>
        ${page === 'home' ? '<a class="topbar-search-trigger" href="visor-admin-25d.html" aria-label="Abrir el catálogo de cartas" title="Abrir el catálogo de cartas">⌕</a>' : ''}
        <div id="notification-slot" class="notification-slot"></div>
        <div id="user-menu-slot" class="user-menu-slot"></div>`;
    appMain.prepend(header);

    const menuButton = header.querySelector('#mobile-menu-toggle');
    function setMenuOpen(open) {
        sidebar.classList.toggle('is-open', open);
        body.classList.toggle('nav-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? 'Cerrar navegación' : 'Abrir navegación');
    }
    menuButton.addEventListener('click', () => setMenuOpen(!sidebar.classList.contains('is-open')));
    sidebar.addEventListener('click', (event) => {
        if (event.target.closest('a, #chat-float-btn')) setMenuOpen(false);
    });
    document.addEventListener('click', (event) => {
        if (sidebar.classList.contains('is-open') && !sidebar.contains(event.target) && !menuButton.contains(event.target)) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });
})();
