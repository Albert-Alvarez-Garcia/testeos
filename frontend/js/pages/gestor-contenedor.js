/* gestor-contenedor.js · Visor de una carta con efecto 2.5D y lupa (gestor-contenedor.html).
   Parámetros de la URL: card_id, printing_id, img, name. Requiere js/shared/auth.js. */
(() => {
  'use strict';

  if (!CBAuth.requireSession()) return;

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', () => window.history.back());

  const params = new URLSearchParams(window.location.search);

  const cardId = params.get('card_id');
  const printingId = params.get('printing_id');
  const imageUrl = params.get('img');
  const cardName = params.get('name');

  const card = document.getElementById('interactiveCard');
  const cardContainer = document.getElementById('cardContainer');
  const cardImage = document.getElementById('dynamicCardImg');
  const magnifier = document.getElementById('cardMagnifier');
  const toggleBtn = document.getElementById('toggleMagnifierBtn');
  const modeStatus = document.getElementById('modeStatus');

  let magnifierEnabled = false;

  const ZOOM_SCALE = 2;
  const MAGNIFIER_SIZE = 160;

  // La URL llega ya decodificada en searchParams; solo se aceptan imágenes https o rutas propias
  const isSafeImage = (u) => /^https:\/\//i.test(u) || /^(public\/|\/)/.test(u);

  if (imageUrl && cardImage && isSafeImage(imageUrl)) {
    cardImage.src = imageUrl;
    cardImage.alt = cardName || 'Carta';
  } else if (cardImage) {
    cardImage.src = 'public/assets/nocapi.png';
  }

  if (cardImage) {
      cardImage.dataset.cardId = cardId || '';
      cardImage.dataset.printingId = printingId || '';
  }

  function actualizarLupa() {
    if (!cardImage || !card || !magnifier) return;

    const width = card.offsetWidth;
    const height = card.offsetHeight;

    if (width <= 0 || height <= 0) return;

    magnifier.style.width = MAGNIFIER_SIZE + 'px';
    magnifier.style.height = MAGNIFIER_SIZE + 'px';
    magnifier.style.backgroundSize = `${width * ZOOM_SCALE}px ${height * ZOOM_SCALE}px`;

    magnifier.style.backgroundImage = `url("${cardImage.src}")`;
    magnifier.style.backgroundRepeat = 'no-repeat';
  }

  if (cardImage) {
    cardImage.addEventListener('load', () => {
      actualizarLupa();
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      magnifierEnabled = !magnifierEnabled;

      toggleBtn.classList.toggle('active', magnifierEnabled);

      if (modeStatus) {
        modeStatus.textContent = magnifierEnabled ? 'ACTIVADO' : 'DESACTIVADO';
      }

      if (!magnifierEnabled && magnifier) {
        magnifier.classList.remove('is-visible');
      }

      actualizarLupa();
    });
  }

  if (cardContainer && card && magnifier && cardImage) {
    cardContainer.addEventListener('mousemove', (event) => {
      const rect = cardContainer.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) return;

      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = -((mouseY - centerY) / centerY) * 15;
      const rotateY = ((mouseX - centerX) / centerX) * 15;

      card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05,1.05,1.05)`;

      if (!magnifierEnabled) {
        magnifier.classList.remove('is-visible');
        return;
      }

      actualizarLupa();

      const magX = mouseX - MAGNIFIER_SIZE / 2;
      const magY = mouseY - MAGNIFIER_SIZE / 2;

      magnifier.style.left = `${magX}px`;
      magnifier.style.top = `${magY}px`;

      const backgroundWidth = card.offsetWidth * ZOOM_SCALE;
      const backgroundHeight = card.offsetHeight * ZOOM_SCALE;

      const percentX = mouseX / rect.width;
      const percentY = mouseY / rect.height;

      const bgPosX = -(percentX * backgroundWidth) + MAGNIFIER_SIZE / 2;
      const bgPosY = -(percentY * backgroundHeight) + MAGNIFIER_SIZE / 2;

      magnifier.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
      magnifier.style.backgroundImage = `url("${cardImage.src}")`;

      magnifier.classList.add('is-visible');
    });

    cardContainer.addEventListener('mouseleave', () => {
      magnifier.classList.remove('is-visible');
      card.style.transform = 'rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    });
  }

  requestAnimationFrame(() => {
    actualizarLupa();
  });
})();
