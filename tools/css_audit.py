#!/usr/bin/env python3
"""
css_audit.py · Informe de estilos de frontend/ para planificar la unificación del CSS. No modifica nada.

Uso (desde ~/testeo):   python3 css_audit.py            -> imprime el informe y lo guarda en css_audit.txt
"""
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

FRONT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("frontend")
SKIP = re.compile(r"old|^pre|actual|\.bak", re.I)
HEX = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
out = []


def p(*a):
    out.append(" ".join(str(x) for x in a))


def norm_rules(css: str):
    """Reglas CSS normalizadas (sin espacios) para detectar duplicados entre páginas."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    return {re.sub(r"\s+", "", m.group(0)) for m in re.finditer(r"[^{}]+\{[^{}]*\}", css)}


pages = [f for f in sorted(FRONT.glob("*.html")) if not SKIP.search(f.name)]
css_files = [f for f in sorted(FRONT.glob("*.css")) if not SKIP.search(f.name)]

p("=" * 78)
p("PÁGINAS")
p("=" * 78)
rules_by_page = defaultdict(set)
hex_total = Counter()
arbitrary = Counter()
for f in pages:
    t = f.read_text(encoding="utf-8", errors="replace")
    links = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)', t) + \
            re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']stylesheet', t)
    local = [l for l in links if not l.startswith("http")]
    fonts = sorted(set(re.findall(r"family=([A-Za-z+]+)", " ".join(links))))
    tw = "v4 (@tailwindcss/browser)" if "@tailwindcss/browser" in t else \
         "v3 (cdn.tailwindcss.com)" if "cdn.tailwindcss.com" in t else "no"
    styles = re.findall(r"<style[^>]*>(.*?)</style>", t, re.S)
    css_inline = "\n".join(styles)
    rules_by_page[f.name] = norm_rules(css_inline)
    inline_attr = len(re.findall(r'\sstyle="', t))
    hexes = HEX.findall(t)
    hex_total.update(h.lower() for h in hexes)
    arbitrary.update(m.lower() for m in re.findall(r"\[(#[0-9a-fA-F]{6})\]", t))
    body = re.search(r"<body([^>]*)>", t)
    body_cls = re.search(r'class="([^"]*)"', body.group(1)).group(1) if body and 'class="' in body.group(1) else ""
    body_bg = re.findall(r"body\s*\{[^}]*background[^}]*\}", css_inline)
    has_theme = "theme.js" in t
    p(f"\n■ {f.name}  ({len(t)//1024} KB)")
    p(f"   CSS local enlazado : {', '.join(local) or '—'}")
    p(f"   Tailwind           : {tw}   Fuentes Google: {', '.join(fonts) or '—'}   theme.js: {'sí' if has_theme else 'NO'}")
    p(f"   <style> embebido   : {len(styles)} bloque(s), {len(css_inline.splitlines())} líneas, {len(rules_by_page[f.name])} reglas")
    p(f"   style=\"...\" inline : {inline_attr}   Colores hex en el fichero: {len(hexes)} ({len(set(h.lower() for h in hexes))} distintos)")
    if body_bg:
        p(f"   body con fondo propio en <style>: {re.sub(chr(10)+' *', ' ', body_bg[0])[:110]}")
    p(f"   <body class=\"{body_cls[:90]}\">")

p("\n" + "=" * 78)
p("HOJAS CSS")
p("=" * 78)
for f in css_files:
    t = f.read_text(encoding="utf-8", errors="replace")
    sels = len(re.findall(r"\{", t))
    vars_ = re.findall(r"(--[a-z0-9-]+)\s*:", t)
    users = [pg.name for pg in pages if f.name in pg.read_text(encoding="utf-8", errors="replace")]
    p(f"\n■ {f.name}  ({len(t)//1024} KB, ~{sels} reglas, {len(set(vars_))} variables CSS)")
    p(f"   La usan: {', '.join(users) or 'NINGUNA página (¿sobra?)'}")
    p(f"   Colores hex: {len(set(h.lower() for h in HEX.findall(t)))} distintos ·  variables: {', '.join(sorted(set(vars_))[:10])}")
js = [f for f in sorted(FRONT.glob("*.js")) if not SKIP.search(f.name)]
js_colors = {f.name: len(set(h.lower() for h in HEX.findall(f.read_text(encoding='utf-8', errors='replace')))) for f in js}
js_colors = {k: v for k, v in js_colors.items() if v}
if js_colors:
    p("\n■ JS con colores hex escritos (estilos generados por script): " + ", ".join(f"{k}({v})" for k, v in js_colors.items()))

p("\n" + "=" * 78)
p("DUPLICADOS Y CONFLICTOS")
p("=" * 78)
seen = defaultdict(list)
for pg, rs in rules_by_page.items():
    for r in rs:
        seen[r].append(pg)
dups = {r: pgs for r, pgs in seen.items() if len(pgs) >= 2}
p(f"\nReglas CSS embebidas idénticas en 2+ páginas: {len(dups)}")
for r, pgs in sorted(dups.items(), key=lambda kv: -len(kv[1]))[:12]:
    p(f"   [{len(pgs)} páginas] {r[:90]}")
body_fonts = Counter()
for f in pages:
    t = f.read_text(encoding="utf-8", errors="replace")
    for m in re.finditer(r"font-family\s*:\s*([^;}{]+)", t):
        body_fonts[m.group(1).strip()[:50]] += 1
p("\nfont-family declaradas (y cuántas veces): " + "; ".join(f"{k} ×{v}" for k, v in body_fonts.most_common(8)))

p("\n" + "=" * 78)
p("PALETA REAL (hex en HTML)")
p("=" * 78)
p("Todos   : " + ", ".join(f"{h}×{n}" for h, n in hex_total.most_common(14)))
p("En clases Tailwind [#xxxxxx] (candidatos a variable): " + ", ".join(f"{h}×{n}" for h, n in arbitrary.most_common(12)))
no_portal = [f.name for f in pages if "portal.css" not in f.read_text(encoding="utf-8", errors="replace")]
p(f"\nPáginas SIN portal.css: {', '.join(no_portal) or 'ninguna'}")
p(f"Páginas SIN theme.js : {', '.join(f.name for f in pages if 'theme.js' not in f.read_text(encoding='utf-8', errors='replace')) or 'ninguna'}")

text = "\n".join(out)
print(text)
Path("css_audit.txt").write_text(text, encoding="utf-8")
print("\n(Informe guardado en css_audit.txt)")
