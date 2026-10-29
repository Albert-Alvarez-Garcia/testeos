/* containers.js · Gestión de contenedores (containers.html): crear binders, mazos y cajas y listarlos. */
(() => {
    'use strict';

    const containerTypeSelect = document.getElementById('containerType');
    const binderFields = document.getElementById('binderFields');
    const deckFields = document.getElementById('deckFields');
    const boxFields = document.getElementById('boxFields');
    const form = document.getElementById('createContainerForm');
    const containersListWrapper = document.getElementById('containersListWrapper');
    const filterContainerTypeSelect = document.getElementById('filterContainerType');

    let allContainers = [];

    // Limpia la URL por si se llegó con parámetros (p. ej. container_id)
    if (window.location.search) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    function setMessage(text, cssClass) {
        containersListWrapper.replaceChildren();
        const p = document.createElement('p');
        p.className = cssClass;
        p.textContent = text;
        containersListWrapper.appendChild(p);
    }

    function hideAllDynamicFields() {
        binderFields.classList.remove('active');
        deckFields.classList.remove('active');
        boxFields.classList.remove('active');
    }

    // Mostrar u ocultar campos dinámicos según el tipo seleccionado
    containerTypeSelect.addEventListener('change', (e) => {
        hideAllDynamicFields();
        const type = e.target.value;
        if (type === 'binder') binderFields.classList.add('active');
        else if (type === 'deck') deckFields.classList.add('active');
        else if (type === 'box') boxFields.classList.add('active');
    });

    async function cargarContenedores() {
        if (!CBAuth.requireSession()) return;

        try {
            const response = await CBAuth.fetch('/api/containers/');
            if (!response.ok) throw new Error('Error al listar contenedores');
            const containersRaw = await response.json();

            // Consultar slots para saber los ocupados reales
            allContainers = await Promise.all(containersRaw.map(async (c) => {
                try {
                    const slotRes = await CBAuth.fetch(`/api/containers/${encodeURIComponent(c.id)}/slots`);
                    if (slotRes.ok) {
                        const slots = await slotRes.json();
                        return {
                            ...c,
                            filled_slots: slots.filter(s => s.is_occupied).length,
                            max_capacity: slots.length
                        };
                    }
                } catch (e) {
                    console.error(`No se pudieron cargar slots para el contenedor ${c.id}`);
                }
                return { ...c, filled_slots: 0, max_capacity: c.max_capacity || 0 };
            }));

            renderizarListadoContenedores();
        } catch (err) {
            console.error('Error al cargar contenedores:', err);
            setMessage('Error al cargar el listado de contenedores.', 'msg-error');
        }
    }

    function renderizarListadoContenedores() {
        const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';

        const filtered = allContainers.filter(c => {
            if (selectedType === 'all') return true;
            const tipoContenedor = (c.type || c.tipo || '').toLowerCase();
            return tipoContenedor.includes(selectedType.toLowerCase());
        });

        if (filtered.length === 0) {
            setMessage('No se encontraron contenedores con este filtro.', 'muted');
            return;
        }

        containersListWrapper.replaceChildren();

        filtered.forEach(c => {
            const tipo = (c.type || 'general').toUpperCase();
            const slotsLlenos = c.filled_slots ?? c.current_cards ?? c.used ?? 0;
            const capacidadTotal = c.max_capacity || c.capacity || 'N/A';

            const row = document.createElement('div');
            row.className = 'container-item-row';

            const link = document.createElement('a');
            link.className = 'container-link';
            link.href = 'visor-containers.html?container_id=' + encodeURIComponent(c.id);
            link.textContent = c.name || 'Sin nombre';

            const meta = document.createElement('span');
            meta.className = 'container-item-meta';
            meta.textContent = `[${tipo}] - Slots: ${slotsLlenos} / ${capacidadTotal}`;

            const left = document.createElement('div');
            left.appendChild(link);
            const right = document.createElement('div');
            right.appendChild(meta);

            row.append(left, right);
            containersListWrapper.appendChild(row);
        });
    }

    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', renderizarListadoContenedores);
    }

    // Envío estructurado de datos con subcampos y autenticación
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!CBAuth.requireSession()) return;

        const name = document.getElementById('containerName').value.trim();
        const baseType = containerTypeSelect.value;

        let type = baseType;
        let max_capacity = null;
        let slots_per_page = 9;
        let total_pages = null;
        let sideboard_capacity = null;

        if (baseType === 'binder') {
            type = document.getElementById('binderSize').value; // binder_s | binder_m | binder_xl
            total_pages = parseInt(document.getElementById('binderPages').value, 10) || 40;

            if (type === 'binder_s') slots_per_page = 4;
            else if (type === 'binder_xl') slots_per_page = 12;
            else slots_per_page = 9;

            max_capacity = total_pages * slots_per_page;
        } else if (baseType === 'deck') {
            max_capacity = parseInt(document.getElementById('deckMainCapacity').value, 10) || 60;
            sideboard_capacity = parseInt(document.getElementById('deckSideboardCapacity').value, 10) || 15;
        } else if (baseType === 'box') {
            max_capacity = parseInt(document.getElementById('boxCapacity').value, 10) || 1000;
        }

        try {
            const response = await CBAuth.fetch('/api/containers/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, max_capacity, slots_per_page, total_pages, sideboard_capacity })
            });

            if (!response.ok) throw new Error('Error al registrar el contenedor');

            const result = await response.json();
            alert(`¡Contenedor "${result.name}" creado con éxito!`);
            form.reset();
            hideAllDynamicFields();
            await cargarContenedores();
        } catch (error) {
            console.error('Error:', error);
            alert('Hubo un error al crear el contenedor en el servidor.');
        }
    });

    cargarContenedores();
})();
