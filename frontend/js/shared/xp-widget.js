/* Píldoras de nivel reutilizables para la portada y el perfil. */
(() => {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        const widgets = [...document.querySelectorAll('[data-xp-widget]')];
        if (!widgets.length) return;

        const setError = () => widgets.forEach((widget) => {
            widget.dataset.xpState = 'error';
            const caption = widget.querySelector('[data-xp-caption]');
            if (caption) caption.textContent = 'No se pudo cargar tu progreso';
        });

        try {
            const response = await fetch('/api/stats/xp', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (response.status === 401) {
                location.href = 'login.html';
                return;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            const progress = Math.max(0, Math.min(100, Number(data.progress) || 0));
            const xp = Math.max(0, Number(data.xp) || 0);
            const remaining = Math.max(0, (Number(data.next_level_xp) || 0) - xp);
            const format = (value) => new Intl.NumberFormat('es-ES').format(value);

            widgets.forEach((widget) => {
                widget.dataset.xpState = 'ready';
                const level = widget.querySelector('[data-xp-level]');
                const caption = widget.querySelector('[data-xp-caption]');
                const track = widget.querySelector('[data-xp-track]');
                const bar = widget.querySelector('[data-xp-bar]');
                if (level) level.textContent = format(Math.max(1, Number(data.level) || 1));
                if (caption) caption.textContent = `${format(xp)} XP · ${format(remaining)} XP para el siguiente nivel`;
                if (track) track.setAttribute('aria-valuenow', String(progress));
                if (bar) bar.style.width = `${progress}%`;
            });
        } catch (error) {
            console.error('No se pudo cargar el nivel del usuario:', error);
            setError();
        }
    });
})();
