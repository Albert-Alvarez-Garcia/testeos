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

// Campos e inputs de inventario
const cardQuantity = document.getElementById('cardQuantity');
const cardLocation = document.getElementById('cardLocation');
const cardState = document.getElementById('cardState');
const cardOwned = document.getElementById('cardOwned');
const saveInventoryBtn = document.getElementById('saveInventoryBtn');
const filterContainerTypeSelect = document.getElementById('filterContainerType'); // Nuevo selector de filtro

let isMagnifierEnabled = false;
let currentSelectedCard = null;
let globalTaxonomy = {};
let allContainersList = []; // Array global para almacenar todos los contenedores obtenidos de la API

const ZOOM_SCALE = 2; 
const MAGNIFIER_SIZE = 160; 

// --- Carga inicial de la taxonomía y de los contenedores ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Cargar taxonomía de tipos
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

    // 2. Cargar contenedores en el desplegable de inventario
    await cargarContenedores();
    
    // Auto-recargar contenedores si el usuario hace foco en el desplegable (por si creó uno nuevo)
    if (cardLocation) {
        cardLocation.addEventListener('focus', cargarContenedores);
    }

    // 3. Escuchar cambios en el filtro de tipos de contenedor
    if (filterContainerTypeSelect) {
        filterContainerTypeSelect.addEventListener('change', actualizarDesplegableContenedores);
    }
});

// --- Función para cargar los contenedores desde la API ---
async function cargarContenedores() {
    try {
        const response = await fetch('http://localhost:8000/api/containers/');
        if (!response.ok) {
            console.error("Error al obtener contenedores, status:", response.status);
            return;
        }
        
        const containers = await response.json();
        
        if (Array.isArray(containers)) {
            allContainersList = containers; // Guardamos la lista completa en memoria
            actualizarDesplegableContenedores(); // Poblamos el select aplicando el filtro actual
        }
    } catch (err) {
        console.error("Error de conexión al cargar los contenedores:", err);
    }
}

// --- Función para pintar el select de ubicaciones según el filtro seleccionado ---
function actualizarDesplegableContenedores() {
    if (!cardLocation) return;

    const valorActual = cardLocation.value; // Guardar selección actual para no perderla si coincide
    const selectedType = filterContainerTypeSelect ? filterContainerTypeSelect.value : 'all';
    
    cardLocation.innerHTML = '<option value="">Selecciona un contenedor...</option>';
    
    // Filtrar la lista global según el tipo seleccionado (binder, deck, box, etc.)
    const containersFiltered = allContainersList.filter(c => {
        const tipoContenedor = (c.type || c.tipo || '').toLowerCase();
        if (selectedType === 'all') return true;
        return tipoContenedor === selectedType.toLowerCase();
    });

    containersFiltered.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id || c._id || c.container_id; 
        const nombre = c.name || c.nombre || 'Contenedor sin nombre';
        const tipo = c.type || c.tipo || 'GENERAL';
        
        option.textContent = `${nombre} (${tipo.toUpperCase()})`;
        cardLocation.appendChild(option);
    });
    
    // Restaurar el valor previo si todavía existe en las opciones filtradas
    if (valorActual) {
        cardLocation.value = valorActual;
    }
}

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

// --- Búsqueda local flexible ---
async function realizarBusqueda() {
    const query = searchInput.value.trim();
    const macroCategory = macroCategorySelect ? macroCategorySelect.value.trim() : '';
    const subtype = subtypeSelect ? subtypeSelect.value.trim() : '';

    const hasValidText = query.length >= 2;
    const hasFilters = macroCategory !== '' || subtype !== '';

    if (!hasValidText && !hasFilters) {
        resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: span 5; text-align: center;">Escribe al menos 2 caracteres o selecciona un filtro...</p>`;
        return;
    }

    try {
        let url = `http://localhost:8000/api/cards/filter?`;
        
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
        detailsColumn.classList.add('has-selection');

        cards.forEach((cardData, index) => {
            const item = document.createElement('div');
            item.className = 'result-card-item';
            
            const imgSrc = cardData.image_uri ? cardData.image_uri : "public/assets/nocapi.png";

            item.innerHTML = `
                <img src="${imgSrc}" alt="${cardData.name}" loading="lazy">
                <span>${cardData.name}</span>
            `;
            
            item.addEventListener('click', () => seleccionarCarta(cardData));
            resultsList.appendChild(item);

            if (index === 0) {
                seleccionarCarta(cardData);
            }
        });

    } catch (error) {
        console.error("Error:", error);
        resultsList.innerHTML = `<p style="color: #ef4444; font-size: 0.9rem; grid-column: span 5; text-align: center;">Error de conexión con el servidor.</p>`;
    }
}

function manejarSinResultados() {
    resultsList.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; grid-column: span 5; text-align: center;">Vaya... No se ha encontrado ninguna carta. ¡Prueba otra búsqueda!</p>`;
    cardImage.src = "public/assets/nocapi.png";
    currentSelectedCard = null;
    detailsColumn.classList.remove('has-selection');
}

searchBtn.addEventListener('click', realizarBusqueda);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') realizarBusqueda();
});

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
/*function seleccionarCarta(cardData) {
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
    if (visorType) visorType.textContent = cardData.type_line || "";

    // Rellenar datos de inventario
    cardQuantity.value = cardData.quantity ?? 1;
    cardState.value = cardData.state ?? 'NM';
    
    // --- MEJORA 1 y 2: Mantener contenedor previo o recuperar de localStorage ---
    const lastContainer = localStorage.getItem('last_selected_container');
    
    // Si la carta ya tiene contenedor asignado explícitamente, úsalo. 
    // Si no, mantén el último que usó el usuario (si existe en el desplegable), o déjalo vacío.
    let targetContainer = cardData.container_id || cardData.location || lastContainer || '';
    
    if (targetContainer) {
        cardLocation.value = targetContainer;
        // Si ya hay un contenedor seleccionado de forma persistente, ponemos "¿En posesión?" en Sí por defecto
        if (cardOwned) cardOwned.value = 'true';
    } else {
        cardLocation.value = '';
    }
}*/
function seleccionarCarta(cardData) {
    // --- IMPRESIÓN DE DEPURACIÓN CRUCIAL ---
    console.log("🔍 OBJETO ENTERO DEVUELTO POR EL BUSCADOR:", cardData);
    
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
    if (visorType) visorType.textContent = cardData.type_line || "";

    cardQuantity.value = cardData.quantity ?? 1;
    cardState.value = cardData.state ?? 'NM';
    
    const lastContainer = localStorage.getItem('last_selected_container');
    let targetContainer = cardData.container_id || cardData.location || lastContainer || '';
    
    if (targetContainer) {
        cardLocation.value = targetContainer;
        if (cardOwned) cardOwned.value = 'true';
    } else {
        cardLocation.value = '';
    }
}

// --- Escuchar cambios en el selector de ubicación para guardarlo y marcar "En posesión" ---
if (cardLocation) {
    cardLocation.addEventListener('change', (e) => {
        const selectedVal = e.target.value;
        if (selectedVal) {
            // Guardamos en memoria local el último contenedor elegido para las siguientes cartas
            localStorage.setItem('last_selected_container', selectedVal);
            // Si selecciona un contenedor, asumimos automáticamente que está en posesión ("Sí")
            if (cardOwned) cardOwned.value = 'true';
        }
    });
}

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
function mostrarNotificacionFlotante(mensaje) {
    // Evitar duplicadas si el usuario hace clic muy rápido
    const existingToast = document.getElementById('toast-notification');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.textContent = mensaje;
    
    // Estilos inline para que aparezca flotando abajo a la derecha de forma elegante
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: '#10b981', // Verde éxito
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: '10000',
        fontFamily: 'inherit',
        fontSize: '0.95rem',
        fontWeight: '500',
        transition: 'opacity 0.3s ease-in-out'
    });

    document.body.appendChild(toast);

    // Se desvanece y desaparece sola a los 2.5 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

saveInventoryBtn.addEventListener('click', async () => {
    if (!currentSelectedCard) {
        alert("Selecciona una carta primero.");
        return;
    }

    const containerId = cardLocation.value;
    if (!containerId) {
        alert("Por favor, selecciona un contenedor de destino.");
        return;
    }

    // Usamos scryfall_id que es la propiedad real que devuelve tu endpoint de filtro
    const printingId = currentSelectedCard.scryfall_id || currentSelectedCard.id || currentSelectedCard.printing_id;

    if (!printingId) {
        alert("Error: La carta seleccionada no tiene un ID de impresión válido.");
        return;
    }

    const payload = {
        printing_id: printingId,
        container_id: containerId,
        condition: cardState.value || "Near Mint",
        language: "en",
        is_foil: false
    };

    try {
        const response = await fetch('http://localhost:8000/api/containers/items', {
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

            const errorLower = errorMsg.toLowerCase();
            if (errorLower.includes('espacio') || errorLower.includes('capacity') || response.status === 400) {
                alert("⚠️ ¡Contenedor lleno! No hay espacio libre disponible en este contenedor.");
            } else {
                alert(`Error / Validación: ${errorMsg}`);
            }
            return;
        }

        mostrarNotificacionFlotante(`¡${currentSelectedCard.name} añadida al contenedor con éxito!`);

    } catch (error) {
        console.error("Error al guardar inventario:", error);
        alert(`Hubo un error de conexión: ${error.message}`);
    }
});