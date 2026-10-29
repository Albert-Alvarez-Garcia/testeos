/* report.js · Informe de colección: búsqueda, filtros, orden, paginación y visor de imagen (report.html) */
(() => {
    'use strict';

    const API_BASE = '';
    const PAGE_SIZES = [12, 24, 48, 96];
    const SORTS = ['name', 'type', 'copies', 'printings', 'containers', 'added'];
    const SORT_DEFAULT = 'name';

    const $ = (id) => document.getElementById(id);
    const el = {
        userChip: $('user-chip'), summary: $('summary'), q: $('q'), sort: $('sort'), dir: $('dir'), size: $('size'),
        type: $('type'), subtype: $('subtype'), container: $('container'),
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
    el.userChip.innerHTML = `<span>👤 <b>${escapeHtml(user.username)}</b></span>` + (user.badge ? `<span class="bg-[rgb(var(--c-gold)/0.2)] px-2 py-0.5 rounded-sm border border-[rgb(var(--c-gold)/0.4)] text-[10px] text-[rgb(var(--c-amber-300))]">${escapeHtml(user.badge)}</span>` : '');

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

    const state = { q: '', type: '', subtype: '', cont: '', sort: SORT_DEFAULT, dir: 'asc', page: 1, size: 24 };
    let taxonomy = {};
    let containers = [];

    function readUrl() {
        const p = new URLSearchParams(window.location.search);
        state.q = (p.get('q') || '').slice(0, 100);
        state.type = (p.get('tipo') || '').slice(0, 60);
        state.subtype = (p.get('subtipo') || '').slice(0, 60);
        state.cont = (p.get('cont') || '').slice(0, 40);
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
        p.set('sort', state.sort);
        p.set('dir', state.dir);
        p.set('page', state.page);
        p.set('page_size', state.size);
        return p;
    }

    const RARITY = { common: 'Común', uncommon: 'Poco común', rare: 'Rara', mythic: 'Mítica' };
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
            ? `<button type="button" class="print-img relative w-20 h-28 shrink-0 rounded-sm overflow-hidden border border-black group cursor-zoom-in" data-src="${escapeHtml(img)}" data-caption="${escapeHtml(caption)}">
                   <img src="${escapeHtml(img)}" alt="" loading="lazy" class="w-full h-full object-cover">
               </button>`
            : `<div class="w-20 h-28 shrink-0 flex items-center justify-center text-center text-[10px] text-[rgb(var(--c-amber-200)/0.5)] bg-[rgb(var(--c-panel))] border border-dashed border-[rgb(var(--c-gold)/0.3)] rounded-sm">Sin foto</div>`;
        
        const foil = pr.foil_quantity ? `<span class="ml-2 px-1.5 py-0.5 text-[10px] font-bold text-black rounded-sm bg-linear-to-r from-purple-300 via-sky-300 to-[rgb(var(--c-amber-200))]">${pr.foil_quantity} foil</span>` : '';
        const where = pr.containers.map((c) => `
            <li class="flex items-center justify-between text-xs text-[rgb(var(--c-amber-200)/0.8)]">
                <span class="truncate">${escapeHtml(c.name)}</span>
                <span class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)] ml-1">(${containerKind(c.type)})</span>
                <span class="font-bold text-[rgb(var(--c-amber-400))] ml-2">×${c.quantity}</span>
            </li>`).join('');

        return `
            <div class="flex gap-3 p-3 bg-[rgb(var(--c-ink-2))] border border-[rgb(var(--c-gold)/0.3)] rounded-xl">
                ${media}
                <div class="flex-1 min-w-0 flex flex-col gap-1">
                    <p class="text-xs font-bold text-[rgb(var(--c-amber-100))] truncate">${escapeHtml(pr.set_name)}</p>
                    <p class="text-[11px] text-[rgb(var(--c-amber-200)/0.6)] flex items-center gap-2">
                        <span class="bg-[rgb(var(--c-gold)/0.2)] px-1 rounded-sm font-mono font-bold text-[rgb(var(--c-amber-300))]">${escapeHtml(String(pr.set_code || '').toUpperCase())}</span>
                        <span>Nº ${escapeHtml(pr.collector_number)}</span>
                    </p>
                    <p class="text-xs text-[rgb(var(--c-amber-200))] mt-1">
                        <b class="text-[rgb(var(--c-amber-400))]">${pr.quantity}</b> ${pr.quantity === 1 ? 'copia' : 'copias'}${foil}
                    </p>
                    <ul class="flex flex-col gap-1 mt-2 pt-2 border-t border-[rgb(var(--c-gold)/0.2)]">${where}</ul>
                </div>
            </div>`;
    }

    function entryHtml(item) {
        const tags = item.containers.map((c) =>
            `<li class="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs bg-[rgb(var(--c-ink-2))] border border-[rgb(var(--c-gold)/0.3)] rounded-lg">
                <span class="text-[rgb(var(--c-amber-100))]">${escapeHtml(c.name)}</span>
                <small class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)]">${containerKind(c.type)}</small>
                <b class="text-[rgb(var(--c-amber-400))]">×${c.quantity}</b>
            </li>`).join('');

        const oracle = item.oracle_text
            ? `<details class="mt-3"><summary class="cursor-pointer text-xs text-[rgb(var(--c-amber-300))] hover:underline">Texto de la carta</summary><p class="mt-2 text-xs text-[rgb(var(--c-amber-200)/0.7)] border-l-2 border-[rgb(var(--c-gold)/0.4)] pl-3 leading-relaxed">${escapeHtml(item.oracle_text).replace(/\n/g, '<br>')}</p></details>` : '';

        return `
            <article class="fantasy-panel p-5 border border-[rgb(var(--c-gold)/0.4)] flex flex-col gap-4">
                <header class="flex flex-wrap justify-between items-start gap-4">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-3">
                            <h2 class="font-magic text-xl font-bold text-[rgb(var(--c-amber-200))] tracking-wide">${escapeHtml(item.name)}</h2>
                            ${manaHtml(item.mana_cost)}
                        </div>
                        <p class="text-xs text-[rgb(var(--c-amber-200)/0.6)]">${escapeHtml(item.type_line)}</p>
                    </div>
                    <div class="flex gap-4 text-xs">
                        <div class="flex flex-col text-right"><span class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)]">Copias</span><b class="text-[rgb(var(--c-amber-300))] font-bold">${item.copies}</b></div>
                        <div class="flex flex-col text-right"><span class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)]">Artes</span><b class="text-[rgb(var(--c-amber-300))] font-bold">${item.printings_count}</b></div>
                        <div class="flex flex-col text-right"><span class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)]">Contenedores</span><b class="text-[rgb(var(--c-amber-300))] font-bold">${item.containers_count}</b></div>
                        <div class="flex flex-col text-right"><span class="text-[10px] text-[rgb(var(--c-amber-200)/0.5)]">Última alta</span><b class="text-[rgb(var(--c-amber-200))]">${fmtDate(item.last_added)}</b></div>
                    </div>
                </header>

                <div class="flex items-center gap-2">
                    <span class="text-xs text-[rgb(var(--c-amber-200)/0.5)]">Está en:</span>
                    <ul class="flex flex-wrap gap-2">${tags}</ul>
                </div>

                <div class="prints-grid">
                    ${item.printings.map((pr) => printHtml(pr, item.name)).join('')}
                </div>

                ${oracle}
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

    const hasFilters = () => Boolean(state.q || state.type || state.subtype || state.cont);

    function renderChips() {
        const contName = (containers.find((c) => String(c.id) === state.cont) || {}).name || 'Contenedor';
        const list = [
            state.q && ['q', `Búsqueda: ${state.q}`],
            state.type && ['type', `Tipo: ${state.type}`],
            state.subtype && ['subtype', `Subtipo: ${state.subtype}`],
            state.cont && ['cont', `Contenedor: ${contName}`],
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
        if (key === 'all') { state.q = ''; state.type = ''; state.subtype = ''; state.cont = ''; }
        fillSubtypes();
        changeFilters();
    }

    function syncControls() {
        el.q.value = state.q;
        el.type.value = state.type;
        fillSubtypes();
        el.subtype.value = state.subtype;
        el.container.value = state.cont;
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
