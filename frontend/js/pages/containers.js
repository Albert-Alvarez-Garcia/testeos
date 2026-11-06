/* Gestión visual de archivadores, mazos y cajas (containers.html). */
(() => {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const containerTypeSelect = $('containerType');
    const form = $('createContainerForm');
    const list = $('containersListWrapper');
    const filter = $('filterContainerType');
    const search = $('containerSearch');
    const status = $('containerStatus');
    const createButton = $('createContainerButton');
    const dynamicFields = {
        binder: $('binderFields'),
        deck: $('deckFields'),
        box: $('boxFields'),
    };
    let allContainers = [];

    const TYPE_LABELS = {
        binder_s: 'Archivador pequeño',
        binder_m: 'Archivador mediano',
        binder_xl: 'Archivador grande',
        binder: 'Archivador',
        deck: 'Mazo',
        box: 'Caja',
    };
    const TYPE_ICONS = { binder: '▤', deck: '✦', box: '▣' };

    function setStatus(message = '', kind = 'info') {
        status.textContent = message;
        status.dataset.kind = kind;
        status.hidden = !message;
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString('es-ES');
    }

    function getType(container) {
        return String(container.type || container.tipo || '').toLowerCase();
    }

    function typeLabel(type) {
        return TYPE_LABELS[type] || (type ? type.replaceAll('_', ' ') : 'Contenedor');
    }

    function typeGroup(type) {
        if (type.startsWith('binder')) return 'binder';
        if (type === 'deck') return 'deck';
        if (type === 'box') return 'box';
        return 'other';
    }

    function capacityDetails(container) {
        const type = getType(container);
        if (type.startsWith('binder')) {
            const pages = Number(container.total_pages) || 0;
            const slotsPerPage = Number(container.slots_per_page) || ({ binder_s: 4, binder_m: 9, binder_xl: 12 }[type] || 0);
            return pages && slotsPerPage ? `${formatNumber(pages)} páginas · ${slotsPerPage} cartas por página` : '';
        }
        if (type === 'deck' && container.sideboard_capacity != null) {
            return `Principal: ${formatNumber(container.max_capacity)} · Reserva: ${formatNumber(container.sideboard_capacity)}`;
        }
        return '';
    }

    function updateSummary() {
        $('summaryTotal').textContent = formatNumber(allContainers.length);
        const measurable = allContainers.filter((container) => container.filled_slots != null && container.slot_capacity != null);
        const used = measurable.reduce((sum, container) => sum + container.filled_slots, 0);
        const free = measurable.reduce((sum, container) => sum + Math.max(0, container.slot_capacity - container.filled_slots), 0);
        $('summaryUsed').textContent = measurable.length ? formatNumber(used) : (allContainers.length ? '—' : '0');
        $('summaryFree').textContent = measurable.length ? formatNumber(free) : (allContainers.length ? '—' : '0');
    }

    function createMessage(text, withCreateLink = false) {
        const p = document.createElement('p');
        p.className = 'list-message';
        if (!withCreateLink) {
            p.textContent = text;
            return p;
        }
        p.append(document.createTextNode(text + ' '));
        const link = document.createElement('a');
        link.href = '#containerName';
        link.textContent = 'Crea el primero';
        p.append(link, document.createTextNode('.'));
        return p;
    }

    function createContainerCard(container) {
        const type = getType(container);
        const group = typeGroup(type);
        const card = document.createElement('a');
        card.className = 'container-card container-card-link';
        card.href = `visor-containers.html?container_id=${encodeURIComponent(container.id)}`;
        card.setAttribute('aria-label', `Abrir ${container.name || 'contenedor'}`);

        const top = document.createElement('div');
        top.className = 'container-card-top';
        const icon = document.createElement('span');
        icon.className = 'container-type-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = TYPE_ICONS[group] || '▣';
        const title = document.createElement('div');
        title.className = 'container-card-title';
        const name = document.createElement('h3');
        name.textContent = container.name || 'Sin nombre';
        name.title = container.name || 'Sin nombre';
        const badge = document.createElement('span');
        badge.className = 'container-type-label';
        badge.textContent = typeLabel(type);
        title.append(name, badge);
        top.append(icon, title);

        const capacity = document.createElement('p');
        capacity.className = 'container-card-capacity';
        capacity.textContent = capacityDetails(container) || (container.slot_capacity != null
            ? `${formatNumber(container.slot_capacity)} huecos en total`
            : 'Capacidad no disponible');

        const track = document.createElement('div');
        track.className = 'capacity-track';
        const progress = document.createElement('span');
        const hasCount = container.filled_slots != null && container.slot_capacity != null;
        const ratio = hasCount && container.slot_capacity > 0 ? Math.min(100, (container.filled_slots / container.slot_capacity) * 100) : 0;
        progress.style.width = `${ratio}%`;
        track.append(progress);
        if (hasCount) {
            track.setAttribute('role', 'meter');
            track.setAttribute('aria-label', `Ocupación de ${container.name || 'contenedor'}`);
            track.setAttribute('aria-valuemin', '0');
            track.setAttribute('aria-valuemax', String(container.slot_capacity));
            track.setAttribute('aria-valuenow', String(container.filled_slots));
        } else {
            track.setAttribute('aria-hidden', 'true');
        }

        const bottom = document.createElement('div');
        bottom.className = 'container-card-bottom';
        const usage = document.createElement('span');
        usage.textContent = hasCount
            ? `${formatNumber(container.filled_slots)} / ${formatNumber(container.slot_capacity)} ocupados`
            : 'Ocupación no disponible';
        const openPrompt = document.createElement('span');
        openPrompt.className = 'container-open-prompt';
        openPrompt.innerHTML = 'Abrir contenedor <span aria-hidden="true">→</span>';
        bottom.append(usage, openPrompt);

        card.append(top, capacity, track, bottom);
        return card;
    }

    function renderList() {
        const selectedType = filter.value;
        const query = search.value.trim().toLocaleLowerCase('es');
        const filtered = allContainers.filter((container) => {
            const type = getType(container);
            const matchesType = selectedType === 'all' || typeGroup(type) === selectedType;
            const matchesName = !query || String(container.name || '').toLocaleLowerCase('es').includes(query);
            return matchesType && matchesName;
        });

        $('containerCountLabel').textContent = filtered.length === allContainers.length
            ? `${formatNumber(allContainers.length)} ${allContainers.length === 1 ? 'contenedor' : 'contenedores'}`
            : `${formatNumber(filtered.length)} de ${formatNumber(allContainers.length)} contenedores`;
        list.replaceChildren();

        if (!allContainers.length) {
            list.appendChild(createMessage('Aún no tienes contenedores. Crea uno para empezar a organizar tus cartas', true));
        } else if (!filtered.length) {
            list.appendChild(createMessage('No hay contenedores que coincidan. Prueba con otro nombre o tipo.'));
        } else {
            filtered.forEach((container) => list.appendChild(createContainerCard(container)));
        }
        list.setAttribute('aria-busy', 'false');
    }

    function syncDynamicFields() {
        const selected = containerTypeSelect.value;
        Object.entries(dynamicFields).forEach(([key, fieldset]) => {
            const active = key === selected;
            fieldset.classList.toggle('active', active);
            fieldset.setAttribute('aria-hidden', String(!active));
            fieldset.querySelectorAll('input, select').forEach((control) => { control.disabled = !active; });
        });
    }

    function updateBinderCapacityHint() {
        const slotsPerPage = { binder_s: 4, binder_m: 9, binder_xl: 12 }[$('binderSize').value] || 9;
        const pages = Math.max(0, Number($('binderPages').value) || 0);
        $('binderCapacityHint').textContent = `Capacidad total: ${formatNumber(slotsPerPage * pages)} cartas`;
    }

    async function loadContainers() {
        if (!CBAuth.requireSession()) return;
        list.setAttribute('aria-busy', 'true');
        try {
            const response = await CBAuth.fetch('/api/containers/');
            if (!response.ok) throw new Error('No se pudo cargar la lista de contenedores.');
            const rawContainers = await response.json();
            let slotErrors = 0;
            allContainers = await Promise.all(rawContainers.map(async (container) => {
                try {
                    const slotResponse = await CBAuth.fetch(`/api/containers/${encodeURIComponent(container.id)}/slots`);
                    if (!slotResponse.ok) throw new Error('No se pudo consultar la capacidad.');
                    const slots = await slotResponse.json();
                    return {
                        ...container,
                        filled_slots: slots.filter((slot) => slot.is_occupied).length,
                        slot_capacity: slots.length,
                    };
                } catch (error) {
                    slotErrors += 1;
                    return {
                        ...container,
                        filled_slots: null,
                        slot_capacity: null,
                    };
                }
            }));
            updateSummary();
            renderList();
            setStatus(slotErrors ? `No se pudo consultar la ocupación de ${slotErrors} ${slotErrors === 1 ? 'contenedor' : 'contenedores'}. Puedes abrirlos para ver su contenido.` : '');
        } catch (error) {
            console.error('Error al cargar contenedores:', error);
            list.replaceChildren(createMessage('No se pudieron cargar tus contenedores. Comprueba la conexión e inténtalo de nuevo.'));
            list.setAttribute('aria-busy', 'false');
            $('containerCountLabel').textContent = 'No se pudo cargar';
            setStatus(error.message, 'error');
        }
    }

    containerTypeSelect.addEventListener('change', syncDynamicFields);
    filter.addEventListener('change', renderList);
    search.addEventListener('input', renderList);
    $('binderSize').addEventListener('change', updateBinderCapacityHint);
    $('binderPages').addEventListener('input', updateBinderCapacityHint);
    syncDynamicFields();
    updateBinderCapacityHint();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!CBAuth.requireSession()) return;

        const name = $('containerName').value.trim();
        const baseType = containerTypeSelect.value;
        if (!name || !baseType) return;

        let type = baseType;
        let max_capacity = null;
        let slots_per_page = 9;
        let total_pages = null;
        let sideboard_capacity = null;
        if (baseType === 'binder') {
            type = $('binderSize').value;
            total_pages = Number($('binderPages').value);
            slots_per_page = { binder_s: 4, binder_m: 9, binder_xl: 12 }[type] || 9;
            max_capacity = total_pages * slots_per_page;
        } else if (baseType === 'deck') {
            max_capacity = Number($('deckMainCapacity').value);
            sideboard_capacity = Number($('deckSideboardCapacity').value);
        } else if (baseType === 'box') {
            max_capacity = Number($('boxCapacity').value);
        }

        createButton.disabled = true;
        createButton.innerHTML = '<span aria-hidden="true">◌</span> Guardando…';
        setStatus('');
        try {
            const response = await CBAuth.fetch('/api/containers/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity }),
            });
            if (!response.ok) {
                let message = 'No se pudo crear el contenedor.';
                try { message = (await response.json()).detail || message; } catch (_) {}
                throw new Error(typeof message === 'string' ? message : 'Revisa los datos e inténtalo de nuevo.');
            }
            const created = await response.json();
            form.reset();
            syncDynamicFields();
            updateBinderCapacityHint();
            await loadContainers();
            setStatus(`«${created.name || name}» se ha creado correctamente.`, 'success');
            $('containerName').focus();
        } catch (error) {
            console.error('Error al crear contenedor:', error);
            setStatus(error.message || 'Hubo un error al crear el contenedor.', 'error');
        } finally {
            createButton.disabled = false;
            createButton.innerHTML = '<span aria-hidden="true">＋</span> Crear contenedor';
        }
    });

    loadContainers();
})();
