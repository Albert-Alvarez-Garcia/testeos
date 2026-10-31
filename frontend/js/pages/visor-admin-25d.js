/**
 * ============================================================================
 * VISOR ADMIN - SCRIPT PRINCIPAL (visor-admin-25d.html)
 * Requiere js/shared/auth.js (CBAuth).
 * ============================================================================
 */

const API_BASE_URL = '/api';

// Sin sesión no hay nada que hacer aquí: al login
CBAuth.requireSession();

const macroCategorySelect = document.getElementById('macroCategorySelect');
const subtypeSelect = document.getElementById('subtypeSelect');
const searchBtn = document.getElementById('searchBtn');
const resultsList = document.getElementById('resultsList');
const detailsColumn = document.querySelector('.details-column');

const container = document.getElementById('cardContainer');
const card = document.getElementById('interactiveCard');
const cardImage = document.getElementById('dynamicCardImg');
const magnifier = document.getElementById('cardMagnifier');
const toggleBtn = document.getElementById('toggleMagnifierBtn');
const modeStatus = document.getElementById('modeStatus');

const cardQuantity = document.getElementById('cardQuantity');
const cardState = document.getElementById('cardState');
const cardOwned = document.getElementById('cardOwned');
const saveInventoryBtn = document.getElementById('saveInventoryBtn');
const filterContainerTypeSelect = document.getElementById('filterContainerType');

let isMagnifierEnabled = false;
let currentSelectedCard = null;
let globalTaxonomy = {};
let allContainersList = [];
let currentCardOwnership = null;

const ZOOM_SCALE = 2; 
const MAGNIFIER_SIZE = 160; 

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('searchInput');
    const cardLocation = document.getElementById('cardLocation');
    try {
        const response = await fetch(`${API_BASE_URL}/cards/types-taxonomy`);
        globalTaxonomy = await response.json();
        
        if (macroCategorySelect && globalTaxonomy) {
            Object.keys(globalTaxonomy).sort().forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                macroCategorySelect.appendChild(option);
            });
        }
    } catch (e) {
        console.error("Error al cargar la taxonomía de tipos:", e);
    }

    await cargarContenedores();
    
    if (cardLocation) {
        cardLocation.addEventListener('focus', cargarContenedores);
    }

    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', actualizarDesplegableContenedores);
    }
});

// ============================================================================
// 3. GESTIÓN DE CONTENEDORES Y UBICACIONES (API)
// ============================================================================

async function cargarContenedores() {
    try {
        const response = await CBAuth.fetch(`${API_BASE_URL}/containers/`);
        
        if (!response.ok) {
            console.error("Error al obtener contenedores, status:", response.status);
            return;
        }
        
        const containers = await response.json();
        
        if (Array.isArray(containers)) {
            allContainersList = containers;
            actualizarDesplegableContenedores();
        }
    } catch (err) {
        console.error("Error de conexión al cargar los contenedores:", err);
    }
}

function actualizarDesplegableContenedores() {
    const cardLocation = document.getElementById('cardLocation');
    if (!cardLocation) return;

    const lastSelected = localStorage.getItem('last_selected_container');
    
    cardLocation.innerHTML = '<option value="">Selecciona un contenedor...</option>';
    
    allContainersList.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id; 
        const contieneCarta = currentCardOwnership?.containers?.some(
            container => container.container_id === c.id
        );

        option.textContent = `${c.name || 'Sin nombre'} (${(c.type || 'GENERAL').toUpperCase()})${contieneCarta ? ' ★' : ''}`;
        cardLocation.appendChild(option);
    });
    
    if (lastSelected) {
        cardLocation.value = lastSelected;
    }
}

const cardLocation = document.getElementById('cardLocation');
if (cardLocation) {
    cardLocation.addEventListener('change', (e) => {
        if (e.target.value) {
            localStorage.setItem('last_selected_container', e.target.value);
        }
    });
}

// ============================================================================
// 4. TAXONOMÍA Y FILTROS DE BÚSQUEDA
// ============================================================================
if (macroCategorySelect) {
    macroCategorySelect.addEventListener('change', (e) => {
        const selectedCategory = e.target.value;
        subtypeSelect.innerHTML = '<option value="">Cualquier subtipo...</option>';
        
        if (!selectedCategory || !globalTaxonomy[selectedCategory] || globalTaxonomy[selectedCategory].length === 0) {
            subtypeSelect.disabled = true;
            return;
        }
        
        globalTaxonomy[selectedCategory].forEach(subtype => {
            const option = document.createElement('option');
            option.value = subtype;
            option.textContent = subtype;
            subtypeSelect.appendChild(option);
        });
        
        subtypeSelect.disabled = false;
    });
}

async function realizarBusqueda() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput.value.trim();
    const macroCategory = macroCategorySelect ? macroCategorySelect.value.trim() : '';
    const subtype = subtypeSelect ? subtypeSelect.value.trim() : '';

    const hasValidText = query.length >= 2;
    const hasFilters = macroCategory !== '' || subtype !== '';

    if (!hasValidText && !hasFilters) {
        mostrarMensajeResultados('Escribe al menos 2 caracteres o selecciona un filtro...');
        return;
    }

    try {
        let url = `${API_BASE_URL}/cards/filter?`;
        if (hasValidText) {
            url += `name=${encodeURIComponent(query)}`;
        } else {
            url += `name=`;
        }
        if (macroCategory) url += `&type_line=${encodeURIComponent(macroCategory)}`;
        if (subtype) url += `&subtype=${encodeURIComponent(subtype)}`;

        const response = await fetch(url);        
        if (!response.ok) {
            if (response.status === 404) {
                manejarSinResultados();
                return;
            }
            throw new Error('Error al consultar la base de datos');
        }

        const cards = await response.json();
        
        if (!cards || cards.length === 0) {
            manejarSinResultados();
            return;
        }

        resultsList.innerHTML = '';
        detailsColumn.classList.add('has-selection');

        cards.forEach((cardData, index) => {
            const item = document.createElement('div');
            item.className = 'result-card-item';
            
            const imgSrc = cardData.image_uri ? cardData.image_uri : "public/assets/nocapi.png";

            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = cardData.name || '';
            img.loading = 'lazy';

            const nameEl = document.createElement('span');
            nameEl.textContent = cardData.name || '';

            const setEl = document.createElement('small');
            setEl.textContent = `${(cardData.set_code || '').toUpperCase()} ${cardData.collector_number ? '#' + cardData.collector_number : ''}`.trim();

            item.append(img, nameEl, setEl);
            
            item.addEventListener('click', () => seleccionarCarta(cardData));
            resultsList.appendChild(item);

            if (index === 0) {
                seleccionarCarta(cardData);
            }
        });

    } catch (error) {
        console.error("Error:", error);
        mostrarMensajeResultados('Error de conexión con el servidor.', true);
    }
}

function mostrarMensajeResultados(texto, esError) {
    resultsList.replaceChildren();
    const p = document.createElement('p');
    if (esError) p.className = 'msg-error';
    p.textContent = texto;
    resultsList.appendChild(p);
}

function manejarSinResultados() {
    mostrarMensajeResultados('Vaya... No se ha encontrado ninguna carta. ¡Prueba otra búsqueda!');
    cardImage.src = "public/assets/nocapi.png";
    currentSelectedCard = null;
    detailsColumn.classList.remove('has-selection');
}

searchBtn.addEventListener('click', realizarBusqueda);
const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') realizarBusqueda(); });
}

// ============================================================================
// 5. SELECCIÓN DE CARTA Y VISOR INTERACTIVO
// ============================================================================
async function comprobarPropiedadCarta(cardData) {
    if (!cardData || !cardData.scryfall_printing_id) {
        currentCardOwnership = null;
        return;
    }

    try {
        const response = await CBAuth.fetch(
            `${API_BASE_URL}/cards/ownership/${encodeURIComponent(cardData.scryfall_printing_id)}`
        );

        if (!response.ok) {
            console.error('Error comprobando propiedad de carta:', response.status);
            currentCardOwnership = null;
            return;
        }

        currentCardOwnership = await response.json();

        if (cardOwned) {
            cardOwned.value = currentCardOwnership.owned ? 'true' : 'false';
        }

        // Ya no sobrescribimos cardQuantity aquí para permitir que el usuario elija cuántas copias desea añadir libremente.

        actualizarDesplegableContenedores();

    } catch (error) {
        console.error('Error de conexión comprobando propiedad:', error);
        currentCardOwnership = null;
    }
}

function seleccionarCarta(cardData) {
    currentSelectedCard = cardData;
    detailsColumn.classList.add('has-selection');
    
    if (cardData.image_uri) {
        cardImage.src = cardData.image_uri;
    } else {
        cardImage.src = "public/assets/nocapi.png";
    }

    const visorName = document.getElementById("visorCardName");
    const visorMana = document.getElementById("visorCardMana");
    const visorType = document.getElementById("visorCardType");
    
    if (visorName) visorName.textContent = cardData.name || "Sin nombre";
    if (visorMana) visorMana.textContent = cardData.mana_cost || "";
    if (visorType) {
        const setInfo = [cardData.set_name, cardData.collector_number ? `#${cardData.collector_number}` : ''].filter(Boolean).join(' ');
        visorType.textContent = [cardData.type_line, setInfo].filter(Boolean).join(' · ');
    }

    if (cardQuantity) cardQuantity.value = 1;
    cardState.value = cardData.state ?? 'NM';
    
    const cardLocation = document.getElementById('cardLocation');
    const lastContainer = localStorage.getItem('last_selected_container');

    if (cardOwned) {
        cardOwned.value = 'false';
    }

    if (cardLocation) {
        cardLocation.value = lastContainer || '';
    }

    comprobarPropiedadCarta(cardData);
}

// ============================================================================
// 6. CONTROL DE LA LUPA Y ANIMACIÓN 3D
// ============================================================================
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
    const cardWidth = card.offsetWidth > 0 ? card.offsetWidth : 280;
    magnifier.style.backgroundSize = `${cardWidth * ZOOM_SCALE}px auto`;
});

container.addEventListener('mousemove', (e) => {
    const cardWidth = card.offsetWidth > 0 ? card.offsetWidth : 280;
    const cardHeight = card.offsetHeight > 0 ? card.offsetHeight : 390;
    
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

        const bgPosX = -(percentX * (cardWidth * ZOOM_SCALE)) + (MAGNIFIER_SIZE / 2);
        const bgPosY = -(percentY * (cardHeight * ZOOM_SCALE)) + (MAGNIFIER_SIZE / 2);

        magnifier.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
        magnifier.style.backgroundImage = `url("${cardImage.src}")`;
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

// ============================================================================
// 7. GESTIÓN DE INVENTARIO Y NOTIFICACIONES (TOAST)
// ============================================================================
function mostrarNotificacionFlotante(mensaje) {
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = mensaje;
    
    toast.className = 'toast-notification';

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('is-hiding');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

saveInventoryBtn.addEventListener('click', async () => {
    if (!currentSelectedCard) {
        alert("Selecciona una carta primero.");
        return;
    }

    const cardLocation = document.getElementById('cardLocation');
    const containerId = cardLocation.value;
    if (!containerId) {
        alert("Por favor, selecciona un contenedor de destino.");
        return;
    }

    // Impresión exacta (arte/colección) elegida; nunca el scryfall_id de la carta, que es común a todas sus impresiones.
    const printingId = currentSelectedCard.scryfall_printing_id;

    if (!printingId) {
        alert("Error: La carta seleccionada no tiene un ID de impresión válido.");
        return;
    }

    const cantidadACrear = cardQuantity ? Number.parseInt(cardQuantity.value, 10) : 1;
    if (!Number.isInteger(cantidadACrear) || cantidadACrear < 1 || cantidadACrear > 99) {
        alert("La cantidad debe ser un número entero entre 1 y 99.");
        cardQuantity?.focus();
        return;
    }

    const payload = {
        printing_id: printingId,
        container_id: containerId,
        condition: cardState.value || "Near Mint",
        language: "en",
        is_foil: false,
        quantity: cantidadACrear
    };

    saveInventoryBtn.disabled = true;

    try {
        // Validación anticipada: evitamos enviar un POST que sabemos que el servidor rechazará
        // cuando no queden huecos suficientes. El backend vuelve a comprobarlo dentro de
        // una transacción para cubrir cambios concurrentes entre esta consulta y el guardado.
        const slotsResponse = await CBAuth.fetch(
            `${API_BASE_URL}/containers/${encodeURIComponent(containerId)}/slots`
        );
        if (!slotsResponse.ok) {
            throw new Error("No se pudo comprobar el espacio disponible en el contenedor.");
        }
        const slots = await slotsResponse.json();
        const huecosLibres = Array.isArray(slots)
            ? slots.filter((slot) => !slot.is_occupied).length
            : 0;

        if (cantidadACrear > huecosLibres) {
            alert(
                `No caben ${cantidadACrear} copias en este contenedor. ` +
                `Solo quedan ${huecosLibres} hueco(s) libre(s).`
            );
            return;
        }

        const response = await CBAuth.fetch(`${API_BASE_URL}/containers/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            let errorMsg = 'Error al guardar la carta.';
            if (data.detail) {
                errorMsg = Array.isArray(data.detail)
                    ? data.detail.map(err => err.msg).join(', ')
                    : String(data.detail);
            }
            // 409 sigue siendo posible si otra pestaña ocupa huecos tras la comprobación previa.
            // Se comunica como validación de negocio; no se registra como fallo de conexión.
            alert(errorMsg);
            return;
        }

        mostrarNotificacionFlotante(`¡${data.added}x ${currentSelectedCard.name} añadida(s) al contenedor con éxito!`);
        comprobarPropiedadCarta(currentSelectedCard);

    } catch (error) {
        console.error("Error al guardar inventario:", error);
        alert(`Hubo un error de conexión: ${error.message}`);
    } finally {
        saveInventoryBtn.disabled = false;
    }
});