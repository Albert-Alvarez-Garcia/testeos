document.addEventListener('DOMContentLoaded', () => {
    const containerSelector = document.getElementById('containerSelector');
    const containerTitle = document.getElementById('containerTitle');
    const containerStats = document.getElementById('containerStats');
    const visualWorkspace = document.getElementById('visualWorkspace');
    const filterContainerTypeSelect = document.getElementById('filterContainerType');

    // Elementos de la Lupa 2.5D
    const container = document.getElementById('cardContainer');
    const card = document.getElementById('interactiveCard');
    const cardImage = document.getElementById('dynamicCardImg');
    const magnifier = document.getElementById('cardMagnifier');
    const toggleBtn = document.getElementById('toggleMagnifierBtn');
    const modeStatus = document.getElementById('modeStatus');

    let isMagnifierEnabled = false;
    let currentContainerData = null;
    let allContainers = [];
    let currentBinderPage = 1;

    // --- ESTADOS GLOBALES DE MOVIMIENTO DE CARTAS ---
    let isMoveModeActive = false;
    let slotOrigenIndex = null;
    let hasUnsavedChanges = false;

    const ZOOM_SCALE = 2; 
    const MAGNIFIER_SIZE = 160; 

    // --- 1. LECTURA DIRECTA DE PARÁMETROS DE URL ---
    const urlParams = new URLSearchParams(window.location.search);
    const paramImg = urlParams.get('img');
    const paramName = urlParams.get('name');
    const paramType = urlParams.get('type');
    const paramMana = urlParams.get('mana');

    if (paramImg) {
        if (cardImage) {
            cardImage.src = decodeURIComponent(paramImg);
            cardImage.style.maxWidth = "100%";
            cardImage.style.maxHeight = "100%";
            cardImage.style.objectFit = "contain";
        }

        const visorName = document.getElementById("visorCardName");
        const visorMana = document.getElementById("visorCardMana");
        const visorType = document.getElementById("visorCardType");

        if (visorName) visorName.textContent = decodeURIComponent(paramName || "Carta seleccionada");
        if (visorMana) visorMana.textContent = decodeURIComponent(paramMana || "");
        if (visorType) visorType.textContent = decodeURIComponent(paramType || "");
    }

    // --- 2. CONTROL DE LA LUPA 2.5D ---
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            isMagnifierEnabled = !isMagnifierEnabled;
            if (isMagnifierEnabled) {
                toggleBtn.classList.add('active');
                modeStatus.textContent = 'ACTIVADO';
            } else {
                toggleBtn.classList.remove('active');
                modeStatus.textContent = 'DESACTIVADO';
                magnifier.classList.remove('is-visible');
            }
        });
    }

    if (cardImage) {
        cardImage.addEventListener('load', () => {
            if (card && magnifier) {
                magnifier.style.backgroundSize = `${card.offsetWidth * ZOOM_SCALE}px auto`;
            }
        });
    }

    if (container && card && magnifier) {
        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            if (isMagnifierEnabled) {
                if (!magnifier.classList.contains('is-visible')) {
                    magnifier.classList.add('is-visible');
                }

                const magX = mouseX - (MAGNIFIER_SIZE / 2);
                const magY = mouseY - (MAGNIFIER_SIZE / 2);
                magnifier.style.left = `${magX}px`;
                magnifier.style.top = `${magY}px`;

                const percentX = mouseX / rect.width;
                const percentY = mouseY / rect.height;

                const bgPosX = -(percentX * (card.offsetWidth * ZOOM_SCALE)) + (MAGNIFIER_SIZE / 2);
                const bgPosY = -(percentY * (card.offsetHeight * ZOOM_SCALE)) + (MAGNIFIER_SIZE / 2);

                magnifier.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
                magnifier.style.backgroundImage = `url(${cardImage.src})`;
            } else {
                magnifier.classList.remove('is-visible');
            }

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = -((mouseY - centerY) / centerY) * 15;
            const rotateY = ((mouseX - centerX) / centerX) * 15;

            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
        });

        container.addEventListener('mouseleave', () => {
            magnifier.classList.remove('is-visible');
            card.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
        });
    }

    // --- 3. CARGA DE CONTENEDORES ---
    async function cargarContenedores() {
        try {
            const response = await fetch('http://localhost:8000/api/containers/');
            if (!response.ok) throw new Error('Error al listar contenedores');
            allContainers = await response.json();
            actualizarDesplegableVisorGrafico();
        } catch (err) {
            console.error("Error al cargar contenedores:", err);
            if (containerSelector) containerSelector.innerHTML = '<option value="">Error al cargar contenedores</option>';
        }
    }

    function actualizarDesplegableVisorGrafico() {
        if (!containerSelector) return;
        
        const valorPrevio = containerSelector.value;
        const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';

        containerSelector.innerHTML = '<option value="">Selecciona un contenedor para ver...</option>';
        
        const containersFiltered = allContainers.filter(c => {
            const tipoContenedor = (c.type || c.tipo || '').toLowerCase();
            if (selectedType === 'all') return true;
            return tipoContenedor.includes(selectedType.toLowerCase());
        });

        containersFiltered.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;
            const nombre = c.name || 'Sin nombre';
            const tipo = (c.type || 'general').toUpperCase();
            option.textContent = `${nombre} [${tipo}]`;
            containerSelector.appendChild(option);
        });

        if (valorPrevio) {
            containerSelector.value = valorPrevio;
        }

        if (containerSelector.value === "") {
            if (containerTitle) containerTitle.textContent = "Selecciona un contenedor";
            if (containerStats) containerStats.textContent = "—";
            if (visualWorkspace) visualWorkspace.innerHTML = `<div class="placeholder-msg"><p style="color: var(--text-muted);">Selecciona el mazo o archivador...</p></div>`;
            currentContainerData = null;
        }
    }

    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', actualizarDesplegableVisorGrafico);
    }

    if (containerSelector) {
        containerSelector.addEventListener('change', async (e) => {
            const containerId = e.target.value;
            if (!containerId) {
                containerTitle.textContent = "Selecciona un contenedor";
                containerStats.textContent = "—";
                visualWorkspace.innerHTML = `<div class="placeholder-msg"><p style="color: var(--text-muted);">Elige un archivador o mazo arriba para desplegar sus páginas y huecos...</p></div>`;
                return;
            }

            currentContainerData = allContainers.find(c => c.id === containerId);
            if (!currentContainerData) return;
            
            containerTitle.textContent = currentContainerData.name;
            containerStats.textContent = `Tipo: ${currentContainerData.type.toUpperCase()} | Capacidad Máx: ${currentContainerData.max_capacity || 'N/A'}`;

            slotOrigenIndex = null;
            hasUnsavedChanges = false;
            currentBinderPage = 1;
            await cargarSlotsContenedor(containerId);
        });
    }

    async function cargarSlotsContenedor(containerId) {
        visualWorkspace.innerHTML = `<div class="placeholder-msg"><p style="color: var(--text-muted);">Cargando estructura física...</p></div>`;
        
        try {
            const response = await fetch(`http://localhost:8000/api/containers/${containerId}/slots`);
            if (!response.ok) throw new Error('Error al obtener los slots del contenedor');
            
            const slots = await response.json();
            const tipo = currentContainerData.type.toLowerCase();
            
            if (tipo.includes('binder')) {
                renderizarBinder(slots);
            } else {
                renderizarDeckBox(slots);
            }
        } catch (err) {
            console.error("Error:", err);
            visualWorkspace.innerHTML = `<div class="placeholder-msg"><p style="color: #ef4444;">Error al cargar los elementos del contenedor.</p></div>`;
        }
    }

// --- ESTADO GLOBAL O COMPARTIDO PARA LOS MODOS DE MOVIMIENTO ---
let isInterContainerMode = false; // Por defecto apagado: mueve entre huecos del mismo contenedor

function renderizarBinder(slots) {
    let columnas = 3;
    let itemsPerPage = 9;

    if (currentContainerData) {
        const containerType = (currentContainerData.type || "").toLowerCase();

        if (containerType === 'binder_s') {
            columnas = 2;
            itemsPerPage = 4;
        } else if (containerType === 'binder_xl' || containerType === 'binder_l') {
            columnas = 4;
            itemsPerPage = 12;
        } else if (containerType === 'binder_m') {
            columnas = 3;
            itemsPerPage = 9;
        } else {
            columnas = 3;
            itemsPerPage = 9;
        }
    }

    const maxCapacity = Number(
        currentContainerData.max_capacity || 
        currentContainerData.capacity || 
        slots.length || 
        (itemsPerPage * 3)
    );

    const totalPages = Math.ceil(maxCapacity / itemsPerPage);
    
    const totalSlotsRequeridos = totalPages * itemsPerPage;
    while (slots.length < totalSlotsRequeridos) {
        const nuevoIndex = slots.length + 1;
        slots.push({
            id: null,
            slot_index: ((nuevoIndex - 1) % itemsPerPage) + 1,
            page_number: Math.floor((nuevoIndex - 1) / itemsPerPage) + 1,
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
        });
    }

    if (currentBinderPage > totalPages) currentBinderPage = 1;

    visualWorkspace.innerHTML = `
        <div class="binder-navigation-controls" style="display: flex; justify-content: space-between; align-items: center; width: 100%; position: relative; margin-bottom: 10px; flex-wrap: wrap; gap: 10px;">
            <div></div>
            
            <div class="page-indicator" style="position: absolute; left: 50%; transform: translateX(-50%);">
                Página <strong id="currentPageNum">${currentBinderPage}</strong> de ${totalPages}
            </div>
            
            <div style="display: flex; gap: 8px; margin-left: auto; align-items: center; flex-wrap: wrap;">
                <!-- Sub-opción que solo aparece cuando Mover Cartas está ON -->
                ${isMoveModeActive ? `
                    <button id="toggleInterContainerBtn" class="nav-btn" style="border-color: #f59e0b; color: ${isInterContainerMode ? '#f59e0b' : '#aaa'}; background: ${isInterContainerMode ? '#3d2a1d' : 'transparent'}; font-size: 0.85rem;">
                        Mover a otro Contenedor: ${isInterContainerMode ? 'ON' : 'OFF'}
                    </button>
                ` : ''}

                <button id="toggleMoveModeBtn" class="nav-btn" style="border-color: #b39258;">Mover Cartas: ${isMoveModeActive ? 'ON' : 'OFF'}</button>
                <button id="saveSlotsBtn" class="nav-btn" style="background: #10b981; color: white; border-color: #059669; display: ${hasUnsavedChanges ? 'inline-block' : 'none'};">💾 Guardar Cambios</button>
            </div>
        </div>

        <!-- Modal para elegir el contenedor de destino (solo si el submodo está activo) -->
        <div id="transferModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; justify-content: center; align-items: center;">
            <div style="background: #1e1e1e; padding: 25px; border-radius: 12px; border: 1px solid #b39258; width: 400px; max-width: 90%; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <h3 style="color: #f59e0b; margin-top: 0; margin-bottom: 15px; font-size: 1.2rem;">Mover carta a otro contenedor</h3>
                <p id="transferCardNameInfo" style="color: #fff; font-size: 0.9rem; margin-bottom: 15px;"></p>
                
                <label style="display: block; color: #aaa; font-size: 0.85rem; margin-bottom: 5px;">Selecciona el contenedor de destino:</label>
                <select id="destinationContainerSelect" style="width: 100%; padding: 10px; background: #2a2a2a; color: #fff; border: 1px solid #444; border-radius: 6px; margin-bottom: 20px;">
                    <option value="">-- Elige destino --</option>
                </select>

                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="cancelTransferBtn" style="padding: 8px 16px; background: #333; color: #fff; border: none; border-radius: 6px; cursor: pointer;">Cancelar</button>
                    <button id="confirmTransferBtn" style="padding: 8px 16px; background: #b39258; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Mover Carta</button>
                </div>
            </div>
        </div>

        <div class="binder-viewport-wrapper">
            <button id="prevPageBtn" class="side-nav-arrow left" ${currentBinderPage <= 1 ? 'disabled' : ''} title="Página Anterior">❮</button>
            
            <div class="binder-page-container" id="binderPageGrid"></div>

            <button id="nextPageBtn" class="side-nav-arrow right" ${currentBinderPage >= totalPages ? 'disabled' : ''} title="Página Siguiente">❯</button>
        </div>
    `;

    const gridEl = document.getElementById('binderPageGrid');
    gridEl.setAttribute('data-columns', columnas);

    const startIndex = (currentBinderPage - 1) * itemsPerPage;
    const currentSlots = slots.slice(startIndex, startIndex + itemsPerPage);

    const toggleMoveBtn = document.getElementById('toggleMoveModeBtn');
    const toggleInterContainerBtn = document.getElementById('toggleInterContainerBtn');
    const saveSlotsBtn = document.getElementById('saveSlotsBtn');
    
    if (isMoveModeActive) {
        toggleMoveBtn.style.background = '#3d2a1d';
        toggleMoveBtn.style.color = '#f59e0b';
    }

    toggleMoveBtn.addEventListener('click', () => {
        isMoveModeActive = !isMoveModeActive;
        if (!isMoveModeActive) {
            isInterContainerMode = false;
        }
        slotOrigenIndex = null;
        renderizarBinder(slots);
    });

    if (toggleInterContainerBtn) {
        toggleInterContainerBtn.addEventListener('click', () => {
            isInterContainerMode = !isInterContainerMode;
            slotOrigenIndex = null;
            renderizarBinder(slots);
        });
    }

    if (saveSlotsBtn) {
        saveSlotsBtn.addEventListener('click', async () => {
            saveSlotsBtn.textContent = 'Guardando...';
            saveSlotsBtn.disabled = true;

            try {
                const payload = slots.map((s, idx) => ({
                    id: s.id || null,
                    slot_index: (idx % itemsPerPage) + 1,
                    page_number: Math.floor(idx / itemsPerPage) + 1,
                    is_occupied: !!s.is_occupied,
                    card_id: s.card_id || null,
                    copy_id: s.copy_id || null,
                    condition: s.condition || 'NM',
                    is_foil: !!s.is_foil,
                    notes: s.notes || null
                }));

                const response = await fetch(`http://localhost:8000/api/containers/${currentContainerData.id}/slots`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error('Error al guardar la distribución');

                hasUnsavedChanges = false;
                alert('¡Distribución guardada correctamente!');
                await cargarSlotsContenedor(currentContainerData.id);
            } catch (err) {
                console.error(err);
                alert('Hubo un error al guardar los cambios.');
                saveSlotsBtn.textContent = '💾 Guardar Cambios';
                saveSlotsBtn.disabled = false;
            }
        });
    }

    currentSlots.forEach((slot, localIdx) => {
        const absoluteIndex = startIndex + localIdx;
        
        const slotDiv = document.createElement('div');
        slotDiv.className = `binder-slot ${slot.is_occupied ? 'occupied' : 'empty'}`;
        
        if (slotOrigenIndex === absoluteIndex) {
            slotDiv.classList.add('selected-origin');
        }

        if (slot.is_occupied && slot.image_uri) {
            slotDiv.innerHTML = `
                <img src="${slot.image_uri}" alt="${slot.card_name}" loading="lazy">
                <div class="slot-overlay-info">
                    <span class="slot-badge">${slot.condition || 'NM'}</span>
                    ${slot.is_foil ? '<span class="foil-badge">Foil</span>' : ''}
                </div>
            `;
            slotDiv.title = `${slot.card_name} (${slot.type_line})`;
        } else {
            slotDiv.innerHTML = `<span class="empty-slot-text">Hueco ${(absoluteIndex % itemsPerPage) + 1}</span>`;
        }

        slotDiv.addEventListener('click', () => {
            if (!isMoveModeActive) {
                if (slot.is_occupied && slot.card_id) {
                    const encodedImg = encodeURIComponent(slot.image_uri || '');
                    const encodedName = encodeURIComponent(slot.card_name || '');
                    const encodedType = encodeURIComponent(slot.type_line || '');
                    const encodedMana = encodeURIComponent(slot.mana_cost || '');
                    
                    window.location.href = `gestor-contenedor.html?card_id=${slot.card_id}&printing_id=${slot.copy_id}&img=${encodedImg}&name=${encodedName}&type=${encodedType}&mana=${encodedMana}`;
                }
                return;
            }

            if (isInterContainerMode) {
                if (slot.is_occupied) {
                    slotOrigenIndex = absoluteIndex;
                    const modal = document.getElementById('transferModal');
                    const nameInfo = document.getElementById('transferCardNameInfo');
                    const destSelect = document.getElementById('destinationContainerSelect');

                    nameInfo.textContent = `Carta seleccionada: "${slot.card_name}"`;
                    
                    destSelect.innerHTML = '<option value="">-- Elige contenedor destino --</option>';
                    if (typeof allContainers !== 'undefined' && Array.isArray(allContainers)) {
                        allContainers
                            .filter(c => c.id !== currentContainerData.id)
                            .forEach(c => {
                                const opt = document.createElement('option');
                                opt.value = c.id;
                                opt.textContent = `${c.name} [${(c.type || 'general').toUpperCase()}]`;
                                destSelect.appendChild(opt);
                            });
                    }

                    modal.style.display = 'flex';

                    const cancelBtn = document.getElementById('cancelTransferBtn');
                    const confirmBtn = document.getElementById('confirmTransferBtn');

                    const newCancel = cancelBtn.cloneNode(true);
                    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

                    const newConfirm = confirmBtn.cloneNode(true);
                    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);

                    newCancel.addEventListener('click', () => {
                        modal.style.display = 'none';
                        slotOrigenIndex = null;
                    });

                    newConfirm.addEventListener('click', async () => {
                        const destId = destSelect.value;
                        if (!destId) {
                            alert('Por favor, selecciona un contenedor de destino.');
                            return;
                        }

                        newConfirm.textContent = 'Moviendo...';
                        newConfirm.disabled = true;

                        try {
                            const response = await fetch(`http://localhost:8000/api/containers/move-cross-container`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    copy_id: slot.copy_id,
                                    target_container_id: destId,
                                    target_slot_id: null
                                })
                            });

                            if (!response.ok) throw new Error('Error al mover la carta entre contenedores');

                            slots[slotOrigenIndex] = {
                                ...slots[slotOrigenIndex],
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

                            hasUnsavedChanges = true;
                            modal.style.display = 'none';
                            slotOrigenIndex = null;
                            
                            renderizarBinder(slots);
                            document.getElementById('saveSlotsBtn').style.display = 'inline-block';
                            
                            alert('¡Carta transferida con éxito al nuevo contenedor! Recuerda guardar cambios.');
                        } catch (err) {
                            console.error(err);
                            alert('Hubo un error al transferir la carta.');
                            newConfirm.textContent = 'Mover Carta';
                            newConfirm.disabled = false;
                        }
                    });
                }
            } else {
                if (slotOrigenIndex === null) {
                    if (slot.is_occupied) {
                        slotOrigenIndex = absoluteIndex;
                        renderizarBinder(slots);
                    }
                } else {
                    if (slotOrigenIndex === absoluteIndex) {
                        slotOrigenIndex = null;
                        renderizarBinder(slots);
                        return;
                    }

                    const destinoIndex = absoluteIndex;
                    
                    const tempSlotData = {
                        is_occupied: slots[destinoIndex].is_occupied,
                        card_id: slots[destinoIndex].card_id || null,
                        copy_id: slots[destinoIndex].copy_id || null,
                        card_name: slots[destinoIndex].card_name || null,
                        mana_cost: slots[destinoIndex].mana_cost || null,
                        type_line: slots[destinoIndex].type_line || null,
                        image_uri: slots[destinoIndex].image_uri || null,
                        condition: slots[destinoIndex].condition || null,
                        is_foil: !!slots[destinoIndex].is_foil,
                        notes: slots[destinoIndex].notes || null
                    };

                    slots[destinoIndex] = {
                        ...slots[destinoIndex],
                        is_occupied: !!slots[slotOrigenIndex].is_occupied,
                        card_id: slots[slotOrigenIndex].card_id || null,
                        copy_id: slots[slotOrigenIndex].copy_id || null,
                        card_name: slots[slotOrigenIndex].card_name || null,
                        mana_cost: slots[slotOrigenIndex].mana_cost || null,
                        type_line: slots[slotOrigenIndex].type_line || null,
                        image_uri: slots[slotOrigenIndex].image_uri || null,
                        condition: slots[slotOrigenIndex].condition || null,
                        is_foil: !!slots[slotOrigenIndex].is_foil,
                        notes: slots[slotOrigenIndex].notes || null
                    };

                    slots[slotOrigenIndex] = {
                        ...slots[slotOrigenIndex],
                        is_occupied: tempSlotData.is_occupied,
                        card_id: tempSlotData.card_id,
                        copy_id: tempSlotData.copy_id,
                        card_name: tempSlotData.card_name,
                        mana_cost: tempSlotData.mana_cost,
                        type_line: tempSlotData.type_line,
                        image_uri: tempSlotData.image_uri,
                        condition: tempSlotData.condition,
                        is_foil: tempSlotData.is_foil,
                        notes: tempSlotData.notes
                    };

                    slotOrigenIndex = null;
                    hasUnsavedChanges = true;
                    renderizarBinder(slots);
                }
            }
        });

        gridEl.appendChild(slotDiv);
    });

    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentBinderPage > 1) {
            currentBinderPage--;
            renderizarBinder(slots);
        }
    });

    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (currentBinderPage < totalPages) {
            currentBinderPage++;
            renderizarBinder(slots);
        }
    });
}
    
    function renderizarDeckBox(slots) {
        const allMainSlots = slots.filter(s => s.section === 'main' || !s.section);
        const allSideSlots = slots.filter(s => s.section === 'sideboard');

        visualWorkspace.innerHTML = `
            <div class="deck-controls-bar">
                <div class="position-search-wrapper">
                    <label for="jumpToSlotInput">Ir al slot:</label>
                    <input type="number" id="jumpToSlotInput" min="1" max="${slots.length}" placeholder="Ej: 4">
                    <button id="jumpBtn" class="nav-btn">Buscar</button>
                </div>
                <div class="deck-counters">
                    <span>Mainboard: ${allMainSlots.filter(s => s.is_occupied).length}/${allMainSlots.length}</span>
                    ${allSideSlots.length > 0 ? `<span>Sideboard: ${allSideSlots.filter(s => s.is_occupied).length}/${allSideSlots.length}</span>` : ''}
                </div>
            </div>
            <div class="deck-scroll-container" id="deckScrollContainer">
                <div class="deck-section-title">Mainboard</div>
                <div class="deck-compact-row" id="mainGrid"></div>
                ${allSideSlots.length > 0 ? `
                    <div class="deck-section-title" style="margin-top: 2rem;">Sideboard / Reserva</div>
                    <div class="deck-compact-row" id="sideGrid"></div>
                ` : ''}
            </div>
        `;

        const mainGrid = document.getElementById('mainGrid');
        allMainSlots.forEach((slot, index) => {
            mainGrid.appendChild(crearCardElementoSlotCompacto(slot, index + 1));
        });

        if (allSideSlots.length > 0) {
            const sideGrid = document.getElementById('sideGrid');
            allSideSlots.forEach((slot, index) => {
                sideGrid.appendChild(crearCardElementoSlotCompacto(slot, index + 1));
            });
        }

        const jumpInput = document.getElementById('jumpToSlotInput');
        const jumpBtn = document.getElementById('jumpBtn');
        
        const ejecutarSalto = () => {
            const targetIndex = parseInt(jumpInput.value);
            if (!targetIndex) return;
            const targetCard = document.getElementById(`slot-item-${targetIndex}`);
            if (targetCard) {
                targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetCard.classList.add('highlight-slot');
                setTimeout(() => targetCard.classList.remove('highlight-slot'), 1500);
            }
        };

        if (jumpBtn) jumpBtn.addEventListener('click', ejecutarSalto);
        if (jumpInput) {
            jumpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') ejecutarSalto();
            });
        }
    }

    function crearCardElementoSlotCompacto(slot, indexNum) {
        const wrapper = document.createElement('div');
        wrapper.className = 'deck-slot-wrapper';
        wrapper.id = `slot-item-${indexNum}`;

        const item = document.createElement('div');
        item.className = `deck-slot-compact ${slot.is_occupied ? 'occupied' : 'empty-compact'}`;

        if (slot.is_occupied && slot.image_uri) {
            item.innerHTML = `
                <img src="${slot.image_uri}" alt="${slot.card_name}" loading="lazy">
                <span class="compact-slot-badge">#${indexNum}</span>
            `;
            item.title = `${slot.card_name} (Slot #${indexNum})`;
            
            const img = item.querySelector('img');
            img.addEventListener('click', () => {
                const encodedImg = encodeURIComponent(slot.image_uri || '');
                const encodedName = encodeURIComponent(slot.card_name || '');
                const encodedType = encodeURIComponent(slot.type_line || '');
                const encodedMana = encodeURIComponent(slot.mana_cost || '');
                
                window.location.href = `gestor-contenedor.html?card_id=${slot.card_id}&printing_id=${slot.copy_id}&img=${encodedImg}&name=${encodedName}&type=${encodedType}&mana=${encodedMana}`;
            });

            wrapper.appendChild(item);

            const nameLabel = document.createElement('span');
            nameLabel.className = 'deck-card-name-label';
            nameLabel.textContent = slot.card_name;
            nameLabel.title = slot.card_name;
            wrapper.appendChild(nameLabel);
        } else {
            item.innerHTML = `<span class="empty-slot-mini">${indexNum}</span>`;
            item.title = `Slot #${indexNum} (Vacío)`;
            wrapper.appendChild(item);
        }

        return wrapper;
    }

    cargarContenedores();
});

window.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('preferred-mana-theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);
});