#!/usr/bin/env python3
"""Read-only smoke checks for the locally running Card Binder Compose stack."""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit, urlunsplit


TIMEOUT = 8
failures = 0


def report(name: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        failures += 1


def https_get(base_url: str, path: str) -> tuple[int, bytes]:
    context = ssl._create_unverified_context()  # local self-signed cert
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=context))
    request = urllib.request.Request(base_url.rstrip("/") + path, headers={"User-Agent": "CardBinderSmokeTest/1.0"})
    with opener.open(request, timeout=TIMEOUT) as response:
        return response.status, response.read()


def check_http_redirect(base_url: str) -> None:
    parts = urlsplit(base_url)
    host = parts.hostname or "localhost"
    if ":" in host:
        host = f"[{host}]"
    http_url = urlunsplit(("http", f"{host}:8080", "/", "", ""))
    opener = urllib.request.build_opener(urllib.request.HTTPHandler(), _NoRedirect())
    try:
        opener.open(urllib.request.Request(http_url), timeout=TIMEOUT)
        report("HTTP redirige a HTTPS", False, "el servidor respondió sin redirección")
    except urllib.error.HTTPError as response:
        location = response.headers.get("Location", "")
        target = urlsplit(location)
        ok = response.code == 301 and target.scheme == "https" and target.port == 8443
        report("HTTP redirige a HTTPS", ok, location or f"HTTP {response.code}")
    except Exception as exc:
        report("HTTP redirige a HTTPS", False, str(exc))


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check_https_and_api(base_url: str) -> None:
    try:
        status, _ = https_get(base_url, "/")
        report("Página principal por HTTPS", status == 200, f"HTTP {status}")
    except Exception as exc:
        report("Página principal por HTTPS", False, str(exc))

    try:
        # Nginx only proxies /api/*; probe a known protected API route without
        # credentials and expect FastAPI's 401 instead of Nginx's SPA fallback.
        try:
            status, body = https_get(base_url, "/api/containers/")
        except urllib.error.HTTPError as response:
            status, body = response.code, response.read()
        payload = json.loads(body)
        ok = status == 401 and "detail" in payload
        report("API FastAPI responde", ok, f"HTTP {status}; ruta protegida alcanzada" if ok else f"HTTP {status}")
    except Exception as exc:
        report("API FastAPI responde", False, str(exc))


def check_backend_database() -> None:
    code = (
        "from backend.database import get_db_connection; "
        "conn = get_db_connection(); cur = conn.cursor(); "
        "cur.execute('SELECT count(*) AS n FROM cards'); "
        "count = int(cur.fetchone()['n']); cur.close(); conn.close(); print(count)"
    )
    try:
        result = subprocess.run(
            ["docker", "compose", "exec", "-T", "backend", "python", "-c", code],
            check=True,
            capture_output=True,
            text=True,
            timeout=TIMEOUT + 5,
        )
        count = int(result.stdout.strip().splitlines()[-1])
        report("Backend conecta con PostgreSQL", True)
        if count == 0:
            print("WARN  Catálogo vacío; ejecuta make seed para descargar e importar las cartas.")
        else:
            print(f"PASS  Catálogo de cartas cargado — {count:,} cartas")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError, OSError) as exc:
        detail = exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) and exc.stderr else str(exc)
        report("Backend conecta con PostgreSQL", False, detail)


def check_api_not_published() -> None:
    try:
        result = subprocess.run(
            ["docker", "compose", "port", "backend", "8000"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT,
        )
        published = result.stdout.strip()
        # Compose can report :0 for an exposed-but-unpublished port.
        host_port = published.rsplit(":", 1)[-1] if published else ""
        is_unpublished = result.returncode != 0 or not published or host_port == "0"
        report("API no publicada directamente en el host", is_unpublished, "solo accesible a través de Nginx" if is_unpublished else published)
    except (subprocess.TimeoutExpired, OSError) as exc:
        report("API no publicada directamente en el host", False, str(exc))


def main() -> int:
    base_url = (sys.argv[1] if len(sys.argv) > 1 else os.getenv("BASE_URL", "https://localhost:8443")).rstrip("/")
    if urlsplit(base_url).scheme != "https":
        print("La URL base debe empezar por https:// (por ejemplo, https://localhost:8443).", file=sys.stderr)
        return 2

    print(f"Smoke test: {base_url}")
    check_http_redirect(base_url)
    check_https_and_api(base_url)
    check_backend_database()
    check_api_not_published()

    if failures:
        print(f"\n{failures} comprobación(es) fallaron.")
        return 1
    print("\nTodas las comprobaciones críticas pasaron.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
