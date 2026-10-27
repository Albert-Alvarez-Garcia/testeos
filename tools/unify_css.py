#!/usr/bin/env python3
"""
unify_css.py · Unifica la paleta de la web en variables CSS (fases 1 y 2).

Uso (desde ~/testeo; haz copia de seguridad antes, aunque cada fichero modificado también deja .bak):
    python3 unify_css.py

Qué hace
  FASE 1  game.html, lobby.html y gestor-contenedor.html enlazan portal.css y dejan de repetir su propio
          body/.magic-title (pasan a la clase font-ui de portal.css).
  FASE 2  Los colores marrón/dorado escritos a mano pasan a variables:
            - clases Tailwind:  bg-[#140e09]/90  ->  bg-[rgb(var(--c-panel)/0.9)]
                                text-amber-200   ->  text-[rgb(var(--c-amber-200))]
            - CSS (portal.css, hub.css, coleccion.css, containers.css, visor-*.css), bloques <style> y atributos style=""
        La paleta se define UNA vez en portal.css (bloque marcado) y theme-42.css queda reducido a cambiar
        esas variables (antes: 1500 reglas).
  Se dejan fuera: visor.html, visor-crud.html, themes.css, visor.css (herramienta aparte) y el Pong.
Se puede ejecutar varias veces sin estropear nada.
"""
import re
import shutil
from collections import Counter
from pathlib import Path

FRONT = Path("frontend")
SKIP_NAME = re.compile(r"old|^pre|actual|\.bak|^visor\.html$|^visor-crud|^themes\.css$|^visor\.css$|^theme\.js$|^theme-42\.css$", re.I)

# nombre -> (hex original, hex del tema 42)
TOKENS = {
    "bg-app":      ("#080503", "#050b12"),
    "ink":         ("#0b0705", "#060e16"),
    "ink-2":       ("#0d0906", "#08121b"),
    "ink-3":       ("#0f0a06", "#0a1722"),
    "panel":       ("#140e09", "#0b1824"),
    "panel-2":     ("#1a120b", "#10202f"),
    "raised":      ("#2c1d0f", "#15293c"),
    "raised-2":    ("#1e140d", "#122234"),
    "raised-3":    ("#2a1d13", "#1a2f45"),
    "gold":        ("#b39258", "#4f9fc4"),
    "gold-dark":   ("#8c6d36", "#3a7ca0"),
    "gold-darker": ("#5a4528", "#2f6a8a"),
    "accent":      ("#d4af37", "#5bc0de"),
    "accent-hi":   ("#ffd700", "#8fdcf0"),
    "bronze":      ("#5c4323", "#1f4d6e"),
    "bronze-deep": ("#1c130a", "#0a1a28"),
    "cream":       ("#fef3c7", "#e0f2fe"),
    "cream-2":     ("#f3efdc", "#e6f1fa"),
}
AMBER = {  # Tailwind amber -> tonos del tema 42
    "100": ("#fef3c7", "#e0f2fe"), "200": ("#fde68a", "#bae6fd"), "300": ("#fcd34d", "#7dd3fc"),
    "400": ("#fbbf24", "#38bdf8"), "500": ("#f59e0b", "#0ea5e9"), "600": ("#d97706", "#0284c7"),
    "700": ("#b45309", "#0369a1"), "800": ("#92400e", "#075985"), "900": ("#78350f", "#0c2a40"),
}
HEX2TOKEN = {v[0].lower(): k for k, v in TOKENS.items()}
RGB2TOKEN = {tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)): k for h, k in HEX2TOKEN.items()}
UTILS = "bg|text|border|ring|from|via|to|divide|placeholder|decoration|fill|stroke|outline|accent|caret"

HEX_CLASS = re.compile(rf"(?<![\w-])({UTILS})-\[(#[0-9a-fA-F]{{6}})\](?:/(\d{{1,3}}))?(?![\w-])")
AMBER_CLASS = re.compile(rf"(?<![\w-])({UTILS})-amber-(100|200|300|400|500|600|700|800|900)(?:/(\d{{1,3}}))?(?![\w-])")
HEX_CSS = re.compile(r"#[0-9a-fA-F]{6}\b")
RGBA_CSS = re.compile(r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)")
STYLE_BLOCK = re.compile(r"(<style[^>]*>)(.*?)(</style>)", re.S)
STYLE_ATTR = re.compile(r'(\sstyle=")([^"]*)(")')

counts = Counter()


def alpha(a):
    return f"/{int(a) / 100:g}" if a else ""


def classes(text):
    def hx(m):
        tok = HEX2TOKEN.get(m.group(2).lower())
        if not tok:
            return m.group(0)
        counts["clases"] += 1
        return f"{m.group(1)}-[rgb(var(--c-{tok}){alpha(m.group(3))})]"

    def am(m):
        counts["clases amber"] += 1
        return f"{m.group(1)}-[rgb(var(--c-amber-{m.group(2)}){alpha(m.group(3))})]"

    return AMBER_CLASS.sub(am, HEX_CLASS.sub(hx, text))


def css_colors(css):
    def hx(m):
        tok = HEX2TOKEN.get(m.group(0).lower())
        if not tok:
            return m.group(0)
        counts["colores css"] += 1
        return f"rgb(var(--c-{tok}))"

    def rg(m):
        tok = RGB2TOKEN.get((int(m.group(1)), int(m.group(2)), int(m.group(3))))
        if not tok:
            return m.group(0)
        counts["colores css"] += 1
        a = m.group(4)
        return f"rgb(var(--c-{tok}) / {a})" if a is not None else f"rgb(var(--c-{tok}))"

    return RGBA_CSS.sub(rg, HEX_CSS.sub(hx, css))


def html_like(text):
    text = classes(text)
    text = STYLE_BLOCK.sub(lambda m: m.group(1) + css_colors(m.group(2)) + m.group(3), text)
    return STYLE_ATTR.sub(lambda m: m.group(1) + css_colors(m.group(2)) + m.group(3), text)


def save(path, old, new, note=""):
    if old == new:
        return
    if not Path(str(path) + ".bak").exists():
        shutil.copy2(path, str(path) + ".bak")
    path.write_text(new, encoding="utf-8")
    print(f"✔ {path}" + (f"  ({note})" if note else ""))


# ---------------------------------------------------------------- FASE 1
BODY_RULE = re.compile(r"\s*body\s*\{[^{}]*font-family:\s*'Inter'[^{}]*\}", re.S)
MAGIC_RULE = re.compile(r"\s*\.magic-title\s*\{[^{}]*\}")
PORTAL_LINK = '<link rel="stylesheet" href="portal.css">'


def phase1(path):
    old = path.read_text(encoding="utf-8")
    t = old
    if "portal.css" not in t:
        t = t.replace("</head>", f"    {PORTAL_LINK}\n</head>", 1) if "<script src=\"theme.js\">" not in t else \
            t.replace('<script src="theme.js">', f'{PORTAL_LINK}\n    <script src="theme.js">', 1)

    def clean_style(m):
        css = BODY_RULE.sub("", m.group(2))
        css = MAGIC_RULE.sub("", css)
        return "" if not css.strip() else m.group(1) + css + m.group(3)

    if BODY_RULE.search(t):
        t = STYLE_BLOCK.sub(clean_style, t)
        t = re.sub(r"<body class=\"", '<body class="font-ui ', t, count=1) if "font-ui" not in t else t
    save(path, old, t, "enlaza portal.css, usa font-ui")


for name in ("game.html", "lobby.html", "gestor-contenedor.html"):
    p = FRONT / name
    if p.exists():
        phase1(p)

# ---------------------------------------------------------------- FASE 2
for p in sorted(FRONT.iterdir()):
    if SKIP_NAME.search(p.name) or p.suffix not in {".html", ".js", ".css"}:
        continue
    old = p.read_text(encoding="utf-8", errors="replace")
    before = sum(counts.values())
    new = css_colors(old) if p.suffix == ".css" else html_like(old)
    n = sum(counts.values()) - before
    if p.name == "portal.css":
        pass
    save(p, old, new, f"{n} colores → variables")

# ---- bloque de tokens en portal.css (se genera una sola vez) -------------------------------------------------
MARK_A, MARK_B = "/* >>> PALETA (generado por unify_css.py) >>> */", "/* <<< PALETA <<< */"


def channels(h):
    return " ".join(str(int(h[i:i + 2], 16)) for i in (1, 3, 5))


def token_block(theme):
    idx = 1 if theme else 0
    lines = [f"    --c-{k}: {channels(v[idx])};" for k, v in TOKENS.items()]
    lines += [f"    --c-amber-{k}: {channels(v[idx])};" for k, v in AMBER.items()]
    return "\n".join(lines)


portal = FRONT / "portal.css"
if portal.exists():
    old = portal.read_text(encoding="utf-8")
    block = f"""{MARK_A}
/* Cada color es un trío R G B para poder usar rgb(var(--c-x) / transparencia). El tema 42 solo cambia estos valores. */
:root {{
{token_block(False)}
}}
.font-ui {{ font-family: 'Inter', sans-serif; color: rgb(var(--c-cream)); }}
.magic-title {{ font-family: 'Cinzel', serif; }}
{MARK_B}
"""
    if MARK_A in old:
        new = re.sub(re.escape(MARK_A) + r".*?" + re.escape(MARK_B) + r"\n?", block, old, flags=re.S)
    else:
        new = block + "\n" + old
    save(portal, old, new, "paleta, font-ui y .magic-title")

# ---- theme-42.css reducido a variables ----------------------------------------------------------------------
theme = FRONT / "theme-42.css"
theme_css = f"""/* theme-42.css · Tema azulado de 42. Solo cambia las variables de paleta de portal.css (lo carga theme.js). */
html.theme-42 {{
{token_block(True)}
    --bg-app: #050b12;
    --accent-glow: rgba(91, 192, 222, 0.4);
}}
html.theme-42 body {{
    background-image: url('public/assets/fondo_42.jpeg') !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-attachment: fixed !important;
}}
"""
old = theme.read_text(encoding="utf-8") if theme.exists() else ""
if old != theme_css:
    if theme.exists() and not Path(str(theme) + ".bak").exists():
        shutil.copy2(theme, str(theme) + ".bak")
    theme.write_text(theme_css, encoding="utf-8")
    print(f"✔ {theme}  (de {len(old)//1024} KB a {len(theme_css)//1024 or 1} KB)")

# ---------------------------------------------------------------- Informe
print(f"\nConvertidos: {dict(counts)}")
left = Counter()
where = {}
for p in sorted(FRONT.iterdir()):
    if SKIP_NAME.search(p.name) or p.suffix not in {".html", ".js", ".css"}:
        continue
    t = p.read_text(encoding="utf-8", errors="replace")
    t = re.sub(re.escape(MARK_A) + r".*?" + re.escape(MARK_B), "", t, flags=re.S)
    hexes = [h.lower() for h in HEX_CSS.findall(t) if h.lower() not in ("#9ca3af", "#f3f4f6", "#ffffff", "#000000")]
    if hexes:
        where[p.name] = Counter(hexes).most_common(4)
if where:
    print("\nColores hex que siguen escritos a mano (fuera de la paleta o en JS) — para la siguiente pasada:")
    for k, v in where.items():
        print(f"  {k}: " + ", ".join(f"{h}×{n}" for h, n in v))
print("""
Siguiente:  recarga con Ctrl+F5 (o docker compose up -d --build si el front va dentro de la imagen).
Revisa: index, login, perfil, juegos/lobby, colección, contenedores y entra también con un usuario de 42.
Si algo se ve mal, restaura con los .bak (cada fichero modificado tiene el suyo).""")
