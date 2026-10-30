"""Presencia en línea: un usuario cuenta como "en línea" si ha hecho alguna petición válida hace poco.
Las páginas consultan /api/social/notifications cada 10 s, así que una pestaña abierta mantiene al usuario en línea.
(En memoria: se reinicia con el backend, lo cual es correcto: tras reiniciar nadie está conectado.)"""
import time

ONLINE_SECONDS = 35
_seen = {}


def touch(username):
    if username:
        _seen[str(username).lower()] = time.monotonic()


def is_online(username) -> bool:
    t = _seen.get(str(username).lower())
    return t is not None and (time.monotonic() - t) < ONLINE_SECONDS
