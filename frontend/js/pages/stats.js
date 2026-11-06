/* Estadísticas, historial y ranking. Todo el contenido de usuario se pinta con textContent. */
(function () {
    const $ = (id) => document.getElementById(id);
    const GAMES = { guess_card: 'Adivina la Carta', pong: 'Pong' };
    let requestId = 0;

    async function readApi(path) {
        const response = await CBAuth.fetch(path, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }

    function cell(tr, text, cls) {
        const td = document.createElement('td');
        td.className = 'py-2 pr-3 ' + (cls || '');
        td.textContent = text;
        tr.appendChild(td);
    }

    function renderSummary(s) {
        const items = [['Partidas', s.games], ['Victorias', s.wins], ['Derrotas', s.losses],
                       ['% victorias', s.win_rate + '%'], ['Mejor puntuación', s.best]];
        $('summary').replaceChildren(...items.map(([label, value]) => {
            const d = document.createElement('div');
            d.className = 'stats-card';
            const v = document.createElement('div');
            v.className = 'stats-card-value';
            v.textContent = String(value);
            const l = document.createElement('div');
            l.className = 'stats-card-label';
            l.textContent = label;
            d.append(v, l);
            return d;
        }));
    }

    function renderHistory(rows) {
        rows = Array.isArray(rows) ? rows : [];
        $('history-empty').hidden = rows.length > 0;
        $('history').replaceChildren(...rows.map((r) => {
            const tr = document.createElement('tr');
            const date = new Date(r.finished_at);
            cell(tr, Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-ES'));
            cell(tr, GAMES[r.game] || r.game);
            cell(tr, r.is_winner ? '🏆 Victoria' : 'Derrota (puesto ' + r.position + ')', r.is_winner ? 'text-emerald-400' : '');
            cell(tr, String(r.score));
            cell(tr, (r.opponents || []).join(', ') || '—');
            return tr;
        }));
    }

    function renderBoard(rows) {
        rows = Array.isArray(rows) ? rows : [];
        $('board-empty').hidden = rows.length > 0;
        $('board').replaceChildren(...rows.map((r, i) => {
            const tr = document.createElement('tr');
            cell(tr, String(i + 1));
            cell(tr, r.username);
            cell(tr, String(r.wins));
            cell(tr, String(r.games));
            cell(tr, String(r.points));
            return tr;
        }));
    }

    function renderXp(x) {
        $('xp-level').textContent = String(x.level);
        $('xp-text').textContent = x.xp + ' XP · siguiente nivel en ' + x.next_level_xp + ' XP';
        $('xp-bar').style.width = x.progress + '%';
        $('xp-bar-wrap').setAttribute('aria-valuenow', String(x.progress));
        const b = x.breakdown;
        $('xp-breakdown').textContent = 'Cartas ' + b.cards + ' · Contenedores ' + b.containers +
            ' · Medallas ' + b.medals + ' · Partidas ' + b.games + ' · Victorias ' + b.wins;
    }

    async function loadXp() {
        try {
            renderXp(await readApi('/api/stats/xp'));
        } catch (e) {
            console.error('Error cargando XP:', e);
            $('xp-error').hidden = false;
            $('xp-text').textContent = 'No se pudo cargar el progreso';
        }
    }

    async function load() {
        const currentRequest = ++requestId;
        const g = $('game-filter').value;
        const q = g ? '?game=' + encodeURIComponent(g) : '';
        $('stats-error').hidden = true;
        $('summary-status').textContent = 'Actualizando…';
        try {
            const [me, board] = await Promise.all([
                readApi('/api/stats/me' + q),
                readApi('/api/stats/leaderboard' + q),
            ]);
            if (currentRequest !== requestId) return;
            renderSummary(me.summary);
            renderHistory(me.history);
            renderBoard(board.leaderboard);
            $('summary-status').textContent = '';
        } catch (e) {
            if (currentRequest !== requestId) return;
            console.error('Error cargando estadísticas:', e);
            $('summary-status').textContent = '';
            $('stats-error').hidden = false;
        }
    }

    CBAuth.requireSession();
    $('game-filter').addEventListener('change', load);
    load();
    loadXp();
})();
