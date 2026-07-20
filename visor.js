const container = document.getElementById('cardContainer');
const card = document.getElementById('interactiveCard');
const cardImage = document.getElementById('dynamicCardImg');
const magnifier = document.getElementById('cardMagnifier');
const toggleBtn = document.getElementById('toggleMagnifierBtn');
const modeStatus = document.getElementById('modeStatus');

// Elementos del panel de info
const cardNameEl = document.getElementById('cardName');
const cardTypeEl = document.getElementById('cardType');
const cardTextEl = document.getElementById('cardText');
const cardPriceEl = document.getElementById('cardPrice');

let isMagnifierEnabled = false; 

const ZOOM_SCALE = 2; 
const MAGNIFIER_SIZE = 180; 

// --- Control del botón ---
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

// --- Conexión con Scryfall usando el ID de la carta seleccionada ---
async function cargarCartaSeleccionada() {
    try {
        // 1. Intentamos leer el ID desde los parámetros de la URL (?id=...) o del localStorage
        const urlParams = new URLSearchParams(window.location.search);
        let cardId = urlParams.get('id');

        if (!cardId) {
            cardId = localStorage.getItem('selected-card-id');
        }

        // Si por lo que sea no hay ID guardado, hacemos fallback a una carta por defecto o aleatoria
        const endpoint = cardId 
            ? `https://api.scryfall.com/cards/${cardId}` 
            : `https://api.scryfall.com/cards/random`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error('Error al conectar con Scryfall');
        
        const data = await response.json();
        
        // 2. Imagen
        const imageUrl = data.image_uris ? data.image_uris.normal : data.card_faces[0].image_uris.normal;
        cardImage.src = imageUrl;

        // 3. Metadatos para el panel
        cardNameEl.textContent = data.name || "Desconocido";
        cardTypeEl.textContent = data.type_line || "Tipo no disponible";
        
        const oracleText = data.oracle_text || (data.card_faces ? data.card_faces[0].oracle_text : "Sin texto de reglas");
        cardTextEl.textContent = oracleText;

        const priceEur = data.prices && data.prices.eur ? data.prices.eur : null;
        cardPriceEl.textContent = priceEur ? `${priceEur} €` : "No disponible";

        console.log("Carta cargada correctamente en el visor:", data.name);

    } catch (error) {
        console.error("Hubo un problema:", error);
        cardNameEl.textContent = "Error de carga";
        cardTextEl.textContent = "No se pudo obtener la información de la carta.";
    }
}

// Ejecutar al iniciar el visor
cargarCartaSeleccionada();

// Configurar tamaño de la lupa al cargar la imagen
cardImage.addEventListener('load', () => {
    magnifier.style.backgroundSize = `${card.offsetWidth * ZOOM_SCALE}px auto`;
});

// --- Eventos de movimiento (2.5D + Lupa) ---
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