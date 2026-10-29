#!/usr/bin/env python3
"""Saca Dockerfile y nginx.conf de frontend/ (donde Nginx los servía públicamente) a docker/.

Uso (desde la raíz del proyecto, ~/testeo):
    python3 move_docker_files.py --dry-run    # solo muestra lo que haría
    python3 move_docker_files.py              # lo aplica (guarda copias .bak)
    python3 move_docker_files.py --undo       # lo deshace

Cambios:
  frontend/Dockerfile  ->  docker/frontend.Dockerfile   (y su COPY de nginx.conf apunta a docker/)
  frontend/nginx.conf  ->  docker/nginx.conf
  docker-compose.yml   :   dockerfile: docker/frontend.Dockerfile
"""
import shutil, sys
from pathlib import Path

ROOT = Path.cwd()
DRY = "--dry-run" in sys.argv
UNDO = "--undo" in sys.argv

# El Dockerfile puede llamarse "Dockerfile" o "dockerfile" según el disco
_found = [f.name for f in (ROOT / "frontend").glob("*") if f.name.lower() == "dockerfile"] if (ROOT / "frontend").exists() else []
SRC_DOCKERFILE = "frontend/" + (_found[0] if _found else "Dockerfile")

MOVES = [(SRC_DOCKERFILE, "docker/frontend.Dockerfile"),
         ("frontend/nginx.conf", "docker/nginx.conf")]
EDITS = [("docker/frontend.Dockerfile", "COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf",
          "COPY docker/nginx.conf /etc/nginx/conf.d/default.conf"),
         ("docker-compose.yml", "dockerfile: frontend/Dockerfile", "dockerfile: docker/frontend.Dockerfile")]
# (al deshacer, el Dockerfile vuelve como "frontend/Dockerfile", que es el nombre que usa docker-compose.yml)

def say(msg): print(("[simulación] " if DRY else "") + msg)

def move(a, b):
    say(f"mover {a} -> {b}")
    if not DRY:
        (ROOT / b).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(ROOT / a), str(ROOT / b))

def check():
    for a, b in MOVES:
        src, dst = (b, "frontend/Dockerfile" if b.endswith("frontend.Dockerfile") else a) if UNDO else (a, b)
        if not (ROOT / src).exists():
            sys.exit(f"✘ No encuentro {src}. ¿Estás en la raíz del proyecto?")
        if (ROOT / dst).exists():
            sys.exit(f"✘ {dst} ya existe; no sobrescribo.")
    for f, old, new in EDITS:
        path = ROOT / (f if not UNDO else f)
        if not UNDO and f.startswith("docker/"):
            continue  # el Dockerfile aún no está movido en la fase de comprobación
        if not path.exists():
            sys.exit(f"✘ No encuentro {f}")

def edit(f, old, new):
    p = ROOT / f
    text = p.read_text(encoding="utf-8")
    a, b = (new, old) if UNDO else (old, new)
    if a not in text:
        say(f"(sin cambios en {f}: no contiene «{a}»)")
        return
    say(f"editar {f}: «{a}» -> «{b}»")
    if not DRY:
        shutil.copy2(p, p.with_name(p.name + ".bak"))
        p.write_text(text.replace(a, b), encoding="utf-8")

check()
if UNDO:
    for f, old, new in EDITS:
        edit(f, old, new)
    for a, b in MOVES:
        move(b, "frontend/Dockerfile" if b.endswith("frontend.Dockerfile") else a)
else:
    for a, b in MOVES:
        move(a, b)
    for f, old, new in EDITS:
        edit(f, old, new)

print("\nListo. Ahora reconstruye y comprueba:")
print("  make restart")
print('  curl -sk -o /dev/null -w "%{http_code}\\n" https://localhost:8443/Dockerfile    # debe ser 404')
print('  curl -sk -o /dev/null -w "%{http_code}\\n" https://localhost:8443/nginx.conf    # debe ser 404')
print('  curl -sk -o /dev/null -w "%{http_code}\\n" https://localhost:8443/index.html    # debe ser 200')
