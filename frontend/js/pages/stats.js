/* Estadísticas, historial y ranking. Todo el contenido de usuario se pinta con textContent. */
(function () {
    const $ = (id) => document.getElementById(id);
    const GAMES = { guess_card: 'Adivina la Carta', pong: 'Pong' };

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
            d.className = 'fantasy-panel p-4 text-center';
            const v = document.createElement('div');
            v.className = 'text-2xl font-bold text-[rgb(var(--c-accent))]';
            v.textContent = String(value);
            const l = document.createElement('div');
            l.className = 'text-xs text-[color:var(--text-muted)]';
            l.textContent = label;
            d.append(v, l);
            return d;
        }));
    }

    function renderHistory(rows) {
        $('history-empty').classList.toggle('hidden', rows.length > 0);
        $('history').replaceChildren(...rows.map((r) => {
            const tr = document.createElement('tr');
            tr.className = 'border-t border-[rgb(var(--c-gold-dark)/0.3)]';
            cell(tr, new Date(r.finished_at).toLocaleString());
            cell(tr, GAMES[r.game] || r.game);
            cell(tr, r.is_winner ? '🏆 Victoria' : 'Derrota (puesto ' + r.position + ')', r.is_winner ? 'text-emerald-400' : '');
            cell(tr, String(r.score));
            cell(tr, (r.opponents || []).join(', ') || '—');
            return tr;
        }));
    }

    function renderBoard(rows) {
        $('board-empty').classList.toggle('hidden', rows.length > 0);
        $('board').replaceChildren(...rows.map((r, i) => {
            const tr = document.createElement('tr');
            tr.className = 'border-t border-[rgb(var(--c-gold-dark)/0.3)]';
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
        try { renderXp(await CBAuth.fetch('/api/stats/xp').then((r) => r.json())); }
        catch (e) { console.error('Error cargando XP:', e); }
    }

    async function load() {
        const g = $('game-filter').value;
        const q = g ? '?game=' + encodeURIComponent(g) : '';
        try {
            const [me, board] = await Promise.all([
                CBAuth.fetch('/api/stats/me' + q).then((r) => r.json()),
                CBAuth.fetch('/api/stats/leaderboard' + q).then((r) => r.json()),
            ]);
            renderSummary(me.summary);
            renderHistory(me.history);
            renderBoard(board.leaderboard);
        } catch (e) {
            console.error('Error cargando estadísticas:', e);
        }
    }

    CBAuth.requireSession();
    $('game-filter').addEventListener('change', load);
    load();
    loadXp();
})();
