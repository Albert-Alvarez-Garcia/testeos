#!/usr/bin/env python3
"""Corrige el error de consola 'Page entered Back-Forward Cache' y añade botón Abandonar.
Desde ~/testeo:  python3 fix_back.py   |   python3 fix_back.py --undo"""
import re, sys, shutil, os
G, L, H = 'frontend/js/pages/game.js', 'frontend/js/pages/lobby.js', 'frontend/game.html'
if '--undo' in sys.argv:
    for f in (G, L, H):
        if os.path.exists(f + '.bak'): shutil.copy(f + '.bak', f); print('restaurado', f)
    sys.exit()
for f in (G, L, H):
    if not os.path.exists(f + '.bak'): shutil.copy(f, f + '.bak')

def need(s, old, what):
    if old not in s: sys.exit(f'No encuentro el ancla "{what}" — no se ha modificado nada más.')
    return s

# ---- lobby.js ----
s = open(L).read()
if 'pageshow' not in s:
    need(s, 'connectLobbyWebSocket();', 'connectLobbyWebSocket();')
    i = s.rindex('connectLobbyWebSocket();')
    block = ("window.addEventListener('pagehide', () => { leaving = true; clearTimeout(reconnectTimer); if (ws) ws.close(); });\n"
             "        window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });\n        ")
    s = s[:i] + block + s[i:]
    open(L, 'w').write(s)
print('ok lobby.js')

# ---- game.js ----
s = open(G).read()
if 'leftGame' not in s:
    need(s, '// ---------------- WebSocket ----------------', 'bloque WebSocket')
    s = s.replace('// ---------------- WebSocket ----------------', 'let leftGame = false;\n\n    // ---------------- WebSocket ----------------', 1)
    s = s.replace('if (gameEnded) return;\n        ws = new WebSocket', 'if (gameEnded || leftGame) return;\n        ws = new WebSocket', 1)
    s = s.replace('ws.onclose = () => {\n            if (gameEnded) return;', 'ws.onclose = () => {\n            if (gameEnded || leftGame) return;', 1)
    need(s, 'connectGameWebSocket();', 'connectGameWebSocket();')
    i = s.rindex('connectGameWebSocket();')
    block = ("const leaveBtn = document.getElementById('leave-game-btn');\n"
             "    if (leaveBtn) leaveBtn.addEventListener('click', () => {\n"
             "        if (!confirm('¿Abandonar la partida?')) return;\n"
             "        leftGame = true;\n        if (ws) ws.close();\n        window.location.href = 'rooms.html';\n    });\n"
             "    window.addEventListener('pagehide', () => { leftGame = true; if (ws) ws.close(); });\n"
             "    window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });\n\n    ")
    s = s[:i] + block + s[i:]
    open(G, 'w').write(s)
print('ok game.js')

# ---- game.html ----
s = open(H).read()
if 'leave-game-btn' not in s:
    m = re.search(r'<p id="room-status"[^>]*>[^<]*</p>', s)
    if not m: sys.exit('No encuentro #room-status en game.html')
    btn = '\n            <button id="leave-game-btn" type="button" class="mt-1 text-[11px] font-bold text-red-300 hover:text-red-200 underline">🚪 Abandonar partida</button>'
    s = s.replace(m.group(0), m.group(0) + btn, 1)
    open(H, 'w').write(s)
print('ok game.html')
