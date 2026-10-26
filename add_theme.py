#!/usr/bin/env python3
"""
add_theme.py · Añade <script src="theme.js"></script> al <head> de las páginas de frontend/.
Uso (desde ~/testeo):  python3 add_theme.py
Se saltan las copias viejas (nombres con old, pre, actual...). Guarda .bak y se puede repetir.
"""
import re, shutil
from pathlib import Path

TAG = '<script src="theme.js"></script>'
SKIP = re.compile(r"old|^pre|actual|^visor-crud|^visor\.html$", re.I)

for p in sorted(Path("frontend").glob("*.html")):
    if SKIP.search(p.name):
        print(f"· {p.name} (omitido)")
        continue
    t = p.read_text(encoding="utf-8")
    if TAG in t:
        print(f"= {p.name} (ya lo tenía)")
        continue
    if "</head>" not in t:
        print(f"⚠ {p.name}: sin </head>, añádelo a mano")
        continue
    shutil.copy2(p, str(p) + ".bak")
    p.write_text(t.replace("</head>", f"    {TAG}\n</head>", 1), encoding="utf-8")
    print(f"✔ {p.name}")
