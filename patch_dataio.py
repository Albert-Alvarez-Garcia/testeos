#!/usr/bin/env python3
"""Instala exportar/importar colección. Desde ~/testeo (tras copiar dataio.py y dataio.js):
   python3 patch_dataio.py   |   python3 patch_dataio.py --undo"""
import os, re, shutil, sys
M, H = 'backend/main.py', 'frontend/report.html'
if '--undo' in sys.argv:
    for f in (M, H):
        if os.path.exists(f + '.dbak'): shutil.copy(f + '.dbak', f); print('restaurado', f)
    sys.exit()
for f in (M, H):
    if not os.path.exists(f + '.dbak'): shutil.copy(f, f + '.dbak')
s = open(M).read()
if 'dataio' not in s:
    imp = re.search(r'^from backend\.routers import (.+)$', s, re.M)
    inc = re.search(r'^app\.include_router\(stats\.router\)$', s, re.M) or re.search(r'^app\.include_router\(\w+\.router\)$', s, re.M)
    if not (imp and inc): sys.exit('AVISO: añade a mano "dataio" al import y app.include_router(dataio.router) en main.py')
    s = s.replace(imp.group(0), imp.group(0) + ', dataio', 1)
    s = s.replace(inc.group(0), inc.group(0) + '\napp.include_router(dataio.router)', 1)
    open(M, 'w').write(s)
print('ok main.py')
h = open(H).read()
if 'dataio.js' not in h:
    tag = '<script src="js/pages/report.js"></script>'
    if tag not in h: sys.exit('AVISO: añade <script src="js/pages/dataio.js"></script> tras report.js en report.html')
    open(H, 'w').write(h.replace(tag, tag + '\n    <script src="js/pages/dataio.js"></script>', 1))
print('ok report.html\nHecho. Aplica con: make restart')
