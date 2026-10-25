/********************************************************************************
 * [MODULE]: BARRA DE SECCIÓN (section-nav.js)
 * [DESCRIPTION]: Migas de pan + pestañas de la sección actual, para moverse entre
 *   las subpáginas sin volver siempre a la página intermedia.
 *
 * Uso: en cada subpágina, antes de </body>:
 *   <script src="section-nav.js" data-section="coleccion"></script>
 *   <script src="section-nav.js" data-section="juegos"></script>
 *
 * Para añadir una página a una sección, basta con añadirla a SECTIONS.
 ********************************************************************************/
(() => {
    'use strict';

    const SECTIONS = {
        coleccion: {
            title: 'Mi colección',
            hub: 'hub-coleccion.html',
            items: [
                { label: 'Todas mis cartas', href: 'report.html', also: ['coleccion.html'] },
                { label: 'Contenedores', href: 'visor-containers.html', also: ['gestor-contenedor.html'] },
                { label: 'Añadir cartas', href: 'visor-admin-25d.html' },
                { label: 'Crear contenedor', href: 'containers.html' }
            ]
        },
        juegos: {
            title: 'Juegos',
            hub: 'hub-juegos.html',
            items: [
                { label: 'Adivina la carta', href: 'rooms.html', also: ['lobby.html', 'game.html'] },
                { label: 'Pong isométrico', href: '/pong/' }
            ]
        }
    };

    const script = document.currentScript;
    const section = SECTIONS[script && script.dataset.section];
    if (!section) return;

    const esc = (v) => String(v).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const here = location.pathname.split('/').pop() || 'index.html';
    const isCurrent = (item) => (item.href.startsWith('/')
        ? location.pathname.startsWith(item.href)
        : [item.href, ...(item.also || [])].includes(here));

    const style = document.createElement('style');
    style.textContent = `
        .sn-bar { box-sizing: border-box; position: relative; z-index: 20; width: min(80rem, calc(100% - 24px));
            margin: 10px auto 12px; padding: 6px 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px;
            background: rgba(20, 14, 9, .94); border: 1px solid rgba(179, 146, 88, .32); border-radius: 12px;
            font: 500 .85rem/1.3 'Inter', system-ui, sans-serif; color: #fef3c7; }
        .sn-bar a { color: inherit; text-decoration: none; padding: 6px 10px; border-radius: 8px; }
        .sn-bar a:hover { background: #1e140d; color: #fcd34d; }
        .sn-bar a:focus-visible { outline: 2px solid #fbbf24; outline-offset: 1px; }
        .sn-home, .sn-sep { color: rgba(253, 230, 138, .68); }
        .sn-sep { padding: 0 2px; }
        .sn-section { font-weight: 600; color: #fbbf24; }
        .sn-tabs { list-style: none; margin: 0 0 0 auto; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }
        .sn-tabs a[aria-current="page"] { background: #b45309; color: #fff; font-weight: 600; cursor: default; }
        @media (max-width: 720px) { .sn-tabs { margin-left: 0; width: 100%; } }
        @media print { .sn-bar { display: none; } }`;
    document.head.appendChild(style);

    const nav = document.createElement('nav');
    nav.className = 'sn-bar';
    nav.setAttribute('aria-label', `Sección ${section.title}`);
    nav.innerHTML = `
        <a class="sn-home" href="index.html">Inicio</a><span class="sn-sep" aria-hidden="true">›</span>
        <a class="sn-section" href="${esc(section.hub)}">${esc(section.title)}</a>
        <ul class="sn-tabs">
            ${section.items.map((i) => `<li><a href="${esc(i.href)}"${isCurrent(i) ? ' aria-current="page"' : ''}>${esc(i.label)}</a></li>`).join('')}
        </ul>`;

    // El enlace "Saltar al contenido" (si existe) debe seguir siendo lo primero al tabular
    const first = document.body.firstElementChild;
    if (first && first.classList.contains('skip-link')) first.after(nav);
    else document.body.prepend(nav);
})();
