#!/usr/bin/env python3
"""Genera frontend/readme.html a partir de README.md.
Uso (desde la raíz del proyecto):  python3 build_readme.py README.md frontend/readme.html
La página es pública para cualquier usuario con sesión, así que se quitan las secciones
de puntos débiles, preguntas y reparto (desde "## 10." hasta el final)."""
import re, sys
import markdown

src, dst = sys.argv[1], sys.argv[2]
md = open(src, encoding="utf-8").read()

# Fuera lo interno: puntos débiles (10), preguntas (11) y reparto (12), y la nota de transición de la sección 6
md = re.sub(r"\n## 10\..*\Z", "\n", md, flags=re.S)
md = re.sub(r"^- \*\*Estado de transición\*\*.*\n", "", md, flags=re.M)

body = markdown.markdown(md, extensions=["tables", "fenced_code", "sane_lists"])

html = f"""<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Card Binder - Sobre el proyecto</title>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="css/portal.css">
    <link rel="stylesheet" href="css/readme.css">
    <script src="js/shared/theme.js"></script>
</head>
<body>
    <div class="readme-page">
        <div class="readme-top">
            <a href="index.html" class="readme-back">← Volver al portal</a>
            <img src="public/assets/logomagic.png" alt="Card Binder" class="readme-logo">
        </div>
        <article class="readme-card">
{body}
        </article>
    </div>
    <script src="js/shared/auth.js"></script>
    <script src="js/pages/readme.js"></script>
</body>
</html>
"""
open(dst, "w", encoding="utf-8").write(html)
print("OK ->", dst)
