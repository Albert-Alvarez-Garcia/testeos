const container = document.getElementById('cardContainer');
const card = document.getElementById('interactiveCard');
const magnifier = document.getElementById('cardMagnifier');
const toggleBtn = document.getElementById('toggleMagnifierBtn');
const modeStatus = document.getElementById('modeStatus');

let isMagnifierEnabled = false; // Estado inicial: apagado

const ZOOM_SCALE = 2; 
const MAGNIFIER_SIZE = 180; 

// Control del botón para activar/desactivar la lupa
toggleBtn.addEventListener('click', () => {
    isMagnifierEnabled = !isMagnifierEnabled;
    
    if (isMagnifierEnabled) {
        toggleBtn.classList.add('active');
        modeStatus.textContent = 'ACTIVADO';
    } else {
        toggleBtn.classList.remove('active');
        modeStatus.textContent = 'DESACTIVADO';
        magnifier.classList.remove('is-visible'); // Ocultar inmediatamente si se apaga
    }
});

// Inicializar el tamaño del fondo de la lupa
const cardImage = card.querySelector('img');
cardImage.addEventListener('load', () => {
    magnifier.style.backgroundSize = `${card.offsetWidth * ZOOM_SCALE}px auto`;
});
if (cardImage.complete) cardImage.dispatchEvent(new Event('load'));


// --- Evento principal de movimiento ---
container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // --- LÓGICA DE LA LUPA (Solo si está activada por el usuario) ---
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
        // Asegurar que si está desactivado, no se muestre
        magnifier.classList.remove('is-visible');
    }

    // --- LÓGICA DE INCLINACIÓN 2.5D (Funciona siempre, con o sin lupa) ---
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = -((mouseY - centerY) / centerY) * 15;
    const rotateY = ((mouseX - centerX) / centerX) * 15;

    card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
});


// --- Evento de salida del ratón ---
container.addEventListener('mouseleave', () => {
    magnifier.classList.remove('is-visible');
    card.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
});