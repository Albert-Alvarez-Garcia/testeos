#!/usr/bin/env python3
"""Chat directo: GIFs, invitar a jugar, 'escribiendo…' y aviso de partida en el chat global.
Desde ~/testeo (tras copiar backend/routers/chat_notify.py):  python3 patch_dm.py   |   --undo"""
import os, re, shutil, sys
S, PJ, PH, G, C = ('backend/routers/social.py', 'frontend/js/pages/profile.js', 'frontend/profile.html',
                   'backend/routers/game.py', 'backend/routers/chat.py')
FILES = (S, PJ, PH, G, C)
if '--undo' in sys.argv:
    for f in FILES:
        if os.path.exists(f + '.mbak'): shutil.copy(f + '.mbak', f); print('restaurado', f)
    sys.exit()
for f in FILES:
    if os.path.exists(f) and not os.path.exists(f + '.mbak'): shutil.copy(f, f + '.mbak')

def sub(path, old, new, required=True):
    s = open(path).read()
    if new in s: return
    if old not in s:
        if required: sys.exit(f'AVISO: ancla no encontrada en {path}: {old[:60]!r}')
        return print('aviso (opcional):', path, old[:40])
    open(path, 'w').write(s.replace(old, new, 1))

# ---------------- social.py ----------------
sub(S, 'from datetime import datetime, timezone', 'import time\nfrom datetime import datetime, timezone')
sub(S, 'HISTORY_LIMIT = 50', 'HISTORY_LIMIT = 50\nTYPING_SECONDS = 4\n_typing = {}  # (emisor, receptor) -> instante del último "escribiendo"')
sub(S, '            for r in rows\n        ]}',
       '            for r in rows\n        ], "typing": (time.monotonic() - _typing.get((other_id, me_id), -100.0)) < TYPING_SECONDS}')
sub(S, '@router.post("/dm/{username}")\ndef send_dm', '''@router.post("/dm/{username}/typing")
def dm_typing(username: str, current_user: dict = Depends(get_session_user)):
    """Marca que el usuario está escribiendo a ese amigo (caduca a los pocos segundos)."""
    target = _require_friend(current_user, username)
    _typing[(str(current_user["id"]), str(target["id"]))] = time.monotonic()
    return {"ok": True}


@router.post("/dm/{username}")
def send_dm''')

# ---------------- profile.html ----------------
h = open(PH).read()
if 'fm-gif-btn' not in h:
    m = re.search(r'<form id="fm-form"[^>]*>', h)
    if not m: sys.exit('AVISO: no encuentro #fm-form en profile.html')
    extra = '''<p id="fm-typing" class="hidden px-4 text-xs italic text-[color:var(--text-muted)]" aria-live="polite"></p>
            <div id="fm-gif-picker" class="hidden px-4 pb-2">
                <input type="text" id="fm-gif-search" maxlength="60" autocomplete="off" placeholder="Buscar GIF..." aria-label="Buscar GIF" class="w-full text-sm mb-2">
                <div id="fm-gif-results" class="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto"></div>
                <img src="public/assets/Poweredby_100px-Black_VertLogo.png" alt="Powered by Giphy" class="h-4 opacity-75 mt-1">
            </div>
            '''
    btns = '''
                <button type="button" id="fm-gif-btn" class="btn-fantasy text-sm" title="Enviar un GIF" aria-label="Enviar un GIF">GIF</button>
                <button type="button" id="fm-invite-btn" class="btn-fantasy text-sm" title="Invitar a jugar" aria-label="Invitar a jugar">🎮</button>'''
    h = h.replace(m.group(0), extra + m.group(0) + btns, 1)
    open(PH, 'w').write(h)

# ---------------- profile.js ----------------
sub(PJ, "    function fmBubble(m) {", '''    const GIF_RE = /^gif:(https:\\/\\/(?:[a-z0-9-]+\\.)*giphy\\.com\\/[^\\s"'<>]{1,400})$/i;
    const INVITE_RE = /^invite:lobby:([A-Za-z0-9_-]{3,40})$/;

    // Contenido de un mensaje: GIF (solo de Giphy), invitación a sala o texto plano (textContent)
    function dmContent(m) {
        const g = GIF_RE.exec(m.message);
        if (g) {
            const img = el('img', 'max-w-full rounded');
            img.src = g[1]; img.alt = 'GIF'; img.loading = 'lazy';
            return img;
        }
        const inv = INVITE_RE.exec(m.message);
        if (inv) {
            const box = el('div', 'flex flex-col gap-2');
            box.append(el('p', 'font-semibold', m.mine ? '🎮 Has invitado a jugar' : '🎮 Te invita a jugar'));
            const a = el('a', 'btn-fantasy text-xs text-center', 'Entrar a la sala');
            a.href = 'lobby.html?room=' + encodeURIComponent(inv[1]);
            box.append(a);
            return box;
        }
        return el('p', 'whitespace-pre-wrap', m.message);
    }

    function showTyping(on) {
        const t = $('fm-typing');
        t.classList.toggle('hidden', !on);
        if (on) t.textContent = fm.user + ' está escribiendo…';
    }

    function fmBubble(m) {''')
sub(PJ, "b.append(el('p', 'whitespace-pre-wrap', m.message)); // textContent: nunca se interpreta HTML", "b.append(dmContent(m)); // textContent / DOM: nunca se interpreta HTML")
sub(PJ, "if (fm.user === who) appendDm(data.messages || []);", "if (fm.user === who) { appendDm(data.messages || []); showTyping(!!data.typing); }")
sub(PJ, "        fm.user = null;\n        $('fm-modal').classList.add('hidden');", "        fm.user = null;\n        $('fm-modal').classList.add('hidden');\n        $('fm-gif-picker').classList.add('hidden');\n        $('fm-typing').classList.add('hidden');")
sub(PJ, "    // ---------- Enlaces desde la campana del inicio", '''    // ---------- Escribiendo, GIFs e invitaciones ----------
    let lastTypingPing = 0;
    $('fm-input').addEventListener('input', () => {
        const now = Date.now();
        if (!fm.user || now - lastTypingPing < 2500) return;
        lastTypingPing = now;
        socialApi('/dm/' + encodeURIComponent(fm.user) + '/typing', { method: 'POST' }).catch(() => {});
    });

    async function sendDm(text) {
        if (!fm.user) return;
        try {
            await socialApi('/dm/' + encodeURIComponent(fm.user), { method: 'POST', json: { message: text } });
            await pollDm(true);
        } catch (err) {
            if (err.message !== 'Sesión caducada') toast(err.message, true);
        }
    }

    const gifPicker = $('fm-gif-picker'), gifResults = $('fm-gif-results'), gifSearch = $('fm-gif-search');
    let gifTimer = null;
    $('fm-gif-btn').addEventListener('click', () => {
        gifPicker.classList.toggle('hidden');
        if (!gifPicker.classList.contains('hidden')) gifSearch.focus();
    });
    gifSearch.addEventListener('input', () => {
        clearTimeout(gifTimer);
        const q = gifSearch.value.trim();
        if (!q) { gifResults.replaceChildren(); return; }
        gifTimer = setTimeout(async () => {
            try {
                const res = await fetch('/api/giphy/search?q=' + encodeURIComponent(q) + '&limit=9', { credentials: 'same-origin' });
                if (!res.ok) throw new Error('Giphy ' + res.status);
                const data = await res.json();
                gifResults.replaceChildren(...(data.data || [])
                    .filter((g) => g.images && g.images.fixed_height_small && g.images.fixed_height_small.url)
                    .map((g) => {
                        const url = g.images.fixed_height_small.url;
                        const b = el('button', 'rounded overflow-hidden border border-[rgb(var(--c-gold-dark))]');
                        b.type = 'button';
                        const img = el('img', 'w-full h-16 object-cover');
                        img.alt = 'GIF'; img.src = url;
                        b.append(img);
                        b.addEventListener('click', () => {
                            gifPicker.classList.add('hidden'); gifSearch.value = ''; gifResults.replaceChildren();
                            sendDm('gif:' + url);
                        });
                        return b;
                    }));
            } catch (e) { toast('No se pudieron cargar los GIFs.', true); }
        }, 400);
    });

    $('fm-invite-btn').addEventListener('click', () => {
        sendDm('invite:lobby:duelo-' + Math.random().toString(36).slice(2, 8));
    });

    // ---------- Enlaces desde la campana del inicio''')

# ---------------- game.py: aviso en el chat global ----------------
g = open(G).read()
if 'announce_game' not in g:
    imp = 'from backend.routers.stats import save_game_result'
    hook = re.search(r'^(\s+)print\(f"⚠️ No se pudo guardar el resultado: \{e\}"\)$', g, re.M)
    if imp not in g or not hook: sys.exit('AVISO: aplica antes patch_stats.py (falta el guardado de resultados en game.py)')
    ind = hook.group(1)[:-4] if len(hook.group(1)) >= 4 else hook.group(1)
    add = (f'\n{ind}try:\n{ind}    await announce_game("Adivina la Carta", leader[0], room.ranking())\n'
           f'{ind}except Exception as e:\n{ind}    print(f"⚠️ No se pudo avisar en el chat: {{e}}")')
    g = g.replace(hook.group(0), hook.group(0) + add, 1)
    g = g.replace(imp, imp + '\nfrom backend.routers.chat_notify import announce_game', 1)
    open(G, 'w').write(g)

# ---------------- chat.py: patrón de GIF más estricto (opcional) ----------------
sub(C, r'https://[a-z0-9.-]*giphy\.com/', r'https://(?:[a-z0-9-]+\.)*giphy\.com/', required=False)
print('Hecho. Aplica con: make restart')
