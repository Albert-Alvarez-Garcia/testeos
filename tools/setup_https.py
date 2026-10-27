#!/usr/bin/env python3
"""
setup_https.py · Activa HTTPS para localhost (https://localhost:8443). El acceso por IP sigue en http://IP:8080.

Uso, desde la carpeta del proyecto (~/testeo):
    python3 setup_https.py

Qué hace (copia .bak de lo que modifica; se puede repetir sin problema):
  1. Crea certs/cert.pem y certs/key.pem (autofirmado, válido para localhost y 127.0.0.1) con openssl.
  2. Reescribe nginx.conf: añade el servidor HTTPS (puerto 443 interno) y manda localhost:8080 -> https://localhost:8443.
  3. docker-compose.yml: publica 8443:443 y monta ./certs en el contenedor web.
  4. frontend/: los WebSocket escritos como ws://${...} pasan a ws:// o wss:// según el protocolo de la página.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(".").resolve()
HTTPS_PORT = 8443
extra_ips = sys.argv[1:]  # opcional: IPs adicionales para el certificado


def backup_write(path: Path, text: str):
    if path.exists() and not Path(str(path) + ".bak").exists():
        shutil.copy2(path, str(path) + ".bak")
    path.write_text(text, encoding="utf-8")


# 1 ---- certificado ---------------------------------------------------------
certs = ROOT / "certs"
cert, key = certs / "cert.pem", certs / "key.pem"
if cert.exists() and key.exists():
    print("• certs/ ya existe, se reutiliza")
else:
    certs.mkdir(exist_ok=True)
    san = "DNS:localhost,IP:127.0.0.1" + "".join(f",IP:{ip}" for ip in extra_ips)
    try:
        subprocess.run(
            ["openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "365",
             "-keyout", str(key), "-out", str(cert), "-subj", "/CN=localhost", "-addext", f"subjectAltName={san}"],
            check=True, capture_output=True, text=True,
        )
    except FileNotFoundError:
        sys.exit("✘ No tengo openssl instalado: sudo apt install openssl")
    except subprocess.CalledProcessError as e:
        sys.exit("✘ openssl falló:\n" + e.stderr)
    key.chmod(0o644)  # el usuario de nginx dentro del contenedor debe poder leerla
    print("✔ certs/cert.pem y certs/key.pem creados")

# 2 ---- nginx.conf ----------------------------------------------------------
LOCATIONS = """
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Configuración limpia para evitar bucles en la SPA de React
    location /pong {
        alias /usr/share/nginx/html/pong/;
        try_files $uri $uri/ /pong/index.html;
    }

    location /api/ {
        proxy_pass http://backend:8000;
        # $http_host conserva el puerto; con $host se perdía y el login con 42 apuntaba a un sitio incorrecto
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSockets (chat, salas, Pong) a través de nginx
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
"""

NGINX = f"""# WebSocket: si el cliente pide "Upgrade", se reenvía; si no, la conexión se cierra normal
map $http_upgrade $connection_upgrade {{
    default upgrade;
    ''      close;
}}

# HTTP (8080): desde la IP del PC se sirve tal cual; desde localhost se redirige a HTTPS
server {{
    listen 80;
    server_name _;

    if ($host = localhost) {{
        return 301 https://localhost:{HTTPS_PORT}$request_uri;
    }}
{LOCATIONS}}}

# HTTPS ({HTTPS_PORT} fuera del contenedor)
server {{
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/nginx/certs/cert.pem;
    ssl_certificate_key /etc/nginx/certs/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
{LOCATIONS}}}
"""

found = [p for p in ROOT.rglob("nginx.conf") if "node_modules" not in p.parts]
if len(found) != 1:
    sys.exit(f"✘ Esperaba un único nginx.conf y hay {len(found)}: {[str(p) for p in found]}. Dime cuál se usa.")
backup_write(found[0], NGINX)
print(f"✔ {found[0].relative_to(ROOT)} actualizado")

# 3 ---- docker-compose.yml --------------------------------------------------
compose = ROOT / "docker-compose.yml"
text = compose.read_text(encoding="utf-8")
if f'"{HTTPS_PORT}:443"' in text:
    print("• docker-compose.yml ya tiene el puerto HTTPS")
else:
    m = re.search(r'(container_name: card_binder_web\n(?:.*\n)*?)(\s+)ports:\n(\s+)- "8080:80"\n', text)
    if not m:
        sys.exit('✘ No encuentro el servicio web con ports "8080:80" en docker-compose.yml. Pásamelo.')
    indent_key, indent_item = m.group(2), m.group(3)
    insert = (f'{indent_item}- "{HTTPS_PORT}:443"\n'
              f'{indent_key.lstrip(chr(10))}volumes:\n'
              f'{indent_item}- ./certs:/etc/nginx/certs:ro\n')
    # si el servicio ya tuviera 'volumes:' se avisaría; aquí no lo tiene en la versión conocida
    block_end = m.end()
    rest = text[block_end:]
    svc_rest = rest.split("\nvolumes:")[0]
    if "volumes:" in svc_rest.split("\n\n")[0]:
        sys.exit("✘ El servicio web ya tiene 'volumes:'; añade a mano:  - ./certs:/etc/nginx/certs:ro  y  - \"8443:443\"")
    backup_write(compose, text[:block_end] + insert + text[block_end:])
    print("✔ docker-compose.yml actualizado")

# 4 ---- WebSockets del front ------------------------------------------------
PROTO = "${location.protocol === 'https:' ? 'wss' : 'ws'}://"
changed, leftovers = 0, []
for p in sorted((ROOT / "frontend").rglob("*")):
    if p.suffix not in {".html", ".js", ".jsx"} or "node_modules" in p.parts:
        continue
    old = p.read_text(encoding="utf-8")
    new = old.replace("`ws://${", "`" + PROTO + "${")
    if new != old:
        backup_write(p, new)
        changed += 1
        print(f"✔ {p.relative_to(ROOT)}")
    for i, line in enumerate(new.splitlines(), 1):
        if re.search(r"""["'`]wss?://""", line) and "location.protocol" not in line and p.suffix != ".bak":
            leftovers.append(f"{p.relative_to(ROOT)}:{i}: {line.strip()[:110]}")
print(f"  ({changed} fichero(s) del front modificados)")
if leftovers:
    print("⚠ Quedan ws:// escritos a mano (bajo HTTPS se bloquean). Revísalos o pásamelos:")
    print("\n".join("   " + l for l in leftovers))

print(f"""
Siguiente:
  docker compose up -d --build
  Abre https://localhost:{HTTPS_PORT} (el navegador avisa del certificado: Avanzado > Continuar).
  En la app de 42 añade esta URL de retorno (una por línea, junto a las que ya tienes):
     https://localhost:{HTTPS_PORT}/api/auth/42/callback""")
