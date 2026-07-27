document.addEventListener('DOMContentLoaded', () => {
    const containerSelector = document.getElementById('containerSelector');
    const containerTitle = document.getElementById('containerTitle');
    const containerStats = document.getElementById('containerStats');
    const visualWorkspace = document.getElementById('visualWorkspace');
    const filterContainerTypeSelect = document.getElementById('filterContainerType');
    
    // Elementos de la lupa 2.5D (heredados de tu visor principal)
    const container = document.getElementById('cardContainer');
    const card = document.getElementById('interactiveCard');
    const cardImage = document.getElementById('dynamicCardImg');
    const magnifier = document.getElementById('cardMagnifier');
    const toggleBtn = document.getElementById('toggleMagnifierBtn');
    const modeStatus = document.getElementById('modeStatus');
    const slotActionPanel = document.getElementById('slotActionPanel');

    let isMagnifierEnabled = false;
    let currentContainerData = null;
    let allContainersList = [];
    let currentBinderPage = 1;
    let selectedSlotData = null;

    const ZOOM_SCALE = 2; 
    const MAGNIFIER_SIZE = 160; 

    // --- 1. Cargar contenedores ---
    async function cargarContenedores() {
        try {
            const response = await fetch('http://localhost:8000/api/containers/');
            if (!response.ok) throw new Error('Error al listar contenedores');
            
            allContainersList = await response.json();
            actualizarDesplegableContenedores();
            
        } catch (err) {
            console.error("Error al cargar contenedores:", err);
            containerSelector.innerHTML = '<option value="">Error al cargar contenedores</option>';
        }
    }

    function actualizarDesplegableContenedores() {
        if (!containerSelector) return;
        
        const valorPrevio = containerSelector.value;
        const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';

        containerSelector.innerHTML = '<option value="">Selecciona un contenedor para gestionar...</option>';
        
        const containersFiltered = allContainersList.filter(c => {
            const tipoContenedor = (c.type || c.tipo || '').toLowerCase();
            if (selectedType === 'all') return true;
            return tipoContenedor === selectedType.toLowerCase();
        });

        containersFiltered.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id || c._id;
            const nombre = c.name || 'Sin nombre';
            const tipo = (c.type || 'general').toUpperCase();
            option.textContent = `${nombre} [${tipo}]`;
            containerSelector.appendChild(option);
        });

        if (valorPrevio) {
            containerSelector.value = valorPrevio;
        }

        if (containerSelector.value === "") {
            containerTitle.textContent = "Selecciona un contenedor";
            containerStats.textContent = "—";
            visualWorkspace.innerHTML = `<div class="placeholder-msg" style="text-align: center; margin-top: 15vh;"><p style="color: var(--text-muted); font-size: 0.95rem;">Elige un archivador, mazo o caja arriba para desplegar sus huecos...</p></div>`;
            currentContainerData = null;
        }
    }

    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', actualizarDesplegableContenedores);
    }

    // --- 2. Selección de contenedor ---
    containerSelector.addEventListener('change', async (e) => {
        const containerId = e.target.value;
        if (!containerId) {
            containerTitle.textContent = "Selecciona un contenedor";
            containerStats.textContent = "—";
            visualWorkspace.innerHTML = `<div class="placeholder-msg" style="text-align: center; margin-top: 15vh;"><p style="color: var(--text-muted); font-size: 0.95rem;">Elige un archivador, mazo o caja arriba para desplegar sus huecos...</p></div>`;
            return;
        }

        currentContainerData = allContainersList.find(c => (c.id === containerId || c._id === containerId));
        if (!currentContainerData) return;
        
        containerTitle.textContent = currentContainerData.name;
        containerStats.textContent = `Tipo: ${(currentContainerData.type || 'GENERAL').toUpperCase()} | Capacidad Máx: ${currentContainerData.max_capacity || 'N/A'}`;

        await cargarSlotsContenedor(containerId);
    });

    async function cargarSlotsContenedor(containerId) {
        visualWorkspace.innerHTML = `<div class="placeholder-msg" style="text-align: center; margin-top: 15vh;"><p style="color: var(--text-muted);">Cargando estructura física...</p></div>`;
        
        try {
            const response = await fetch(`http://localhost:8000/api/containers/${containerId}/slots`);
            if (!response.ok) throw new Error('Error al obtener los slots');
            
            const slots = await response.json();
            const tipo = (currentContainerData.type || 'binder').toLowerCase();
            
            if (tipo === 'binder') {
                renderizarBinder(slots);
            } else {
                renderizarDeckBox(slots);
            }

        } catch (err) {
            console.error("Error:", err);
            visualWorkspace.innerHTML = `<div class="placeholder-msg" style="text-align: center; margin-top: 15vh;"><p style="color: #ef4444;">Error al cargar los elementos del contenedor.</p></div>`;
        }
    }

    // --- 3. Renderizado de Archivador (Binder) ---
    function renderizarBinder(slots) {
        const pagesMap = {};
        slots.forEach(slot => {
            const page = slot.page_number || 1;
            if (!pagesMap[page]) pagesMap[page] = [];
            pagesMap[page].push(slot);
        });

        const totalPages = Object.keys(pagesMap).length;
        if (currentBinderPage > totalPages) currentBinderPage = 1;

        visualWorkspace.innerHTML = `
            <div class="binder-navigation-controls" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <button id="prevPageBtn" class="nav-btn" ${currentBinderPage <= 1 ? 'disabled' : ''}>◀ Página Anterior</button>
                <span class="page-indicator">Página <strong id="currentPageNum">${currentBinderPage}</strong> de ${totalPages || 1}</span>
                <button id="nextPageBtn" class="nav-btn" ${currentBinderPage >= totalPages ? 'disabled' : ''}>Página Siguiente ▶</button>
            </div>
            <div class="binder-page-container" id="binderPageGrid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>
        `;

        const gridEl = document.getElementById('binderPageGrid');
        const currentSlots = pagesMap[currentBinderPage] || [];

        currentSlots.forEach(slot => {
            const slotDiv = document.createElement('div');
            slotDiv.className = `binder-slot ${slot.is_occupied ? 'occupied' : 'empty'}`;
            slotDiv.style.cssText = "aspect-ratio: 5/7; border-radius: 6px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: rgba(255,255,255,0.02); cursor: pointer;";
            
            if (slot.is_occupied && slot.image_uri) {
                slotDiv.innerHTML = `
                    <img src="${slot.image_uri}" alt="${slot.card_name}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                    <div class="slot-overlay-info" style="position: absolute; bottom: 4px; right: 4px; background: rgba(0,0,0,0.8); padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; color: #fff;">
                        <span>${slot.condition || 'NM'}</span>
                    </div>
                `;
                slotDiv.addEventListener('click', () => seleccionarSlotParaGestion(slot));
            } else {
                slotDiv.innerHTML = `<span class="empty-slot-text" style="font-size: 0.75rem; color: var(--text-muted);">Hueco ${slot.slot_index}</span>`;
            }

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

    // --- 4. Renderizado de Mazo / Caja (Deck / Box) ---
    function renderizarDeckBox(slots) {
        const allMainSlots = slots.filter(s => s.section === 'main' || !s.section);
        const allSideSlots = slots.filter(s => s.section === 'sideboard');

        visualWorkspace.innerHTML = `
            <div class="deck-controls-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; font-size: 0.85rem;">
                <div class="position-search-wrapper" style="display: flex; gap: 6px; align-items: center;">
                    <label for="jumpToSlotInput">Ir al slot:</label>
                    <input type="number" id="jumpToSlotInput" min="1" max="${slots.length}" placeholder="Ej: 4" style="width: 70px; padding: 0.3rem; border-radius: 4px; background: var(--bg-app); border: 1px solid var(--border-color); color: var(--text-main);">
                    <button id="jumpBtn" class="nav-btn" style="padding: 0.3rem 0.6rem;">Buscar</button>
                </div>
                <div class="deck-counters" style="color: var(--text-muted);">
                    <span>Mainboard: ${allMainSlots.filter(s => s.is_occupied).length}/${allMainSlots.length}</span>
                    ${allSideSlots.length > 0 ? `<span> | Sideboard: ${allSideSlots.filter(s => s.is_occupied).length}/${allSideSlots.length}</span>` : ''}
                </div>
            </div>
            <div class="deck-scroll-container">
                <div class="deck-section-title" style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--primary-color);">Mainboard</div>
                <div class="deck-balanced-grid" id="mainGrid" style="display: flex; flex-wrap: wrap; gap: 12px;"></div>
                ${allSideSlots.length > 0 ? `
                    <div class="deck-section-title" style="font-weight: 600; font-size: 0.9rem; margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--primary-color);">Sideboard / Reserva</div>
                    <div class="deck-balanced-grid" id="sideGrid" style="display: flex; flex-wrap: wrap; gap: 12px;"></div>
                ` : ''}
            </div>
        `;

        const mainGrid = document.getElementById('mainGrid');
        allMainSlots.forEach((slot, index) => {
            mainGrid.appendChild(crearCardElementoEquilibrado(slot, index + 1));
        });

        if (allSideSlots.length > 0) {
            const sideGrid = document.getElementById('sideGrid');
            allSideSlots.forEach((slot, index) => {
                sideGrid.appendChild(crearCardElementoEquilibrado(slot, index + 1));
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
                targetCard.style.outline = "2px solid var(--primary-color)";
                setTimeout(() => targetCard.style.outline = "none", 1500);
            }
        };

        jumpBtn.addEventListener('click', ejecutarSalto);
        jumpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') ejecutarSalto();
        });
    }

    function crearCardElementoEquilibrado(slot, indexNum) {
        const wrapper = document.createElement('div');
        wrapper.className = 'deck-slot-wrapper-balanced';
        wrapper.id = `slot-item-${indexNum}`;
        wrapper.style.cssText = "display: flex; flex-direction: column; align-items: center; width: 95px;";

        const item = document.createElement('div');
        
        if (slot.is_occupied && slot.image_uri) {
            item.className = 'deck-slot-balanced occupied';
            item.style.cssText = "position: relative; width: 90px; height: 125px; border-radius: 6px; background: var(--bg-app); border: 1px solid var(--border-color); overflow: hidden; cursor: pointer; transition: transform 0.2s;";
            item.innerHTML = `
                <img src="${slot.image_uri}" alt="${slot.card_name}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy">
                <span style="position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.8); color: #fff; font-size: 0.6rem; padding: 1px 4px; border-radius: 3px;">#${indexNum}</span>
            `;
            item.title = `${slot.card_name} (Slot #${indexNum})`;
            
            item.addEventListener('click', () => seleccionarSlotParaGestion(slot));
            wrapper.appendChild(item);

            const nameLabel = document.createElement('span');
            nameLabel.style.cssText = "font-size: 0.7rem; color: var(--text-muted); text-align: center; margin-top: 4px; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
            nameLabel.textContent = slot.card_name;
            nameLabel.title = slot.card_name;
            wrapper.appendChild(nameLabel);
    
        } else {
            item.className = 'deck-slot-balanced empty-balanced';
            item.style.cssText = "width: 50px; height: 50px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-color); border-radius: 6px; display: flex; align-items: center; justify-content: center;";
            item.innerHTML = `<span style="font-size: 0.7rem; color: var(--text-muted);">#${indexNum}</span>`;
            item.title = `Slot #${indexNum} (Vacío)`;
            wrapper.appendChild(item);
        }

        return wrapper;
    }

    // --- 5. Mostrar carta en el Visor 2.5D al hacer clic en un slot ---
    function seleccionarSlotParaGestion(slot) {
        selectedSlotData = slot;
        
        if (slot.image_uri) {
            cardImage.src = slot.image_uri;
        } else {
            cardImage.src = "public/assets/nocapi.png";
        }

        const visorName = document.getElementById("visorCardName");
        const visorMana = document.getElementById("visorCardMana");
        const visorType = document.getElementById("visorCardType");
        
        if (visorName) visorName.textContent = slot.card_name || "Carta en slot";
        if (visorMana) visorMana.textContent = slot.mana_cost || "";
        if (visorType) visorType.textContent = slot.type_line || `Slot #${slot.slot_index} (${slot.condition || 'NM'})`;

        // Mostrar panel de acciones rápidas
        if (slotActionPanel) slotActionPanel.style.display = 'block';
    }

    // --- 6. Control de la Lupa 2.5D ---
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

    cardImage.addEventListener('load', () => {
        magnifier.style.backgroundSize = `${card.offsetWidth * ZOOM_SCALE}px auto`;
    });

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

    // Inicializar carga de contenedores al arrancar
    cargarContenedores();
});