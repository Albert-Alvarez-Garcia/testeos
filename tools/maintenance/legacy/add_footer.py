#!/usr/bin/env python3
"""Añade el pie legal a todas las páginas HTML de frontend/. Desde ~/testeo:
   python3 add_footer.py          # aplica (crea .bak)
   python3 add_footer.py --undo"""
import glob, shutil, sys, os
TAG = '<script src="js/shared/footer.js"></script>'
for f in sorted(glob.glob('frontend/*.html')):
    if os.path.basename(f) in ('privacy.html', 'terms.html'):
        continue
    if '--undo' in sys.argv:
        if os.path.exists(f + '.bak'): shutil.copy(f + '.bak', f); print('restaurado', f)
        continue
    s = open(f).read()
    if 'footer.js' in s: print('ya tiene', f); continue
    if '</body>' not in s: print('AVISO sin </body>', f); continue
    shutil.copy(f, f + '.bak')
    open(f, 'w').write(s.replace('</body>', '    ' + TAG + '\n</body>', 1))
    print('ok', f)
