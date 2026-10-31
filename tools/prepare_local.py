#!/usr/bin/env python3
"""Prepare ignored local settings and a localhost/LAN self-signed TLS certificate."""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
CERT_DIR = ROOT / "certs"
CERT_FILE = CERT_DIR / "cert.pem"
KEY_FILE = CERT_DIR / "key.pem"
REQUIRED_ENV = (
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "DB_PASSWORD",
    "JWT_SECRET",
)


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
    return values


def prepare_env() -> None:
    if not ENV_FILE.exists():
        raise RuntimeError(
            "Falta .env. Copia el archivo local de configuración (con OAuth de 42) antes de ejecutar make up. "
            "El certificado TLS sí se genera automáticamente."
        )

    values = read_env(ENV_FILE)
    missing = [key for key in (*REQUIRED_ENV, "FORTYTWO_CLIENT_ID", "FORTYTWO_CLIENT_SECRET") if not values.get(key)]
    if missing:
        raise RuntimeError("Faltan valores obligatorios en .env: " + ", ".join(missing))
    if values["POSTGRES_PASSWORD"] != values["DB_PASSWORD"]:
        raise RuntimeError("POSTGRES_PASSWORD y DB_PASSWORD deben tener el mismo valor.")
    if len(values["JWT_SECRET"]) < 32:
        raise RuntimeError("JWT_SECRET debe tener al menos 32 caracteres; genera uno con: openssl rand -hex 32")

    try:
        ENV_FILE.chmod(0o600)
    except OSError as exc:
        raise RuntimeError(f"No pude restringir los permisos de .env: {exc}") from exc

    if values.get("ALLOW_LEGACY_HEADER", "1") == "1":
        print("⚠ ALLOW_LEGACY_HEADER=1: configura 0 en .env para desactivar la autenticación heredada por cabecera.")
    if not values.get("FORTYTWO_CLIENT_ID") or not values.get("FORTYTWO_CLIENT_SECRET"):
        print("ℹ OAuth de 42 no está configurado; el registro e inicio de sesión local seguirán disponibles.")
    if not values.get("GIPHY_API_KEY"):
        print("ℹ Giphy no está configurado; la búsqueda de GIFs no estará disponible.")


def detect_lan_ipv4() -> str | None:
    # UDP connect selects the host route but sends no packet.
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route_socket:
            route_socket.connect(("1.1.1.1", 53))
            address = route_socket.getsockname()[0]
        if address and not address.startswith("127.") and address != "0.0.0.0":
            return address
    except OSError:
        pass
    return None


def run_openssl(args: list[str]) -> str:
    result = subprocess.run(["openssl", *args], check=True, capture_output=True, text=True)
    return result.stdout


def certificate_sans(cert: Path) -> str:
    return run_openssl(["x509", "-in", str(cert), "-noout", "-ext", "subjectAltName"])


def cert_matches_key(cert: Path, key: Path) -> bool:
    try:
        cert_public = run_openssl(["x509", "-in", str(cert), "-pubkey", "-noout"]).strip()
        key_public = run_openssl(["pkey", "-in", str(key), "-pubout"]).strip()
        run_openssl(["x509", "-in", str(cert), "-checkend", "86400", "-noout"])
        return cert_public == key_public
    except (subprocess.CalledProcessError, OSError):
        return False


def prepare_certificate() -> None:
    if not shutil.which("openssl"):
        raise RuntimeError("Falta OpenSSL en el host. Instálalo antes de ejecutar make up.")

    lan_ip = detect_lan_ipv4()
    required_sans = ["DNS:localhost", "IP Address:127.0.0.1"]
    if lan_ip:
        required_sans.append(f"IP Address:{lan_ip}")

    if CERT_FILE.is_file() and KEY_FILE.is_file() and cert_matches_key(CERT_FILE, KEY_FILE):
        try:
            current_sans = certificate_sans(CERT_FILE)
            if all(san in current_sans for san in required_sans):
                print("✔ Certificado TLS existente válido para localhost" + (f" y {lan_ip}" if lan_ip else "") + ".")
                return
        except (subprocess.CalledProcessError, OSError):
            pass

    CERT_DIR.mkdir(parents=True, exist_ok=True)
    san_values = ["DNS:localhost", "IP:127.0.0.1"]
    if lan_ip:
        san_values.append(f"IP:{lan_ip}")
    san_extension = ",".join(san_values)

    try:
        with tempfile.TemporaryDirectory(prefix="tls-", dir=CERT_DIR) as temp_dir:
            temp_path = Path(temp_dir)
            temp_cert = temp_path / "cert.pem"
            temp_key = temp_path / "key.pem"
            subprocess.run(
                [
                    "openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048",
                    "-days", "365", "-keyout", str(temp_key), "-out", str(temp_cert),
                    "-subj", "/CN=localhost", "-addext", f"subjectAltName={san_extension}",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            temp_key.chmod(0o600)
            temp_cert.chmod(0o644)
            os.replace(temp_key, KEY_FILE)
            os.replace(temp_cert, CERT_FILE)
    except (subprocess.CalledProcessError, OSError) as exc:
        detail = getattr(exc, "stderr", None) or str(exc)
        raise RuntimeError(f"No pude crear el certificado TLS: {detail}") from exc

    location = f"localhost y {lan_ip}" if lan_ip else "localhost (no detecté una IP LAN)"
    print(f"✔ Certificado TLS local creado para {location}.")
    print("ℹ Es autofirmado: otros dispositivos pueden pedir aceptar o confiar en el certificado.")


def main() -> int:
    try:
        prepare_env()
        prepare_certificate()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as exc:
        print(f"✘ Preparación local incompleta: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
