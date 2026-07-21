const searchInput = document.getElementById('searchInput');
const macroCategorySelect = document.getElementById('macroCategorySelect');
const subtypeSelect = document.getElementById('subtypeSelect');
const searchBtn = document.getElementById('searchBtn');
const resultsList = document.getElementById('resultsList');
const detailsColumn = document.querySelector('.details-column'); // Contenedor derecho

const container = document.getElementById('cardContainer');
const card = document.getElementById('interactiveCard');
const cardImage = document.getElementById('dynamicCardImg');
const magnifier = document.getElementById('cardMagnifier');
const toggleBtn = document.getElementById('toggleMagnifierBtn');
const modeStatus = document.getElementById('modeStatus');

// Campos de inventario
const cardQuantity = document.getElementById('cardQuantity');
const cardLocation = document.getElementById('cardLocation');
const cardState = document.getElementById('cardState');
const cardOwned = document.getElementById('cardOwned');
const saveInventoryBtn = document.getElementById('saveInventoryBtn');

let isMagnifierEnabled = false;
let currentSelectedCard = null;
let globalTaxonomy = {};

const ZOOM_SCALE = 2; 
const MAGNIFIER_SIZE = 160; 

// --- Carga inicial de la taxonomía limpia para los desplegables ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('http://localhost:8000/api/cards/types-taxonomy');
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
});

// --- Comportamiento dinámico: actualizar subtipos al cambiar la macro-categoría ---
if (macroCategorySelect) {
    macroCategorySelect.addEventListener('change', (e) => {
        const selectedCategory = e.target.value;
        
        // Resetear subtipos
        subtypeSelect.innerHTML = '<option value="">Cualquier subtipo...</option>';
        
        if (!selectedCategory || !globalTaxonomy[selectedCategory] || globalTaxonomy[selectedCategory].length === 0) {
            subtypeSelect.disabled = true;
            return;
        }
        
        // Rellenar con los subtipos de la categoría seleccionada
        globalTaxonomy[selectedCategory].forEach(subtype => {
            const option = document.createElement('option');
            option.value = subtype;
            option.textContent = subtype;
            subtypeSelect.appendChild(option);
        });
        
        subtypeSelect.disabled = false;
    });
}

// --- Control de la Lupa ---
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

// --- Búsqueda local flexible (permite buscar solo por texto, solo por filtros o ambos) ---
async function realizarBusqueda() {
    const query = searchInput.value.trim();
    const macroCategory = macroCategorySelect ? macroCategorySelect.value.trim() : '';
    const subtype = subtypeSelect ? subtypeSelect.value.trim() : '';

    // Validamos que haya al menos 2 letras en el texto O bien algún filtro desplegable activo
    const hasValidText = query.length >= 2;
    const hasFilters = macroCategory !== '' || subtype !== '';

    if (!hasValidText && !hasFilters) {
        resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: span 5; text-align: center;">Escribe al menos 2 caracteres o selecciona un filtro...</p>`;
        return;
    }

    try {
        // Construcción dinámica de la URL
        let url = `http://localhost:8000/api/cards/filter?`;
        
        // Si hay texto con 2+ caracteres lo mandamos; si está vacío pero hay filtros, el backend lo gestionará con el comodín
        if (hasValidText) {
            url += `name=${encodeURIComponent(query)}`;
        } else {
            url += `name=`;
        }

        if (macroCategory) {
            url += `&type_line=${encodeURIComponent(macroCategory)}`;
        }
        if (subtype) {
            url += `&subtype=${encodeURIComponent(subtype)}`;
        }

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
        detailsColumn.classList.add('has-selection'); // Muestra los campos de inventario

        cards.forEach((cardData, index) => {
            const item = document.createElement('div');
            item.className = 'result-card-item'; // Clase de cuadrícula
            
            const imgSrc = cardData.image_uri ? cardData.image_uri : "public/assets/nocapi.png";

            item.innerHTML = `
                <img src="${imgSrc}" alt="${cardData.name}" loading="lazy">
                <span>${cardData.name}</span>
            `;
            
            item.addEventListener('click', () => seleccionarCarta(cardData));
            resultsList.appendChild(item);

            // Seleccionar automáticamente el primer resultado por defecto
            if (index === 0) {
                seleccionarCarta(cardData);
            }
        });

    } catch (error) {
        console.error("Error:", error);
        resultsList.innerHTML = `<p style="color: #ef4444; font-size: 0.9rem; grid-column: span 5; text-align: center;">Error de conexión con el servidor.</p>`;
    }
}

// --- Manejo cuando no hay resultados (Uso de nocapi.png) ---
function manejarSinResultados() {
    resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: span 5; text-align: center;">Vaya... No se ha encontrado ninguna carta. ¡Prueba otra búsqueda!</p>`;
    cardImage.src = "public/assets/nocapi.png";
    currentSelectedCard = null;
    detailsColumn.classList.remove('has-selection'); // Oculta inventario si no hay carta
}

searchBtn.addEventListener('click', realizarBusqueda);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') realizarBusqueda();
});

// Soporte para buscar pulsando Enter en los selectores si se desea
if (macroCategorySelect) {
    macroCategorySelect.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') realizarBusqueda();
    });
}
if (subtypeSelect) {
    subtypeSelect.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') realizarBusqueda();
    });
}

// --- Cargar carta seleccionada en el visor y formulario ---
function seleccionarCarta(cardData) {
    currentSelectedCard = cardData;
    detailsColumn.classList.add('has-selection'); // Asegura que se vea el inventario
    
    // Asignar imagen de la base de datos o fallback si falla
    if (cardData.image_uri) {
        cardImage.src = cardData.image_uri;
    } else {
        cardImage.src = "public/assets/nocapi.png";
    }

    // --- NUEVO: Rellenar los datos extra en el visor 2.5D ---
    const visorName = document.getElementById("visorCardName");
    const visorMana = document.getElementById("visorCardMana");
    const visorType = document.getElementById("visorCardType");
    
    if (visorName) visorName.textContent = cardData.name || "Sin nombre";
    if (visorMana) visorMana.textContent = cardData.mana_cost || "";
    if (visorType) visorType.textContent = cardData.type_line || "";

    // Rellenar datos de inventario
    cardQuantity.value = cardData.quantity ?? 1;
    cardLocation.value = cardData.location ?? 'Binder Principal';
    cardState.value = cardData.state ?? 'NM';
    cardOwned.value = cardData.owned ? 'true' : 'true';
}

// Inicializar tamaño del fondo de la lupa cuando cargue la imagen
cardImage.addEventListener('load', () => {
    magnifier.style.backgroundSize = `${card.offsetWidth * ZOOM_SCALE}px auto`;
});

// --- Lógica del Visor 2.5D y Lupa ---
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

// --- Guardar cambios de inventario ---
saveInventoryBtn.addEventListener('click', () => {
    if (!currentSelectedCard) {
        alert("Selecciona una carta primero.");
        return;
    }
    
    alert(`Inventario actualizado para: ${currentSelectedCard.name}\nCantidad: ${cardQuantity.value}\nUbicación: ${cardLocation.value}\nEstado: ${cardState.value}`);
});