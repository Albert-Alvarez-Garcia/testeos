#!/usr/bin/env python3
"""Instala estadísticas: router, guardado al terminar partida, enlace en el menú. Desde ~/testeo:
   python3 patch_stats.py   |   python3 patch_stats.py --undo
Requiere haber copiado backend/routers/stats.py, frontend/stats.html y frontend/js/pages/stats.js."""
import os, re, shutil, sys
M, G, U = 'backend/main.py', 'backend/routers/game.py', 'frontend/js/shared/user-menu.js'
if '--undo' in sys.argv:
    for f in (M, G, U):
        if os.path.exists(f + '.sbak'): shutil.copy(f + '.sbak', f); print('restaurado', f)
    sys.exit()
for f in (M, G, U):
    if not os.path.exists(f + '.sbak'): shutil.copy(f, f + '.sbak')

# main.py
s = open(M).read()
if 'stats' not in s:
    imp = re.search(r'^from backend\.routers import (.+)$', s, re.M)
    inc = re.search(r'^app\.include_router\(giphy\.router\)$', s, re.M) or re.search(r'^app\.include_router\(\w+\.router\)$', s, re.M)
    if not (imp and inc): sys.exit('AVISO: añade a mano "stats" al import y app.include_router(stats.router) en main.py')
    s = s.replace(imp.group(0), imp.group(0) + ', stats', 1)
    s = s.replace(inc.group(0), inc.group(0) + '\napp.include_router(stats.router)', 1)
    open(M, 'w').write(s)
print('ok main.py')

# game.py
s = open(G).read()
if 'save_game_result' not in s:
    m = re.search(r'^from backend\.[^\n]+$', s, re.M)
    if not m: sys.exit('AVISO: no encuentro imports de backend en game.py')
    last = list(re.finditer(r'^from backend\.[^\n]+$', s, re.M))[-1]
    s = s[:last.end()] + '\nfrom backend.routers.stats import save_game_result' + s[last.end():]
    pat = re.compile(r'(room\.finished = True\n)(\s+)(await room\.broadcast\(\{\n\s+"type": "GAME_OVER")')
    m = pat.search(s)
    if not m: sys.exit('AVISO: no encuentro el bloque GAME_OVER en game.py')
    ind = m.group(2)
    hook = (f'{ind}try:\n{ind}    await asyncio.to_thread(save_game_result, "guess_card", room.room_id, room.ranking(), leader[0])\n'
            f'{ind}except Exception as e:\n{ind}    print(f"⚠️ No se pudo guardar el resultado: {{e}}")\n')
    s = s[:m.start(2)] + hook + s[m.start(2):]
    open(G, 'w').write(s)
print('ok game.py')

# user-menu.js: enlace
s = open(U).read()
if 'stats.html' not in s:
    a = '<a href="profile.html" class="um-btn">Perfil</a>'
    if a not in s: sys.exit('AVISO: añade un enlace a stats.html en el menú de usuario a mano')
    s = s.replace(a, a + '\n                <a href="stats.html" class="um-btn">Estadísticas</a>', 1)
    open(U, 'w').write(s)
print('ok user-menu.js\nHecho. Aplica con: make restart')
