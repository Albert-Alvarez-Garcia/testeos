/********************************************************************************
 * [MODULE]: BARRA DE SECCIÓN (section-nav.js)
 * [DESCRIPTION]: Migas de pan + pestañas de la sección actual, para moverse entre
 *   las subpáginas sin volver siempre a la página intermedia.
 *
 * Uso: en cada subpágina, antes de </body>:
 *   <script src="js/shared/section-nav.js" data-section="coleccion"></script>
 *   <script src="js/shared/section-nav.js" data-section="juegos"></script>
 *
 * Para añadir una página a una sección, basta con añadirla a SECTIONS.
 * Requiere css/portal.css en la página (ahí están los estilos .sn-*).
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

    // Los estilos (.sn-*) están en css/portal.css

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