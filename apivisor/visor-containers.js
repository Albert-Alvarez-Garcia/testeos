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
            if (visualWorkspace) visualWorkspace.innerHTML = `<div class="placeholder-msg"><p style="color: var(--text-muted);">Elige un archivador o mazo arriba para desplegar sus páginas y huecos...</p></div>`;
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
            
            // ¡IMPORTANTE! Reseteamos a la página 1 cada vez que cambiamos de contenedor
            currentBinderPage = 1;

            containerTitle.textContent = currentContainerData.name;
            containerStats.textContent = `Tipo: ${currentContainerData.type.toUpperCase()} | Capacidad Máx: ${currentContainerData.max_capacity || 'N/A'}`;

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
    const pagesMap = {};
    
    for (let i = 1; i <= totalPages; i++) {
        pagesMap[i] = [];
    }

    slots.forEach((slot, index) => {
        let page = Number(slot.page_number || slot.pagina);
        if (!page || page < 1 || page > totalPages) {
            page = Math.floor(index / itemsPerPage) + 1;
        }
        
        if (!pagesMap[page]) {
            pagesMap[page] = [];
        }
        pagesMap[page].push(slot);
    });

    if (currentBinderPage > totalPages) currentBinderPage = 1;

    visualWorkspace.innerHTML = `
        <div class="binder-navigation-controls">
            <button id="prevPageBtn" class="nav-btn" ${currentBinderPage <= 1 ? 'disabled' : ''}>◀ Página Anterior</button>
            <span class="page-indicator">Página <strong id="currentPageNum">${currentBinderPage}</strong> de ${totalPages}</span>
            <button id="nextPageBtn" class="nav-btn" ${currentBinderPage >= totalPages ? 'disabled' : ''}>Página Siguiente ▶</button>
            
            <!-- BOTÓN DE MODO MOVER -->
            <button id="toggleMoveModeBtn" class="nav-btn" style="margin-left: auto; border-color: #b39258;">Mover Cartas: OFF</button>
        </div>
        <div class="binder-page-container" id="binderPageGrid"></div>
    `;

    const gridEl = document.getElementById('binderPageGrid');
    gridEl.setAttribute('data-columns', columnas);

    const currentSlots = pagesMap[currentBinderPage] || [];

    // --- VARIABLES DE ESTADO PARA EL MODO MOVER POR CLICS ---
    let isMoveModeActive = false;
    let slotOrigenIndex = null;

    const toggleMoveBtn = document.getElementById('toggleMoveModeBtn');
    toggleMoveBtn.addEventListener('click', () => {
        isMoveModeActive = !isMoveModeActive;
        slotOrigenIndex = null; // Reseteamos selección si apagan/encienden
        
        if (isMoveModeActive) {
            toggleMoveBtn.textContent = 'Mover Cartas: ON';
            toggleMoveBtn.style.background = '#3d2a1d';
            toggleMoveBtn.style.color = '#f59e0b';
        } else {
            toggleMoveBtn.textContent = 'Mover Cartas: OFF';
            toggleMoveBtn.style.background = '';
            toggleMoveBtn.style.color = '';
        }
        
        // Volvemos a renderizar la página para aplicar o quitar clases visuales si hiciera falta
        renderizarBinder(slots);
    });

    // Mantener el estado visual del botón si se recarga la página interna
    if (isMoveModeActive) {
        toggleMoveBtn.textContent = 'Mover Cartas: ON';
        toggleMoveBtn.style.background = '#3d2a1d';
        toggleMoveBtn.style.color = '#f59e0b';
    }

    currentSlots.forEach((slot, localIndex) => {
        // Calculamos el índice absoluto real dentro del array global de slots
        const absoluteIndex = slots.indexOf(slot);
        
        const slotDiv = document.createElement('div');
        slotDiv.className = `binder-slot ${slot.is_occupied ? 'occupied' : 'empty'}`;
        
        // Si este slot es el que está seleccionado como origen, le ponemos una clase visual distintiva
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
            
            const img = slotDiv.querySelector('img');
            img.addEventListener('click', (e) => {
                // Si el modo mover está activo y hacemos clic en una carta ocupada, seleccionamos origen
                if (isMoveModeActive) {
                    e.stopPropagation();
                    slotOrigenIndex = absoluteIndex;
                    renderizarBinder(slots); // Actualiza la vista para marcar visualmente el origen
                    return;
                }

                // Comportamiento normal (ir a la vista de detalle de la carta)
                const encodedImg = encodeURIComponent(slot.image_uri || '');
                const encodedName = encodeURIComponent(slot.card_name || '');
                const encodedType = encodeURIComponent(slot.type_line || '');
                const encodedMana = encodeURIComponent(slot.mana_cost || '');
                
                window.location.href = `gestor-contenedor.html?card_id=${slot.card_id}&printing_id=${slot.copy_id}&img=${encodedImg}&name=${encodedName}&type=${encodedType}&mana=${encodedMana}`;
            });
        } else {
            slotDiv.innerHTML = `<span class="empty-slot-text">Hueco ${slot.slot_index}</span>`;
        }

        // --- GESTIÓN DEL CLIC EN EL SLOT (DESTINO O SELECCIÓN) ---
        slotDiv.addEventListener('click', () => {
            if (!isMoveModeActive) return;

            // CASO 1: Si no hay origen seleccionado y hacemos clic en una carta ocupada
            if (slotOrigenIndex === null && slot.is_occupied) {
                slotOrigenIndex = absoluteIndex;
                renderizarBinder(slots);
            } 
            // CASO 2: Si ya tenemos un origen seleccionado y hacemos clic en un HUECO VACÍO como destino
            else if (slotOrigenIndex !== null && !slot.is_occupied) {
                const destinoIndex = absoluteIndex;

                // Movemos los datos de la carta al slot vacío destino
                slots[destinoIndex] = {
                    ...slots[slotOrigenIndex],
                    slot_index: slots[destinoIndex].slot_index || (destinoIndex + 1),
                    page_number: currentBinderPage
                };

                // Vaciamos el slot de origen original
                slots[slotOrigenIndex] = {
                    is_occupied: false,
                    slot_index: slots[slotOrigenIndex].slot_index || (slotOrigenIndex + 1),
                    page_number: Math.floor(slotOrigenIndex / itemsPerPage) + 1
                };

                // Limpiamos selección y redibujamos el binder actualizado
                slotOrigenIndex = null;
                renderizarBinder(slots);
            } 
            // CASO 3: Si hacemos clic en el mismo origen u otro sitio inválido, deseleccionamos
            else if (slotOrigenIndex !== null && slot.is_occupied) {
                slotOrigenIndex = absoluteIndex; // Cambiamos de origen directamente
                renderizarBinder(slots);
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
        item.className = `deck-slot-compact ${slot && slot.is_occupied ? 'occupied' : 'empty-compact'}`;

        if (slot && slot.is_occupied && slot.image_uri) {
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