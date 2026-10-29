"""Exportación e importación de la colección (JSON / CSV) con validación fila a fila y vista previa."""
import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backend.database import get_db_connection
from backend.routers.containers import get_current_user

router = APIRouter(prefix="/api/data", tags=["Data"])

IMPORT_COLUMNS = ["container", "scryfall_printing_id", "quantity", "condition", "language", "is_foil", "notes"]
EXPORT_COLUMNS = ["container", "name", "set_code", "collector_number", "scryfall_printing_id",
                  "quantity", "condition", "language", "is_foil", "notes"]
MAX_ROWS = 2000
TRUE_VALUES = {"1", "true", "yes", "y", "si", "sí", "s"}
FALSE_VALUES = {"0", "false", "no", "n", ""}
PID_RE = re.compile(r"^[A-Za-z0-9-]{1,64}$")
LANG_RE = re.compile(r"^[A-Za-z-]{2,10}$")


def _uid(user):
    return user.get("id") if isinstance(user, dict) else user.id


def _safe_cell(v):
    """Evita inyección de fórmulas al abrir el CSV en una hoja de cálculo."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def _unsafe_cell(s):
    return s[1:] if len(s) > 1 and s[0] == "'" and s[1] in "=+-@" else s


# ----------------------------- Exportar -----------------------------
def _export_rows(user_id):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT co.name AS container, c.name, p.set_code, p.collector_number,
                   p.scryfall_printing_id, cc.condition, cc.language, cc.is_foil, cc.notes
            FROM card_copies cc
            JOIN containers co ON co.id = cc.container_id
            JOIN printings p ON p.id = cc.printing_id
            JOIN cards c ON c.id = p.card_id
            WHERE co.user_id = %s
            ORDER BY co.name, c.name, p.set_code, p.collector_number""", (user_id,))
        rows = [dict(r, quantity=1) for r in cur.fetchall()]
        return rows
    finally:
        conn.close()


def _to_csv(rows, columns):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    w.writerow(columns)
    for r in rows:
        w.writerow([_safe_cell(r.get(c, "")) if r.get(c) is not None else "" for c in columns])
    return "﻿" + buf.getvalue()


@router.get("/export")
def export_collection(format: Literal["json", "csv"] = Query("json"), current_user: dict = Depends(get_current_user)):
    rows = _export_rows(_uid(current_user))
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if format == "csv":
        return Response(_to_csv(rows, EXPORT_COLUMNS), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="coleccion-{stamp}.csv"'})
    payload = {"format": "cardbinder-collection", "version": 1,
               "exported_at": datetime.now(timezone.utc).isoformat(), "copies": rows}
    return Response(json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="coleccion-{stamp}.json"'})


@router.get("/template")
def import_template(current_user: dict = Depends(get_current_user)):
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM containers WHERE user_id = %s ORDER BY created_at LIMIT 1", (_uid(current_user),))
        c = cur.fetchone()
        cur.execute("SELECT scryfall_printing_id FROM printings LIMIT 1")
        p = cur.fetchone()
    finally:
        conn.close()
    example = {"container": c["name"] if c else "Mi contenedor",
               "scryfall_printing_id": p["scryfall_printing_id"] if p else "",
               "quantity": 1, "condition": "Near Mint", "language": "en", "is_foil": "no", "notes": "Ejemplo: borra esta fila"}
    return Response(_to_csv([example], IMPORT_COLUMNS), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="plantilla-importacion.csv"'})


# ----------------------------- Importar -----------------------------
class ImportRequest(BaseModel):
    format: Literal["json", "csv"]
    content: str = Field(..., min_length=1, max_length=2_000_000)
    dry_run: bool = True


def _parse(fmt, content):
    if fmt == "json":
        try:
            data = json.loads(content)
        except ValueError:
            raise HTTPException(400, "El archivo no es un JSON válido.")
        rows = data.get("copies") if isinstance(data, dict) else data
        if not isinstance(rows, list):
            raise HTTPException(400, "El JSON debe ser una lista de filas o un objeto con la clave 'copies'.")
        return [{str(k).strip().lower(): v for k, v in r.items()} if isinstance(r, dict) else None for r in rows]
    text = content.lstrip("﻿")
    first = text.splitlines()[0] if text.strip() else ""
    delim = ";" if first.count(";") > first.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    return [{(k or "").strip().lower(): v for k, v in r.items()} for r in reader]


def _clean(row):
    """Devuelve (fila_limpia, error). Todo valor se valida: tipo, rango y longitud."""
    if row is None:
        return None, "La fila no es un objeto válido."

    def g(k):
        v = row.get(k)
        return "" if v is None else str(v).strip()

    container = g("container")
    if not container or len(container) > 255:
        return None, "Falta 'container' o es demasiado largo."
    pid = g("scryfall_printing_id")
    if not PID_RE.fullmatch(pid):
        return None, "'scryfall_printing_id' vacío o con formato no válido."
    try:
        qty = int(g("quantity") or 1)
    except ValueError:
        return None, "'quantity' debe ser un número entero."
    if not 1 <= qty <= 99:
        return None, "'quantity' debe estar entre 1 y 99."
    cond = g("condition") or "Near Mint"
    if len(cond) > 30:
        return None, "'condition' demasiado largo (máx. 30)."
    lang = g("language") or "en"
    if not LANG_RE.fullmatch(lang):
        return None, "'language' no válido (ej. en, es)."
    foil_raw = g("is_foil").lower()
    if foil_raw in TRUE_VALUES:
        foil = True
    elif foil_raw in FALSE_VALUES:
        foil = False
    else:
        return None, "'is_foil' debe ser sí/no, true/false o 1/0."
    notes = _unsafe_cell(g("notes"))
    if len(notes) > 500:
        return None, "'notes' demasiado largo (máx. 500)."
    return {"container": container, "pid": pid, "qty": qty, "cond": cond, "lang": lang, "foil": foil,
            "notes": notes or None}, None


@router.post("/import")
def import_collection(req: ImportRequest, current_user: dict = Depends(get_current_user)):
    rows = _parse(req.format, req.content)
    if not rows:
        raise HTTPException(400, "El archivo no contiene filas.")
    if len(rows) > MAX_ROWS:
        raise HTTPException(400, f"Demasiadas filas (máximo {MAX_ROWS}).")
    user_id = _uid(current_user)

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM containers WHERE user_id = %s ORDER BY created_at", (user_id,))
        containers = {}
        for c in cur.fetchall():
            containers.setdefault(c["name"].lower(), c)

        clean, errors = [], []
        for i, raw in enumerate(rows, start=1):
            c, err = _clean(raw)
            if err:
                errors.append({"row": i, "message": err})
            else:
                clean.append((i, c))

        pids = list({c["pid"] for _, c in clean})
        printing = {}
        if pids:
            cur.execute("SELECT id::text AS id, scryfall_printing_id FROM printings "
                        "WHERE scryfall_printing_id = ANY(%s) OR id::text = ANY(%s)", (pids, pids))
            for p in cur.fetchall():
                printing[p["scryfall_printing_id"]] = p["id"]
                printing[p["id"]] = p["id"]

        by_container, valid = {}, []
        for i, c in clean:
            cont = containers.get(c["container"].lower())
            if not cont:
                errors.append({"row": i, "message": f"El contenedor '{c['container']}' no existe en tu cuenta."})
            elif c["pid"] not in printing:
                errors.append({"row": i, "message": f"No existe ninguna impresión con id '{c['pid']}'."})
            else:
                c["printing_id"], c["container_id"] = printing[c["pid"]], str(cont["id"])
                by_container.setdefault(cont["name"], []).append(c)
                valid.append(c)

        # Capacidad por contenedor
        summary_containers = []
        for name, items in by_container.items():
            cid = items[0]["container_id"]
            cur.execute("SELECT count(*) AS n FROM container_slots WHERE container_id = %s AND is_occupied = FALSE", (cid,))
            free = int(cur.fetchone()["n"])
            need = sum(x["qty"] for x in items)
            summary_containers.append({"name": name, "to_add": need, "free": free})
            if need > free:
                errors.append({"row": None, "message": f"'{name}': no caben {need} copias, solo hay {free} hueco(s) libre(s)."})

        errors.sort(key=lambda e: (e["row"] is None, e["row"] or 0))
        summary = {"rows": len(rows), "valid_rows": len(valid), "copies": sum(x["qty"] for x in valid),
                   "containers": summary_containers, "error_count": len(errors), "errors": errors[:100]}
        if req.dry_run:
            return {**summary, "imported": 0, "dry_run": True}
        if errors:
            raise HTTPException(400, f"Hay {len(errors)} error(es); no se ha importado nada.")

        # Importación atómica: todo o nada
        imported = 0
        for name, items in by_container.items():
            cid = items[0]["container_id"]
            need = sum(x["qty"] for x in items)
            cur.execute("""
                SELECT id FROM container_slots WHERE container_id = %s AND is_occupied = FALSE
                ORDER BY CASE WHEN section = 'main' THEN 1 ELSE 2 END, page_number, slot_index
                LIMIT %s FOR UPDATE""", (cid, need))
            slots = [str(r["id"]) for r in cur.fetchall()]
            if len(slots) < need:
                raise HTTPException(409, f"'{name}': los huecos libres cambiaron durante la importación.")
            k = 0
            for it in items:
                for _ in range(it["qty"]):
                    cur.execute("""INSERT INTO card_copies (printing_id, container_id, slot_id, condition, language, is_foil, notes)
                                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                                (it["printing_id"], cid, slots[k], it["cond"], it["lang"], it["foil"], it["notes"]))
                    k += 1
            cur.execute("UPDATE container_slots SET is_occupied = TRUE WHERE id = ANY(%s::uuid[])", (slots,))
            imported += need
        conn.commit()
        return {**summary, "imported": imported, "dry_run": False}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        print(f"❌ Error importando: {e}")
        raise HTTPException(500, "Error interno al importar.")
    finally:
        conn.close()
