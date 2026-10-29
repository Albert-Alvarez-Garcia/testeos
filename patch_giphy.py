#!/usr/bin/env python3
"""Mueve la API key de Giphy al backend. Desde ~/testeo:
  python3 patch_giphy.py          # aplica (crea .bak de lo que toca)
  python3 patch_giphy.py --undo
Requiere backend/routers/giphy.py ya copiado."""
import os, re, sys, shutil, glob
FILES = ['backend/main.py', 'frontend/js/pages/gacha.js', 'frontend/js/shared/chat.js']
compose = next((p for p in ('docker-compose.yml', 'docker/docker-compose.yml') if os.path.exists(p)), None)
FILES.append(compose)
if '--undo' in sys.argv:
    for f in FILES:
        if f and os.path.exists(f + '.giphybak'):
            shutil.copy(f + '.giphybak', f); os.remove(f + '.giphybak'); print('restaurado', f)
    sys.exit()
KEY = 'uYe3zQDwYQ8ZaDrzjdbgSr5Uwm3TOZ6O'
for f in FILES:
    if f and os.path.exists(f) and not os.path.exists(f + '.giphybak'):
        shutil.copy(f, f + '.giphybak')

# 1) frontend: llamar al proxy
for f, limit in (('frontend/js/pages/gacha.js', 15), ('frontend/js/shared/chat.js', 9)):
    s = open(f).read()
    s2 = re.sub(r'https://api\.giphy\.com/v1/gifs/search\?api_key=[A-Za-z0-9]+&q=', '/api/giphy/search?q=', s)
    s2 = s2.replace('&lang=es', '')
    if s2 == s: print('AVISO: sin cambios en', f)
    s2 = s2.replace("fetch(`/api/giphy/search", "fetch(`/api/giphy/search")  # mismo origen: va la cookie
    open(f, 'w').write(s2)
    print('ok', f)

# 2) .env
env = open('.env').read() if os.path.exists('.env') else ''
if 'GIPHY_API_KEY=' not in env:
    open('.env', 'a').write(('' if env.endswith('\n') or not env else '\n') + f'GIPHY_API_KEY={KEY}\n')
if os.path.exists('.env.example') and 'GIPHY_API_KEY=' not in open('.env.example').read():
    open('.env.example', 'a').write('GIPHY_API_KEY=\n')
print('ok .env')

# 3) compose: pasar la variable al servicio api
s = open(compose).read()
if 'GIPHY_API_KEY' not in s:
    m = re.search(r'^(\s*)JWT_SECRET:.*$', s, re.M)
    if m:
        s = s.replace(m.group(0), m.group(0) + f'\n{m.group(1)}GIPHY_API_KEY: ${{GIPHY_API_KEY}}', 1)
    else:
        m = re.search(r'^(\s*)-\s*JWT_SECRET=.*$', s, re.M)
        if m:
            s = s.replace(m.group(0), m.group(0) + f'\n{m.group(1)}- GIPHY_API_KEY=${{GIPHY_API_KEY}}', 1)
        else:
            print('AVISO: añade GIPHY_API_KEY al environment del servicio api (o usa env_file: .env)')
    open(compose, 'w').write(s)
print('ok', compose)

# 4) main.py
s = open('backend/main.py').read()
if 'giphy' not in s:
    m = re.search(r'^(.*)app\.include_router\((\w+)\.router[^\n]*$', s, re.M)
    imp = re.search(r'^from (backend\.routers|routers) import (.+)$', s, re.M)
    if not m:
        print('AVISO: añade a mano: app.include_router(giphy.router)')
    else:
        pre = m.group(1)
        if imp:
            s = s.replace(imp.group(0), imp.group(0) + ', giphy', 1)
        else:
            print('AVISO: añade "giphy" al import de routers en main.py')
        s = s.replace(m.group(0), m.group(0) + f'\n{pre}app.include_router(giphy.router)', 1)
        open('backend/main.py', 'w').write(s)
        print('ok backend/main.py')
