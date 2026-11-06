/* report.js · Informe de colección: búsqueda, filtros, orden, paginación y visor de imagen (report.html) */
(() => {
    'use strict';

    const API_BASE = '';
    const PAGE_SIZES = [12, 24, 48, 96];
    const SORTS = ['name', 'type', 'copies', 'printings', 'containers', 'added'];
    const SORT_DEFAULT = 'name';

    const $ = (id) => document.getElementById(id);
    const el = {
        summary: $('summary'), q: $('q'), sort: $('sort'), dir: $('dir'), size: $('size'),
        type: $('type'), subtype: $('subtype'), container: $('container'), rarity: $('rarity'),
        chips: $('chips'), results: $('results'), entries: $('entries'), pager: $('pager'),
        lightbox: $('lightbox'), lightboxImg: $('lightbox-img'), lightboxCaption: $('lightbox-caption'), lightboxClose: $('lightbox-close'),
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    const plural = (n, one, many) => `${n.toLocaleString('es-ES')} ${n === 1 ? one : many}`;

    function readSession() {
        for (const key of ['cardbinder_user', 'user_session']) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) return JSON.parse(raw);
            } catch (error) {
                console.error('Error leyendo la sesión:', error);
            }
        }
        return null;
    }

    const user = readSession();
    if (!user || !user.username) {
        window.location.href = 'login.html';
        return;
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
            event.preventDefault();
            el.q.focus();
        }
    });

    class ApiError extends Error {
        constructor(message, status) { super(message); this.status = status; }
    }

    async function api(path, params, signal) {
        const url = new URL(API_BASE + path, window.location.origin);
        if (params) params.forEach((value, key) => url.searchParams.append(key, value));

        const response = await fetch(url, { credentials: 'same-origin', signal });
        if (response.status === 401) {
            window.location.href = 'login.html';
            throw new ApiError('Tu sesión no es válida.', 401);
        }
        if (!response.ok) {
            let detail = `Error ${response.status}`;
            try { detail = (await response.json()).detail || detail; } catch (_) {}
            throw new ApiError(typeof detail === 'string' ? detail : 'Petición no válida.', response.status);
        }
        return response.json();
    }

    const state = { q: '', type: '', subtype: '', cont: '', rarity: '', sort: SORT_DEFAULT, dir: 'asc', page: 1, size: 24 };
    let taxonomy = {};
    let containers = [];

    function readUrl() {
        const p = new URLSearchParams(window.location.search);
        state.q = (p.get('q') || '').slice(0, 100);
        state.type = (p.get('tipo') || '').slice(0, 60);
        state.subtype = (p.get('subtipo') || '').slice(0, 60);
        state.cont = (p.get('cont') || '').slice(0, 40);
        state.rarity = p.get('rareza') || '';
        state.sort = SORTS.includes(p.get('sort')) ? p.get('sort') : SORT_DEFAULT;
        state.dir = p.get('dir') === 'desc' ? 'desc' : 'asc';
        state.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
        const size = parseInt(p.get('size'), 10);
        state.size = PAGE_SIZES.includes(size) ? size : 24;
    }

    function writeUrl() {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.type) p.set('tipo', state.type);
        if (state.subtype) p.set('subtipo', state.subtype);
        if (state.cont) p.set('cont', state.cont);
        if (state.rarity) p.set('rareza', state.rarity);
        if (state.sort !== SORT_DEFAULT) p.set('sort', state.sort);
        if (state.dir !== 'asc') p.set('dir', state.dir);
        if (state.page > 1) p.set('page', state.page);
        if (state.size !== 24) p.set('size', state.size);
        const qs = p.toString();
        history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }

    function requestParams() {
        const p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.type) p.set('type_line', state.type);
        if (state.subtype) p.set('subtype', state.subtype);
        if (state.cont) p.set('container_id', state.cont);
        if (state.rarity) p.set('rarity', state.rarity);
        p.set('sort', state.sort);
        p.set('dir', state.dir);
        p.set('page', state.page);
        p.set('page_size', state.size);
        return p;
    }

    const RARITY = { common: 'Común', uncommon: 'Poco común', rare: 'Rara', mythic: 'Mítica', special: 'Especial', bonus: 'Bonus' };
    const KIND = { deck: 'Mazo', box: 'Caja' };
    const containerKind = (type) => (String(type || '').startsWith('binder') ? 'Archivador' : (KIND[type] || 'Contenedor'));

    function manaHtml(cost) {
        if (!cost) return '';
        const faces = cost.split('//').map((part) => [...part.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]));
        if (!faces.some((f) => f.length)) return '';
        const chip = (symbol) => {
            let cls = 'mana-n';
            if (/^[WUBRG]$/.test(symbol)) cls = `mana-${symbol.toLowerCase()}`;
            else if (symbol === 'C') cls = 'mana-c';
            else if (/[WUBRGP]\//.test(symbol) || /\/[WUBRGP]/.test(symbol)) cls = 'mana-h';
            return `<span class="mana ${cls}">${escapeHtml(symbol.replace(/\//g, ''))}</span>`;
        };
        const inner = faces.map((f) => f.map(chip).join('')).join('<span class="mana-sep">//</span>');
        return `<span class="mana-cost">${inner}</span>`;
    }

    function fmtDate(iso) {
        if (!iso) return 'Sin fecha';
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? 'Sin fecha' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const safeImage = (uri) => (/^https:\/\//i.test(uri || '') ? uri : '');

    function printHtml(pr, cardName) {
        const img = safeImage(pr.image_uri);
        const caption = `${cardName}, ${pr.set_name} nº ${pr.collector_number}`;
        const media = img
            ? `<button type="button" class="print-img printing-art" data-src="${escapeHtml(img)}" data-caption="${escapeHtml(caption)}" aria-label="Ampliar ${escapeHtml(caption)}">
                   <img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">
               </button>`
            : `<div class="printing-art no-art">Sin imagen</div>`;
        
        const foil = pr.foil_quantity ? `<span class="foil-tag">${pr.foil_quantity} foil</span>` : '';
        const rarity = RARITY[pr.rarity] || pr.rarity || 'Sin rareza';
        const where = pr.containers.map((c) => {
            const positions = (c.positions || []).map((position) => {
                if (String(c.type).startsWith('binder')) return `Pág. ${position.page ?? '?'} · hueco ${position.slot ?? '?'}`;
                if (c.type === 'deck') return `${position.section === 'sideboard' ? 'Banquillo' : 'Mazo'}${position.slot ? ` · ${position.slot}` : ''}`;
                return position.slot ? `Hueco ${position.slot}` : '';
            }).filter(Boolean);
            const conditions = Object.entries(c.conditions || {}).map(([condition, quantity]) =>
                `<span class="condition-tag">${escapeHtml(condition)} ×${quantity}</span>`).join(' ');
            const details = [conditions, positions.length ? `<small>${escapeHtml([...new Set(positions)].join(', '))}</small>` : ''].filter(Boolean).join('<br>');
            return `
            <li class="printing-location">
                <span>${escapeHtml(c.name)} <small>${containerKind(c.type)}</small>${details ? `<small class="location-detail">${details}</small>` : ''}</span>
                <b>×${c.quantity}</b>
            </li>`;
        }).join('');

        return `
            <article class="printing-card">
                ${media}
                <div class="printing-info">
                    <p class="printing-set">${escapeHtml(pr.set_name)}</p>
                    <p class="printing-code"><span>${escapeHtml(String(pr.set_code || '').toUpperCase())}</span> Nº ${escapeHtml(pr.collector_number)} · ${escapeHtml(rarity)}</p>
                    <p class="printing-quantity"><b>${pr.quantity}</b> ${pr.quantity === 1 ? 'copia' : 'copias'}${foil}</p>
                    <ul class="printing-locations">${where || '<li class="printing-location muted">Sin ubicación registrada</li>'}</ul>
                </div>
            </article>`;
    }

    function entryHtml(item) {
        const tags = item.containers.map((c) =>
            `<li class="location-chip">
                <span>${escapeHtml(c.name)} <small>${containerKind(c.type)}</small></span>
                <b>×${c.quantity}</b>
            </li>`).join('');

        const oracle = item.oracle_text
            ? `<details class="oracle-details"><summary>Leer texto de reglas</summary><p>${escapeHtml(item.oracle_text).replace(/\n/g, '<br>')}</p></details>` : '';
        const featured = item.printings[0];
        const featuredImage = featured && safeImage(featured.image_uri);
        const cover = featuredImage
            ? `<button type="button" class="entry-cover print-img" data-src="${escapeHtml(featuredImage)}" data-caption="${escapeHtml(`${item.name}, ${featured.set_name} nº ${featured.collector_number}`)}" aria-label="Ampliar arte de ${escapeHtml(item.name)}"><img src="${escapeHtml(featuredImage)}" alt="" loading="lazy" decoding="async"></button>`
            : '<div class="entry-cover no-art">Sin imagen</div>';
        const setCount = item.printings.length;

        return `
            <article class="collection-card">
                ${cover}
                <div class="card-overview">
                    <div class="card-title-row">
                        <div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.type_line)}</p></div>
                        ${manaHtml(item.mana_cost)}
                    </div>
                    <div class="card-facts">
                        <span><b>${item.copies}</b> copias</span>
                        <span><b>${item.printings_count}</b> artes</span>
                        <span><b>${item.containers_count}</b> ubicaciones</span>
                        <span class="last-added">Añadida ${fmtDate(item.last_added)}</span>
                    </div>
                    <div class="card-locations"><span>Guardada en</span><ul>${tags || '<li class="location-chip muted">Sin contenedor</li>'}</ul></div>
                    <details class="entry-details">
                        <summary><span>Ver ediciones y detalles</span><b>${setCount}</b></summary>
                        <div class="entry-details-content">
                            <div class="prints-grid">${item.printings.map((pr) => printHtml(pr, item.name)).join('')}</div>
                            ${oracle}
                        </div>
                    </details>
                </div>
            </article>`;
    }

    function renderEntries(data) {
        if (!data.items.length) {
            el.entries.innerHTML = hasFilters()
                ? `<div class="fantasy-panel p-8 text-center text-[rgb(var(--c-amber-200))] flex flex-col items-center gap-3"><h2 class="font-magic text-lg">Ninguna carta coincide</h2><p class="text-xs text-[rgb(var(--c-amber-200)/0.6)]">Prueba con otros filtros o con otro término de búsqueda.</p><button type="button" class="btn-fantasy text-xs" data-action="clear-all">Quitar filtros</button></div>`
                : `<div class="fantasy-panel p-8 text-center text-[rgb(var(--c-amber-200))] flex flex-col items-center gap-3"><h2 class="font-magic text-lg">Tu colección está vacía</h2><p class="text-xs text-[rgb(var(--c-amber-200)/0.6)]">Añade cartas a tus contenedores para ver el informe.</p></div>`;
            return;
        }
        el.entries.innerHTML = data.items.map(entryHtml).join('');
    }

    function renderSummary(data) {
        if (!hasFilters()) {
            el.summary.innerHTML = `Posees <strong class="text-[rgb(var(--c-amber-300))]">${plural(data.total_cards, 'carta distinta', 'cartas distintas')}</strong> y <strong class="text-[rgb(var(--c-amber-300))]">${plural(data.total_copies, 'copia', 'copias')}</strong> en total.`;
        } else {
            el.summary.innerHTML = `Se han encontrado <strong class="text-[rgb(var(--c-amber-300))]">${plural(data.total_cards, 'carta', 'cartas')}</strong> con <strong class="text-[rgb(var(--c-amber-300))]">${plural(data.total_copies, 'copia', 'copias')}</strong> con los filtros aplicados.`;
        }
    }

    function renderPager(data) {
        if (!data.total_cards) { el.pager.innerHTML = ''; return; }
        const from = (data.page - 1) * data.page_size + 1;
        const to = Math.min(data.total_cards, data.page * data.page_size);

        el.pager.innerHTML = `
            <p class="text-xs text-[rgb(var(--c-amber-200)/0.6)]">Mostrando ${from} a ${to} de ${plural(data.total_cards, 'carta', 'cartas')}</p>
            <div class="flex items-center gap-2">
                <button type="button" class="btn-fantasy text-xs py-1 px-3" data-page="${data.page - 1}" ${data.page <= 1 ? 'disabled' : ''}>Anterior</button>
                <span class="text-xs text-[rgb(var(--c-amber-300))] font-bold px-2">${data.page} / ${data.total_pages}</span>
                <button type="button" class="btn-fantasy text-xs py-1 px-3" data-page="${data.page + 1}" ${data.page >= data.total_pages ? 'disabled' : ''}>Siguiente</button>
            </div>`;
    }

    const hasFilters = () => Boolean(state.q || state.type || state.subtype || state.cont || state.rarity);

    function renderChips() {
        const contName = (containers.find((c) => String(c.id) === state.cont) || {}).name || 'Contenedor';
        const list = [
            state.q && ['q', `Búsqueda: ${state.q}`],
            state.type && ['type', `Tipo: ${state.type}`],
            state.subtype && ['subtype', `Subtipo: ${state.subtype}`],
            state.cont && ['cont', `Contenedor: ${contName}`],
            state.rarity && ['rarity', `Rareza: ${RARITY[state.rarity] || state.rarity}`],
        ].filter(Boolean);
        const chip = ([key, text]) => `<button type="button" class="bg-[rgb(var(--c-gold)/0.2)] border border-[rgb(var(--c-gold))] px-3 py-1 rounded-full text-xs text-[rgb(var(--c-amber-200))] flex items-center gap-2" data-clear="${key}">
                ${escapeHtml(text)} <span class="text-[rgb(var(--c-amber-400))] font-bold" aria-label="Quitar">✕</span>
            </button>`;
        el.chips.innerHTML = list.map(chip).join('') + (list.length > 1
            ? '<button type="button" class="text-xs text-[rgb(var(--c-amber-300))] hover:underline px-2" data-action="clear-all">Quitar todos</button>' : '');
    }

    function fillSubtypes() {
        const subs = (taxonomy[state.type] || []);
        el.subtype.innerHTML = '<option value="">Cualquier subtipo...</option>' +
            subs.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        el.subtype.disabled = !subs.length;
        if (state.subtype && !subs.includes(state.subtype)) state.subtype = '';
    }

    function clearFilter(key) {
        if (key === 'q') state.q = '';
        if (key === 'type') { state.type = ''; state.subtype = ''; }
        if (key === 'subtype') state.subtype = '';
        if (key === 'cont') state.cont = '';
        if (key === 'rarity') state.rarity = '';
        if (key === 'all') { state.q = ''; state.type = ''; state.subtype = ''; state.cont = ''; state.rarity = ''; }
        fillSubtypes();
        changeFilters();
    }

    function syncControls() {
        el.q.value = state.q;
        el.type.value = state.type;
        fillSubtypes();
        el.subtype.value = state.subtype;
        el.container.value = state.cont;
        el.rarity.value = state.rarity;
        el.sort.value = state.sort;
        el.size.value = String(state.size);
        el.dir.textContent = state.dir === 'asc' ? 'Ascendente' : 'Descendente';
        renderChips();
    }

    let controller = null;
    let requestId = 0;

    function renderSkeleton() {
        if (!el.entries.children.length || el.entries.querySelector('.fantasy-panel')) {
            el.entries.innerHTML = '<div class="skeleton-loader"></div><div class="skeleton-loader"></div>';
        }
    }

    async function loadReport({ scrollTop = false } = {}) {
        if (controller) controller.abort();
        controller = new AbortController();
        const mine = ++requestId;

        el.results.setAttribute('aria-busy', 'true');
        renderSkeleton();

        try {
            const data = await api('/api/reports/collection', requestParams(), controller.signal);
            if (mine !== requestId) return;
            state.page = data.page;
            renderEntries(data);
            renderPager(data);
            renderSummary(data);
            renderChips();
            writeUrl();
            if (scrollTop) {
                el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Error cargando el informe:', error);
            if (error.status === 401) { window.location.href = 'login.html'; return; }
            el.pager.innerHTML = '';
            el.summary.textContent = '';
            el.entries.innerHTML = `<div class="fantasy-panel p-8 text-center text-[rgb(var(--c-amber-200))] flex flex-col items-center gap-3" role="alert">
                <h2 class="font-magic text-lg">No se pudo cargar el informe</h2>
                <p class="text-xs text-[rgb(var(--c-amber-200)/0.7)]">${escapeHtml(error.status ? error.message : 'No hay conexión con el servidor (¿está levantada la API en ' + API_BASE + '?).')}</p>
                <button type="button" class="btn-fantasy text-xs" data-action="retry">Reintentar</button></div>`;
        } finally {
            if (mine === requestId) el.results.setAttribute('aria-busy', 'false');
        }
    }

    function changeFilters() {
        state.page = 1;
        syncControls();
        loadReport();
    }

    let searchTimer = null;
    el.q.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            state.q = el.q.value.trim().replace(/\s+/g, ' ');
            changeFilters();
        }, 300);
    });

    el.sort.addEventListener('change', () => { state.sort = el.sort.value; changeFilters(); });
    el.size.addEventListener('change', () => { state.size = parseInt(el.size.value, 10); changeFilters(); });
    el.dir.addEventListener('click', () => { state.dir = state.dir === 'asc' ? 'desc' : 'asc'; changeFilters(); });

    el.type.addEventListener('change', () => { state.type = el.type.value; state.subtype = ''; fillSubtypes(); changeFilters(); });
    el.subtype.addEventListener('change', () => { state.subtype = el.subtype.value; changeFilters(); });
    el.container.addEventListener('change', () => { state.cont = el.container.value; changeFilters(); });
    el.rarity.addEventListener('change', () => { state.rarity = el.rarity.value; changeFilters(); });

    el.chips.addEventListener('click', (event) => {
        const one = event.target.closest('[data-clear]');
        if (one) return clearFilter(one.dataset.clear);
        if (event.target.closest('[data-action="clear-all"]')) clearFilter('all');
    });

    el.results.addEventListener('click', (event) => {
        const pageBtn = event.target.closest('[data-page]');
        if (pageBtn && !pageBtn.disabled) {
            state.page = parseInt(pageBtn.dataset.page, 10);
            loadReport({ scrollTop: true });
            return;
        }
        if (event.target.closest('[data-action="clear-all"]')) { clearFilter('all'); return; }
        if (event.target.closest('[data-action="retry"]')) { loadReport(); return; }
        const zoom = event.target.closest('.print-img');
        if (zoom) {
            el.lightboxImg.src = zoom.dataset.src;
            el.lightboxImg.alt = zoom.dataset.caption;
            el.lightboxCaption.textContent = zoom.dataset.caption;
            el.lightbox.showModal();
        }
    });

    el.lightboxClose.addEventListener('click', () => el.lightbox.close());
    el.lightbox.addEventListener('click', (event) => { if (event.target === el.lightbox) el.lightbox.close(); });

    async function printCollection() {
        const button = $('print-collection');
        const report = $('printReport');
        const original = button.textContent;
        button.disabled = true;
        button.textContent = 'Preparando…';
        try {
            const items = [];
            let page = 1;
            let totalPages = 1;
            do {
                const params = requestParams();
                params.set('page', String(page));
                params.set('page_size', '100');
                const data = await api('/api/reports/collection', params);
                items.push(...data.items);
                totalPages = data.total_pages;
                page += 1;
            } while (page <= totalPages);
            if (!items.length) { window.alert('No hay cartas que coincidan con los filtros actuales.'); return; }
            const rows = items.flatMap((item) => item.printings.map((printing) => {
                const locations = printing.containers.map((container) => {
                    const positions = (container.positions || []).map((position) =>
                        String(container.type).startsWith('binder') ? `pág. ${position.page ?? '?'} / hueco ${position.slot ?? '?'}` :
                            container.type === 'deck' ? (position.section === 'sideboard' ? 'banquillo' : 'mazo') :
                                (position.slot ? `hueco ${position.slot}` : '')).filter(Boolean);
                    return `${container.name} ×${container.quantity}${positions.length ? ` (${[...new Set(positions)].join(', ')})` : ''}`;
                }).join('; ');
                const conditions = Object.entries(printing.conditions || {}).map(([condition, quantity]) => `${condition} ×${quantity}`).join(', ');
                return `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(printing.set_name)} (${escapeHtml(printing.set_code)})</td><td>${escapeHtml(printing.rarity || '—')}</td><td>${printing.quantity}</td><td>${printing.foil_quantity || '—'}</td><td>${escapeHtml(conditions || '—')}</td><td>${escapeHtml(locations || 'Sin ubicación')}</td></tr>`;
            }));
            report.innerHTML = `<h1>Mi colección</h1><p>${new Date().toLocaleDateString('es-ES', { dateStyle: 'long' })} · ${items.length} cartas · ${items.reduce((n, item) => n + item.copies, 0)} copias</p><table><thead><tr><th>Carta</th><th>Edición</th><th>Rareza</th><th>Copias</th><th>Foil</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>${rows.join('')}</tbody></table><footer>Card Binder Pro</footer>`;
            document.body.classList.add('printing-report');
            window.print();
        } catch (error) {
            window.alert(`No se pudo preparar el informe: ${error.message}`);
        } finally {
            button.disabled = false;
            button.textContent = original;
        }
    }

    $('print-collection').addEventListener('click', printCollection);
    window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));

    async function loadFilterOptions() {
        const [tax, conts] = await Promise.allSettled([
            fetch(API_BASE + '/api/cards/types-taxonomy').then((r) => (r.ok ? r.json() : {})),
            api('/api/containers/'),
        ]);
        taxonomy = tax.status === 'fulfilled' && tax.value ? tax.value : {};
        containers = conts.status === 'fulfilled' && Array.isArray(conts.value) ? conts.value : [];
        el.type.innerHTML = '<option value="">Cualquier tipo...</option>' +
            Object.keys(taxonomy).sort().map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
        el.container.innerHTML = '<option value="">Todos los contenedores</option>' +
            containers.map((c) => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || 'Sin nombre')} (${escapeHtml(containerKind(c.type))})</option>`).join('');
    }

    readUrl();
    loadFilterOptions().finally(() => { syncControls(); loadReport(); });
})();
