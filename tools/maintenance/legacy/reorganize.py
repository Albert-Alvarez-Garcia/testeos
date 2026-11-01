#!/usr/bin/env python3
"""
reorganize.py · Ordena el proyecto Card Binder Pro (ejecutar desde ~/testeo).

    python3 reorganize.py --dry-run      # solo muestra lo que haría (recomendado primero)
    python3 reorganize.py                # fases A y B
    python3 reorganize.py --only a       # solo limpieza de raíz (sin tocar rutas del frontend)
    python3 reorganize.py --only b       # solo css/ y js/ dentro de frontend
    python3 reorganize.py --undo         # deshace todo lo hecho (mueve de vuelta y restaura copias)

FASE A  Limpieza: scripts de la raíz -> tools/, logs -> logs/, versiones antiguas y .bak -> _archive/,
        .gitignore y .dockerignore actualizados. No cambia ninguna ruta que use la web.
FASE B  frontend/: los .css van a css/, los .js a js/shared/ (comunes) y js/pages/ (de cada página).
        Los HTML mantienen su sitio (las URL no cambian). Se reescriben href/src, los url() de los
        CSS y las dos rutas internas de theme.js y user-menu.js.
Cada fichero editado se guarda antes en _archive/backups/. Todo queda anotado en _archive/reorganize_log.json.
Después hay que reconstruir:  docker compose up -d --build
"""
import argparse, json, re, shutil, sys
from pathlib import Path

ROOT = Path.cwd()
FRONT = ROOT / "frontend"
ARCH = ROOT / "_archive"
LOG = ARCH / "reorganize_log.json"
ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--only", choices=["a", "b"])
ap.add_argument("--undo", action="store_true")
args = ap.parse_args()
DRY = args.dry_run
ops = []
notes = []


def rel(p):
    return str(Path(p).relative_to(ROOT))


def save_log():
    if DRY or not ops:
        return
    ARCH.mkdir(exist_ok=True)
    old = json.loads(LOG.read_text()) if LOG.exists() else []
    LOG.write_text(json.dumps(old + ops, indent=1, ensure_ascii=False))


def move(src, dst):
    src, dst = Path(src), Path(dst)
    if not src.exists():
        return False
    if dst.exists():
        notes.append(f"! ya existe {rel(dst)}; no muevo {rel(src)}")
        return False
    print(f"  mover  {rel(src)}  ->  {rel(dst)}")
    if not DRY:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))
        ops.append({"t": "move", "from": rel(src), "to": rel(dst)})
    return True


def edit(path, new, why=""):
    path = Path(path)
    old = path.read_text(encoding="utf-8", errors="surrogateescape") if path.exists() else None
    if old == new:
        return False
    print(f"  editar {rel(path)}" + (f"  ({why})" if why else ""))
    if DRY:
        return True
    if old is None:
        ops.append({"t": "create", "path": rel(path)})
    else:
        bk = ARCH / "backups" / rel(path)
        if not bk.exists():
            bk.parent.mkdir(parents=True, exist_ok=True)
            bk.write_text(old, encoding="utf-8", errors="surrogateescape")
        ops.append({"t": "edit", "path": rel(path), "backup": rel(bk)})
    path.write_text(new, encoding="utf-8", errors="surrogateescape")
    return True


# ------------------------------------------------------------------ UNDO
if args.undo:
    if not LOG.exists():
        sys.exit("No hay nada que deshacer (no existe _archive/reorganize_log.json).")
    for o in reversed(json.loads(LOG.read_text())):
        if o["t"] == "move" and (ROOT / o["to"]).exists() and not (ROOT / o["from"]).exists():
            (ROOT / o["from"]).parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(ROOT / o["to"]), str(ROOT / o["from"]))
        elif o["t"] == "edit" and (ROOT / o["backup"]).exists():
            shutil.copy2(ROOT / o["backup"], ROOT / o["path"])
        elif o["t"] == "create" and (ROOT / o["path"]).exists():
            (ROOT / o["path"]).unlink()
    LOG.rename(ARCH / "reorganize_log.undone.json")
    sys.exit("Deshecho. Reconstruye con: docker compose up -d --build")

if not FRONT.is_dir():
    sys.exit("Ejecuta esto desde la carpeta del proyecto (la que contiene frontend/).")

OLD_FRONT = ["index_old.html", "indexold.html", "prefuncionaindex.html", "preindex.html", "preportal.css",
             "reportold.html", "visor-containers actual el que falla.html"]
moved_names = []  # nombres originales que han cambiado de sitio (para el informe final)

# ================================================================== FASE A
if args.only in (None, "a"):
    print("FASE A · limpieza")
    for n in ["add_theme.py", "css_audit.py", "css_audit.txt", "fix_localhost.py", "setup_https.py",
              "unify_css.py", "openwebs.sh"]:
        if move(ROOT / n, ROOT / "tools" / n):
            moved_names.append(n)
    for n in ["log1", "log3", "log42", "logs1", "logs2", "logs42", "logs.txt"]:
        move(ROOT / n, ROOT / "logs" / n)
    for n in ["mimakefile", "noesun.env (copy).txt", "noesun.env (another copy).txt", "tree"]:
        move(ROOT / n, ARCH / "raiz" / n)
    for n in OLD_FRONT:
        move(FRONT / n, ARCH / "frontend" / n)
    move(ROOT / "backend" / "requirements copy.txt", ARCH / "backend" / "requirements copy.txt")
    move(ROOT / "pong-client/src/NONEpong.jsx", ARCH / "pong-client" / "NONEpong.jsx")
    move(ROOT / "public/assets/Unconfirmed 866244.crdownload", ARCH / "public" / "Unconfirmed 866244.crdownload")
    # MAGIC.TTF duplicado: solo si nada lo referencia como public/MAGIC.TTF
    dup = ROOT / "public" / "MAGIC.TTF"
    if dup.exists():
        used = any(re.search(r"public/MAGIC\.TTF", f.read_text(errors="ignore"))
                   for f in FRONT.rglob("*") if f.suffix in {".html", ".css", ".js"} and f.is_file())
        if used:
            notes.append("! public/MAGIC.TTF está referenciado; lo dejo.")
        else:
            move(dup, ARCH / "public" / "MAGIC.TTF")
    # todas las copias .bak sueltas
    skip = {"_archive", "node_modules", ".git", "pgdata", "certs"}
    for b in sorted(ROOT.rglob("*.bak")):
        if not (set(b.relative_to(ROOT).parts) & skip):
            move(b, ARCH / "bak" / b.relative_to(ROOT))
    comp = FRONT / "components"
    if comp.is_dir() and not any(comp.iterdir()):
        print("  borrar carpeta vacía frontend/components")
        if not DRY:
            comp.rmdir()
    # .gitignore / .dockerignore
    gi = ROOT / ".gitignore"
    txt = gi.read_text() if gi.exists() else ""
    if "# >>> reorganize" not in txt:
        txt = txt.rstrip("\n") + "\n\n# >>> reorganize\n_archive/\nlogs/\ncerts/\n*.bak\n*.env\n.env.*\nnoesun.env*\n" \
              "*.crdownload\npong-client/dist/\n.DS_Store\n# <<< reorganize\n"
        edit(gi, txt, "secretos, logs y copias fuera de git")
    di = ROOT / ".dockerignore"
    txt = di.read_text() if di.exists() else ""
    if "# >>> reorganize" not in txt:
        txt = txt.rstrip("\n") + ("\n\n" if txt else "") + "# >>> reorganize\n.git\n_archive\nlogs\ntools\ncerts\n" \
              "**/node_modules\n**/*.bak\n**/*.crdownload\n*.md\nnoesun.env*\n# <<< reorganize\n"
        edit(di, txt, "la imagen ya no lleva .bak, logs ni copias de .env")

# ================================================================== FASE B
if args.only in (None, "b"):
    print("FASE B · frontend/css y frontend/js")
    SHARED = {"theme.js", "user-menu.js", "section-nav.js", "chat.js"}
    RENAME = {"gestor-contendor.js": "gestor-contenedor.js"}
    mapping = {}
    for f in sorted(FRONT.glob("*.css")):
        if f.name not in OLD_FRONT:
            mapping[f.name] = f"css/{f.name}"
    for f in sorted(FRONT.glob("*.js")):
        sub = "shared" if f.name in SHARED else "pages"
        mapping[f.name] = f"js/{sub}/{RENAME.get(f.name, f.name)}"

    # 1) mover (y reescribir url() en los css)
    url_re = re.compile(r"url\(\s*(['\"]?)([^)'\"]+?)\1\s*\)")

    def fix_url(m):
        p = m.group(2).strip()
        if re.match(r"(data:|https?:|//|/|#|\.\./)", p):
            return m.group(0)
        return f"url({m.group(1)}../{p[2:] if p.startswith('./') else p}{m.group(1)})"

    for name, new in mapping.items():
        src = FRONT / name
        if move(src, FRONT / new) and not DRY and new.startswith("css/"):
            dst = FRONT / new
            edit(dst, url_re.sub(fix_url, dst.read_text(encoding="utf-8")), "url() relativos -> ../")
    if DRY:
        print("  (en dry-run no se simulan los cambios de url() ni de href/src; se hacen al ejecutar)")
    moved_names += list(mapping)

    # 2) rutas dentro de los HTML
    if mapping:
        names = "|".join(re.escape(n) for n in sorted(mapping, key=len, reverse=True))
        ref = re.compile(r"(?P<a>\b(?:href|src)\s*=\s*)(?P<q>[\"'])(?P<p>\./|/)?(?P<n>" + names +
                         r")(?P<s>[?#][^\"']*)?(?P=q)")

        def fix_ref(m):
            return f"{m['a']}{m['q']}{m['p'] or ''}{mapping[m['n']]}{m['s'] or ''}{m['q']}"

        for h in sorted(FRONT.glob("*.html")):
            if h.name in OLD_FRONT:
                continue
            t = h.read_text(encoding="utf-8", errors="surrogateescape")
            if not DRY:
                edit(h, ref.sub(fix_ref, t), "href/src")
            elif ref.search(t):
                print(f"  editar {rel(h)}  (href/src)")

    # 3) las dos rutas internas
    if not DRY:
        th = FRONT / "js/shared/theme.js"
        if th.exists():
            t = th.read_text(encoding="utf-8")
            n = t.replace("new URL('theme-42.css', document.currentScript.src).href",
                          "new URL('css/theme-42.css', document.baseURI).href")
            if n == t and "css/theme-42.css" not in t:
                notes.append("! theme.js: no encontré la línea de theme-42.css; revísala a mano (debe apuntar a css/theme-42.css).")
            edit(th, n, "ruta de theme-42.css")
        um = FRONT / "js/shared/user-menu.js"
        if um.exists():
            t = um.read_text(encoding="utf-8")
            n = t.replace("link.href = BASE + 'portal.css';",
                          "link.href = new URL('css/portal.css', document.baseURI).href;")
            if n == t and "css/portal.css" not in t:
                notes.append("! user-menu.js: no encontré la línea de portal.css; revísala a mano (debe apuntar a css/portal.css).")
            edit(um, n, "ruta de portal.css")

# ================================================================== Informe
save_log()
print("\nBuscando referencias que se hayan quedado con la ruta antigua...")
cands = []
for f in [ROOT / "Makefile", ROOT / "docker-compose.yml", FRONT / "nginx.conf", FRONT / "dockerfile",
          FRONT / "Dockerfile"] + list((ROOT / "backend").rglob("*.py")) + \
         [x for x in FRONT.rglob("*") if x.suffix in {".html", ".js", ".css"} and "_archive" not in x.parts]:
    if f.is_file():
        cands.append(f)
if moved_names:
    pat = re.compile(r"(?<![\w/.\-])(" + "|".join(re.escape(n) for n in moved_names) + r")(?![\w\-])")
    hits = 0
    for f in cands:
        for i, line in enumerate(f.read_text(errors="ignore").splitlines(), 1):
            if pat.search(line) and not line.lstrip().startswith(("#", "//", "/*", "*")):
                hits += 1
                if hits <= 25:
                    print(f"  {rel(f)}:{i}: {line.strip()[:110]}")
    if hits == 0:
        print("  ninguna.")
    elif hits > 25:
        print(f"  ... y {hits - 25} más")
for n in notes:
    print(n)
print("""
Siguiente (si no era dry-run):
  docker compose up -d --build      y recarga con Ctrl+F5
  Prueba: login, index, perfil, hub-juegos, lobby, colección, contenedores y un usuario de 42.
  Si algo falla:  python3 reorganize.py --undo""")
