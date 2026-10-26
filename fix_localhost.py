#!/usr/bin/env python3
"""
fix_localhost.py · Quita 'localhost' del código para poder entrar desde otra IP (otro PC, el móvil...).

Uso (desde la carpeta del proyecto, ~/testeo):
    python3 fix_localhost.py

Qué hace (guarda copia .bak de cada fichero que cambia):
  - frontend/: las llamadas a http://localhost:8000/... pasan a rutas relativas (/api/...), que nginx ya
    reenvía al backend; los WebSocket y API_HOST usan el host de la página (location.host).
  - backend/routers/auth.py: el login con 42 calcula la URL de retorno a partir del host con el que entras
    (localhost, tu IP...) y la página puente vuelve al mismo host.
Se puede ejecutar varias veces sin estropear nada.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
WS_EXPR = "(location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + "

WS_RE = re.compile(r"""(["'`])wss?://(?:localhost|127\.0\.0\.1):8000(/[^"'`]*)\1""")
HOST_RE = re.compile(r"""(["'])(?:localhost|127\.0\.0\.1):8000\1""")
HTTP_RE = re.compile(r"https?://(?:localhost|127\.0\.0\.1):8000")
# `ws://${API_HOST}/...` ya no hace falta tocarlo: API_HOST pasa a ser location.host


def fix_frontend_text(text: str) -> str:
    text = WS_RE.sub(lambda m: f"{WS_EXPR}{m.group(1)}{m.group(2)}{m.group(1)}", text)
    text = HOST_RE.sub("location.host", text)
    text = HTTP_RE.sub("", text)
    return text


def patch_auth(text: str):
    if "def _redirect_uri(" in text:
        return text, []
    notes = []

    helper = '''

def _redirect_uri(request: Request) -> str:
    """URL de retorno de 42 según el host con el que se entró (localhost, IP del PC...).
    Cada una debe estar dada de alta en la app de 42. PUBLIC_BASE_URL la fija a mano si se define."""
    base = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")
    if not base:
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = request.headers.get("host") or request.url.netloc
        base = f"{scheme}://{host}"
    return f"{base}/api/auth/42/callback"
'''
    anchor = re.search(r'FORTYTWO_REDIRECT_URI = os\.getenv\(.*?\n\)\n', text, re.S)
    if not anchor:
        raise SystemExit("auth.py: no encuentro FORTYTWO_REDIRECT_URI; pásame el fichero.")
    text = text[:anchor.end()] + helper + text[anchor.end():]
    notes.append("helper _redirect_uri añadido")

    n = text.count('"redirect_uri": FORTYTWO_REDIRECT_URI')
    text = text.replace('"redirect_uri": FORTYTWO_REDIRECT_URI', '"redirect_uri": _redirect_uri(request)')
    notes.append(f"{n} usos de redirect_uri")

    if "async def login_with_42():" not in text:
        raise SystemExit("auth.py: no encuentro login_with_42(); pásame el fichero.")
    text = text.replace("async def login_with_42():", "async def login_with_42(request: Request):")

    text, k = re.subn(r"window\.location\.replace\('http://localhost:8080/index\.html\?'", "window.location.replace('/index.html?'", text)
    notes.append(f"{k} redirección final relativa")
    if k == 0:
        raise SystemExit("auth.py: no encuentro la redirección final a index.html; pásame el fichero.")
    return text, notes


def process(path: Path, fn):
    old = path.read_text(encoding="utf-8")
    res = fn(old)
    new, notes = res if isinstance(res, tuple) else (res, [])
    if new != old:
        shutil.copy2(path, str(path) + ".bak")
        path.write_text(new, encoding="utf-8")
        print(f"✔ {path}" + (f"  ({', '.join(notes)})" if notes else ""))
        return True
    return False


changed = 0
for p in sorted((ROOT / "frontend").rglob("*")):
    if p.suffix in {".html", ".js", ".jsx"} and "node_modules" not in p.parts:
        changed += process(p, fix_frontend_text)

auth = ROOT / "backend" / "routers" / "auth.py"
if auth.exists():
    changed += process(auth, patch_auth)
else:
    print("⚠ No encuentro backend/routers/auth.py")

print(f"Listo: {changed} fichero(s) modificado(s).")
