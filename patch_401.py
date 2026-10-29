#!/usr/bin/env python3
"""Si el servidor responde 401 a /api/profile/me, el menú borra la sesión local y va al login.
Desde ~/testeo:  python3 patch_401.py   |   python3 patch_401.py --undo"""
import os, shutil, sys
F = 'frontend/js/shared/user-menu.js'
if '--undo' in sys.argv:
    if os.path.exists(F + '.qbak'): shutil.copy(F + '.qbak', F); print('restaurado')
    sys.exit()
s = open(F).read()
old = "                if (!res.ok) return;\n                const me = await res.json();"
new = ("                if (res.status === 401) {\n"
       "                    try { localStorage.removeItem('cardbinder_user'); localStorage.removeItem('user_session'); } catch (e) {}\n"
       "                    window.location.href = LOGIN_PAGE;\n"
       "                    return;\n"
       "                }\n"
       "                if (!res.ok) return;\n                const me = await res.json();")
if 'removeItem' in s and 'res.status === 401' in s and new in s: sys.exit('Ya aplicado.')
if old not in s: sys.exit('AVISO: ancla no encontrada en user-menu.js')
shutil.copy(F, F + '.qbak')
open(F, 'w').write(s.replace(old, new, 1))
print('ok. Aplica con: make restart')
