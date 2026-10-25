/********************************************************************************
- [MODULE]: VISOR DE CONTENEDORES Y BINDERS (visor-containers.js)
- [DESCRIPTION]: Lógica de renderizado unificada, listado inicial de contenedores
-                del usuario, borrado persistente en BBDD y visor Lightbox integrado.
 ********************************************************************************/

document.addEventListener('DOMContentLoaded', () => {
    const containerSelector = document.getElementById('containerSelector');
    const containerTitle = document.getElementById('containerTitle');
    const containerStats = document.getElementById('containerStats');
    const containerInfoBar = document.getElementById('containerInfoBar');
    const visualWorkspace = document.getElementById('visualWorkspace');
    const filterContainerTypeSelect = document.getElementById('filterContainerType');
    const showAllContainersBtn = document.getElementById('showAllContainersBtn');
    const backToGridBtn = document.getElementById('backToGridBtn');

    // Referencias al Lightbox unificado
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.getElementById('lightbox-close');

    if (lightboxClose) {
        lightboxClose.addEventListener('click', () => lightbox.close());
    }
    if (lightbox) {
        lightbox.addEventListener('click', (event) => {
            if (event.target === lightbox) lightbox.close();
        });
    }

    let currentContainerData = null;
    let allContainers = [];
    let currentBinderPage = 1;

    // Estado para borrado modal
    let slotParaBorrarIndex = null;
    let slotsActualesCache = [];
    let renderCallbackActual = null;

    function getAuthHeader() {
        let username = 'admin';
        try {
            const userData = JSON.parse(localStorage.getItem('cardbinder_user')) || 
                             JSON.parse(localStorage.getItem('user_session'));
            if (userData && userData.username) {
                username = userData.username;
            }
        } catch (e) {
            console.error('Error leyendo usuario:', e);
        }
        return { 'X-Username': username };
    }

    async function cargarContenedores() {
        try {
            const response = await fetch('http://localhost:8000/api/containers/', {
                headers: { ...getAuthHeader() }
            });
            if (!response.ok) throw new Error('Error al listar contenedores');
            allContainers = await response.json();
            
            actualizarDesplegableVisorGrafico();

            const paramContainerId = new URLSearchParams(window.location.search).get('container_id');
            if (paramContainerId && containerSelector) {
                const existe = allContainers.some(c => c.id === paramContainerId);
                if (existe) {
                    containerSelector.value = paramContainerId;
                    containerSelector.dispatchEvent(new Event('change'));
                    return;
                }
            }

            renderizarRejillaContenedores();
        } catch (err) {
            console.error("Error al cargar contenedores:", err);
            visualWorkspace.innerHTML = `<div class="text-center text-red-400 py-12 text-xs">Error al conectar con el servidor para obtener los contenedores.</div>`;
        }
    }

    function actualizarDesplegableVisorGrafico() {
        if (!containerSelector) return;
        const valorPrevio = containerSelector.value;
        const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';

        containerSelector.innerHTML = '<option value="">-- Elige un contenedor --</option>';
        
        const containersFiltered = obtenerContenedoresFiltrados(selectedType);

        containersFiltered.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = `${c.name || 'Sin nombre'} [${(c.type || 'general').toUpperCase()}]`;
            containerSelector.appendChild(option);
        });

        if (valorPrevio) containerSelector.value = valorPrevio;
    }

    function obtenerContenedoresFiltrados(typeFilter) {
        if (!typeFilter || typeFilter === 'all') return allContainers;
        return allContainers.filter(c => (c.type || c.tipo || '').toLowerCase().includes(typeFilter.toLowerCase()));
    }

    // --- RENDERIZADO DE LA REJILLA DE TODOS LOS CONTENEDORES (FORMATO ORIGINAL RESTAURADO) ---
    function renderizarRejillaContenedores() {
        containerInfoBar.classList.add('hidden');
        showAllContainersBtn.classList.add('hidden');
        containerSelector.value = "";
        currentContainerData = null;

        const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';
        const lista = obtenerContenedoresFiltrados(selectedType);

        if (!lista || lista.length === 0) {
            visualWorkspace.innerHTML = `
                <div class="fantasy-panel p-12 text-center">
                    <p class="text-amber-200/60 text-sm mb-2">No se encontraron contenedores para el filtro seleccionado.</p>
                    <span class="text-xs text-amber-200/40">Crea nuevos binders o mazos desde el panel principal.</span>
                </div>
            `;
            return;
        }

        let html = `
            <div class="mb-4 flex justify-between items-center">
                <h2 class="font-magic text-base font-bold text-amber-400 uppercase tracking-wider">🏰 Tus Bóvedas y Archivadores (${lista.length})</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        `;

        lista.forEach(c => {
            const tipoUpper = (c.type || 'GENERAL').toUpperCase();
            const icon = tipoUpper.includes('BINDER') ? '📖' : tipoUpper.includes('DECK') ? '🎴' : '📦';
            
            html += `
                <div data-container-id="${c.id}" class="container-card fantasy-panel rounded-2xl p-5 cursor-pointer flex flex-col justify-between h-[170px]">
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-magic font-bold text-amber-300 text-base flex items-center gap-2">
                                <span>${icon}</span> ${c.name || 'Sin Nombre'}
                            </h3>
                            <span class="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                ${tipoUpper}
                            </span>
                        </div>
                        <p class="text-xs text-amber-200/60">Capacidad Máxima: <strong class="text-amber-300">${c.max_capacity || 'N/A'}</strong> slots</p>
                    </div>

                    <div class="flex justify-between items-center border-t border-[#b39258]/20 pt-3 mt-2">
                        <span class="text-[11px] text-amber-200/50">Haz clic para desplegar ➔</span>
                        <button class="btn-fantasy text-xs py-1.5 px-3">
                            Inspeccionar
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        visualWorkspace.innerHTML = html;

        visualWorkspace.querySelectorAll('[data-container-id]').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.getAttribute('data-container-id');
                if (id && containerSelector) {
                    containerSelector.value = id;
                    containerSelector.dispatchEvent(new Event('change'));
                }
            });
        });
    }

    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', () => {
            actualizarDesplegableVisorGrafico();
            if (!currentContainerData) {
                renderizarRejillaContenedores();
            }
        });
    }

    if (containerSelector) {
        containerSelector.addEventListener('change', async (e) => {
            const containerId = e.target.value;
            if (!containerId) {
                renderizarRejillaContenedores();
                return;
            }

            currentContainerData = allContainers.find(c => c.id === containerId);
            if (!currentContainerData) return;
            
            containerInfoBar.classList.remove('hidden');
            showAllContainersBtn.classList.remove('hidden');

            containerTitle.textContent = currentContainerData.name;
            containerStats.textContent = `Tipo: ${currentContainerData.type.toUpperCase()} | Capacidad Máx: ${currentContainerData.max_capacity || 'N/A'}`;

            currentBinderPage = 1;
            await cargarSlotsContenedor(containerId);
        });
    }

    if (backToGridBtn) backToGridBtn.addEventListener('click', renderizarRejillaContenedores);
    if (showAllContainersBtn) showAllContainersBtn.addEventListener('click', renderizarRejillaContenedores);

    async function cargarSlotsContenedor(containerId) {
        visualWorkspace.innerHTML = `<div class="text-center text-amber-200/50 py-12 italic text-xs">Cargando estructura del contenedor...</div>`;
        
        try {
            const response = await fetch(`http://localhost:8000/api/containers/${containerId}/slots`, {
                headers: { ...getAuthHeader() }
            });
            if (!response.ok) throw new Error('Error al obtener slots');
            
            const slots = await response.json();
            const tipo = currentContainerData.type.toLowerCase();
            
            if (tipo.includes('binder')) {
                renderizarBinder(slots);
            } else {
                renderizarDeckBox(slots);
            }
        } catch (err) {
            console.error("Error:", err);
            visualWorkspace.innerHTML = `<div class="text-center text-red-400 py-12 text-xs">Error al cargar la estructura del contenedor.</div>`;
        }
    }

    // --- MODAL Y BORRADO EN BBDD ---
    function abrirModalBorrado(index, slotsArray, renderFunc, nombreCarta) {
        slotParaBorrarIndex = index;
        slotsActualesCache = slotsArray;
        renderCallbackActual = renderFunc;

        const modal = document.getElementById('deleteConfirmModal');
        const textInfo = document.getElementById('deleteModalText');
        if (textInfo) {
            textInfo.textContent = `¿Estás seguro de que deseas eliminar "${nombreCarta || 'esta carta'}" de este hueco?`;
        }
        if (modal) modal.classList.remove('hidden');
    }

    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            document.getElementById('deleteConfirmModal').classList.add('hidden');
            slotParaBorrarIndex = null;
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (slotParaBorrarIndex !== null && slotsActualesCache.length > 0) {
                const slotAEliminar = slotsActualesCache[slotParaBorrarIndex];
                const copyId = slotAEliminar.copy_id;

                try {
                    if (copyId) {
                        const response = await fetch(`http://localhost:8000/api/containers/items/${copyId}`, {
                            method: 'DELETE',
                            headers: { ...getAuthHeader() }
                        });
                        if (!response.ok) throw new Error('Error al eliminar copia en BBDD');
                    }

                    slotsActualesCache[slotParaBorrarIndex] = {
                        ...slotsActualesCache[slotParaBorrarIndex],
                        is_occupied: false,
                        card_id: null,
                        copy_id: null,
                        card_name: null,
                        mana_cost: null,
                        type_line: null,
                        image_uri: null,
                        condition: 'NM',
                        is_foil: false,
                        notes: null
                    };

                    if (renderCallbackActual) renderCallbackActual(slotsActualesCache);
                } catch (err) {
                    console.error("Error al eliminar carta:", err);
                    alert("No se pudo eliminar la copia de la base de datos.");
                }
            }
            document.getElementById('deleteConfirmModal').classList.add('hidden');
            slotParaBorrarIndex = null;
        });
    }

    // --- RENDERIZADO DE BINDER ---
    function renderizarBinder(slots) {
        let columnas = 3;
        let itemsPerPage = 9;

        if (currentContainerData) {
            const containerType = (currentContainerData.type || "").toLowerCase();
            if (containerType === 'binder_s') { columnas = 2; itemsPerPage = 4; }
            else if (containerType === 'binder_xl' || containerType === 'binder_l') { columnas = 4; itemsPerPage = 12; }
            else if (containerType === 'binder_m') { columnas = 3; itemsPerPage = 9; }
        }

        const maxCapacity = Number(currentContainerData.max_capacity || currentContainerData.capacity || slots.length || (itemsPerPage * 3));
        const totalPages = Math.ceil(maxCapacity / itemsPerPage);
        
        while (slots.length < totalPages * itemsPerPage) {
            const nuevoIndex = slots.length + 1;
            slots.push({
                id: null,
                slot_index: ((nuevoIndex - 1) % itemsPerPage) + 1,
                page_number: Math.floor((nuevoIndex - 1) / itemsPerPage) + 1,
                is_occupied: false,
                card_id: null, copy_id: null, card_name: null, image_uri: null
            });
        }

        if (currentBinderPage > totalPages) currentBinderPage = 1;

        visualWorkspace.innerHTML = `
            <div class="binder-navigation-controls" style="display: flex; justify-content: space-between; align-items: center; width: 100%; position: relative; margin-bottom: 10px;">
                <div></div>
                <div class="page-indicator" style="position: absolute; left: 50%; transform: translateX(-50%);">
                    Página <strong id="currentPageNum">${currentBinderPage}</strong> de ${totalPages}
                </div>
                <div></div>
            </div>

            <div class="binder-viewport-wrapper">
                <button id="prevPageBtn" class="side-nav-arrow left" ${currentBinderPage <= 1 ? 'disabled' : ''}>❮</button>
                <div class="binder-page-container" id="binderPageGrid" data-columns="${columnas}"></div>
                <button id="nextPageBtn" class="side-nav-arrow right" ${currentBinderPage >= totalPages ? 'disabled' : ''}>❯</button>
            </div>
        `;

        const gridEl = document.getElementById('binderPageGrid');
        const startIndex = (currentBinderPage - 1) * itemsPerPage;
        const currentSlots = slots.slice(startIndex, startIndex + itemsPerPage);

        currentSlots.forEach((slot, localIdx) => {
            const absoluteIndex = startIndex + localIdx;
            const slotDiv = document.createElement('div');
            slotDiv.className = `binder-slot ${slot.is_occupied ? 'occupied' : 'empty'}`;
            
            if (slot.is_occupied && slot.image_uri) {
                slotDiv.innerHTML = `
                    <img src="${slot.image_uri}" alt="${slot.card_name}" loading="lazy">
                    <div class="slot-overlay-info">
                        <span class="slot-badge">${slot.condition || 'NM'}</span>
                        ${slot.is_foil ? '<span class="foil-badge">Foil</span>' : ''}
                    </div>
                    <button class="delete-slot-btn" title="Eliminar carta" style="position: absolute; bottom: 6px; left: 6px; background: rgba(239, 68, 68, 0.9); border: none; color: #fff; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.75rem; z-index: 10;">🗑️ Borrar</button>
                `;

                const deleteBtn = slotDiv.querySelector('.delete-slot-btn');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    abrirModalBorrado(absoluteIndex, slots, renderizarBinder, slot.card_name);
                });

                slotDiv.addEventListener('click', () => {
                    if (slot.image_uri && lightbox) {
                        lightboxImg.src = slot.image_uri;
                        lightboxImg.alt = slot.card_name || 'Carta';
                        lightboxCaption.textContent = slot.card_name || 'Carta en contenedor';
                        lightbox.showModal();
                    }
                });
            } else {
                slotDiv.innerHTML = `<span class="empty-slot-text">Hueco ${(absoluteIndex % itemsPerPage) + 1}</span>`;
            }

            gridEl.appendChild(slotDiv);
        });

        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (currentBinderPage > 1) { currentBinderPage--; renderizarBinder(slots); }
        });
        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (currentBinderPage < totalPages) { currentBinderPage++; renderizarBinder(slots); }
        });
    }

    // --- RENDERIZADO DE DECK / BOX ---
    function renderizarDeckBox(slots) {
        const isDeck = currentContainerData && currentContainerData.type.toLowerCase().includes('deck');
        let allMainSlots = [], allSideSlots = [];

        if (isDeck) {
            slots.forEach(slot => {
                if ((slot.section || 'main').toLowerCase() === 'sideboard') {
                    allSideSlots.push(slot);
                } else {
                    allMainSlots.push(slot);
                }
            });
        } else {
            allMainSlots = slots;
        }

        allMainSlots.forEach((s, i) => s.slot_index = i + 1);
        allSideSlots.forEach((s, i) => s.slot_index = allMainSlots.length + i + 1);

        const allSlotsCombined = [...allMainSlots, ...allSideSlots];

        visualWorkspace.innerHTML = `
            <div class="deck-controls-bar" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 15px;">
                <div class="deck-counters">
                    <span>Ocupados: ${allSlotsCombined.filter(s => s.is_occupied).length}/${allSlotsCombined.length}</span>
                </div>
            </div>
            <div class="deck-scroll-container">
                ${isDeck ? '<div class="deck-section-title">Mainboard</div>' : ''}
                <div class="deck-compact-row" id="mainGrid"></div>
                ${allSideSlots.length > 0 ? '<div class="deck-section-title" style="margin-top: 2rem;">Sideboard</div><div class="deck-compact-row" id="sideGrid"></div>' : ''}
            </div>
        `;

        const renderSlotItem = (slot, absoluteIndex) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'deck-slot-wrapper';

            const item = document.createElement('div');
            item.className = `deck-slot-compact ${slot.is_occupied ? 'occupied' : 'empty-compact'}`;

            if (slot.is_occupied && slot.image_uri) {
                item.innerHTML = `
                    <img src="${slot.image_uri}" alt="${slot.card_name}" loading="lazy">
                    <span class="compact-slot-badge">#${slot.slot_index}</span>
                    <button class="delete-deck-btn" title="Borrar" style="position: absolute; top: 2px; right: 2px; background: rgba(239, 68, 68, 0.9); border: none; color: #fff; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 10;">✕</button>
                `;

                item.querySelector('.delete-deck-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    abrirModalBorrado(absoluteIndex, allSlotsCombined, renderizarDeckBox, slot.card_name);
                });

                item.querySelector('img').addEventListener('click', () => {
                    if (slot.image_uri && lightbox) {
                        lightboxImg.src = slot.image_uri;
                        lightboxImg.alt = slot.card_name || 'Carta';
                        lightboxCaption.textContent = slot.card_name || 'Carta en mazo';
                        lightbox.showModal();
                    }
                });
            } else {
                item.innerHTML = `<span class="empty-slot-mini">${slot.slot_index}</span>`;
            }

            wrapper.appendChild(item);
            const nameLabel = document.createElement('span');
            nameLabel.className = 'deck-card-name-label';
            nameLabel.textContent = slot.card_name || 'Vacío';
            wrapper.appendChild(nameLabel);

            return wrapper;
        };

        const mainGrid = document.getElementById('mainGrid');
        allMainSlots.forEach((slot, index) => {
            mainGrid.appendChild(renderSlotItem(slot, index));
        });

        if (allSideSlots.length > 0) {
            const sideGrid = document.getElementById('sideGrid');
            allSideSlots.forEach((slot, index) => {
                sideGrid.appendChild(renderSlotItem(slot, allMainSlots.length + index));
            });
        }
    }

    cargarContenedores();
});