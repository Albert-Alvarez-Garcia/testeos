#!/usr/bin/env python3
"""Bloque 24 · (D) estado en línea de amigos, (F) doble check enviado/recibido/visto en DM,
(G) ver como espectador las partidas ya iniciadas desde rooms.html.
Desde ~/testeo:  python3 patch_block24.py   |   python3 patch_block24.py --undo
Después: make restart"""
import os, shutil, sys

SEC, PS, SOC, GAME = 'backend/security.py', 'backend/profile_services.py', 'backend/routers/social.py', 'backend/routers/game.py'
PROF, ROOMS, GJS = 'frontend/js/pages/profile.js', 'frontend/js/pages/rooms.js', 'frontend/js/pages/game.js'
FILES = (SEC, PS, SOC, GAME, PROF, ROOMS, GJS)
SUF, NEW = '.b24bak', 'backend/presence.py'

if '--undo' in sys.argv:
    for f in FILES:
        if os.path.exists(f + SUF):
            shutil.copy(f + SUF, f); os.remove(f + SUF); print('restaurado', f)
    if os.path.exists(NEW): os.remove(NEW); print('borrado', NEW)
    sys.exit()

for f in FILES:
    if not os.path.exists(f): sys.exit(f'Falta {f}: ejecútalo desde ~/testeo')
for f in FILES:
    if not os.path.exists(f + SUF): shutil.copy(f, f + SUF)

def sub(path, old, new):
    s = open(path, encoding='utf-8').read()
    if new in s: return
    if old not in s: sys.exit(f'AVISO: ancla no encontrada en {path}: {old[:80]!r}\n(no se ha tocado nada más; usa --undo)')
    open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))

# ============================ D · estado en línea ============================
open(NEW, 'w', encoding='utf-8').write('''"""Presencia en línea: un usuario cuenta como "en línea" si ha hecho alguna petición válida hace poco.
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
''')
sub(SEC, "from fastapi import Header, HTTPException, Request, WebSocket",
         "from fastapi import Header, HTTPException, Request, WebSocket\n\nfrom backend.presence import touch")
sub(SEC, '            raise HTTPException(status_code=403, detail="Origen no permitido.")\n        return name',
         '            raise HTTPException(status_code=403, detail="Origen no permitido.")\n        touch(name)\n        return name')
sub(SEC, "    name = decode_token(token) if token else None\n    if name:\n        return name\n    if ALLOW_LEGACY and legacy_name",
         "    name = decode_token(token) if token else None\n    if name:\n        touch(name)\n        return name\n    if ALLOW_LEGACY and legacy_name")
sub(PS, "from backend.database import get_db_connection\n", "from backend.database import get_db_connection\nfrom backend.presence import is_online\n")
sub(PS, '        blocked = [_card(row) for row in cursor.fetchall()]\n        return {"friends": friends,',
        '        blocked = [_card(row) for row in cursor.fetchall()]\n        for f in friends:\n            f["online"] = is_online(f["username"])\n        return {"friends": friends,')
sub(PROF, "userRow(u, null, [actionBtn('Mensaje', 'primary', () => openFriend(u))",
          "userRow(u, u.online ? '🟢 En línea' : '⚫ Desconectado', [actionBtn('Mensaje', 'primary', () => openFriend(u))")
sub(PROF, "    // Búsqueda con resultados accionables\n",
          "    // El estado en línea de los amigos se refresca solo cada 15 s mientras la pestaña está visible\n"
          "    setInterval(() => { if (!document.hidden) loadSocial(); }, 15000);\n\n    // Búsqueda con resultados accionables\n")

# ============================ F · enviado / recibido / visto ============================
sub(SOC, '        cursor.execute("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;")',
         '        cursor.execute("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;")\n'
         '        cursor.execute("ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;")')
sub(SOC, "def _iso_utc(value) -> str:",
         'def _dm_status(row) -> str:\n    """sent (✓) · delivered (✓✓, ya le ha llegado al receptor) · read (✓✓ azul, ha abierto la conversación)."""\n'
         '    if row.get("read_at") is not None:\n        return "read"\n    return "delivered" if row.get("delivered_at") is not None else "sent"\n\n\n'
         "def _iso_utc(value) -> str:")
sub(SOC, "            SELECT id, sender_id, message, created_at FROM (\n                SELECT id, sender_id, message, created_at\n",
         "            SELECT id, sender_id, message, created_at, delivered_at, read_at FROM (\n                SELECT id, sender_id, message, created_at, delivered_at, read_at\n")
sub(SOC, "UPDATE direct_messages SET read_at = now()\n", "UPDATE direct_messages SET read_at = now(), delivered_at = COALESCE(delivered_at, now())\n")
sub(SOC, '        cursor.close()\n        return {"messages": [\n            {\n                "id": int(r["id"]),\n                "mine": r["sender_id"] == me_id,\n                "message": r["message"],\n                "created_at": _iso_utc(r["created_at"]),\n            }\n            for r in rows\n        ], "typing":',
         '        cursor.execute("SELECT id, delivered_at, read_at FROM direct_messages WHERE sender_id = %s AND recipient_id = %s ORDER BY id DESC LIMIT %s;",\n'
         '                       (me_id, other_id, HISTORY_LIMIT))\n'
         '        statuses = {str(r["id"]): _dm_status(r) for r in cursor.fetchall()}\n'
         '        cursor.close()\n        return {"messages": [\n            {\n                "id": int(r["id"]),\n                "mine": r["sender_id"] == me_id,\n                "message": r["message"],\n                "created_at": _iso_utc(r["created_at"]),\n'
         '                "status": _dm_status(r) if r["sender_id"] == me_id else None,\n            }\n            for r in rows\n        ], "statuses": statuses, "typing":')
sub(SOC, '        counts = {r["sender_id"]: int(r["n"]) for r in cursor.fetchall()}\n        cursor.close()',
         '        counts = {r["sender_id"]: int(r["n"]) for r in cursor.fetchall()}\n'
         '        cursor.execute("UPDATE direct_messages SET delivered_at = now() WHERE recipient_id = %s AND delivered_at IS NULL;",\n'
         '                       (str(current_user["id"]),))\n        conn.commit()\n        cursor.close()')
sub(PROF, "    function fmBubble(m) {",
"""    // ✓ enviado · ✓✓ recibido · ✓✓ azul = visto
    function setTick(n, status) {
        const T = { sent: ['✓', 'Enviado'], delivered: ['✓✓', 'Recibido'], read: ['✓✓', 'Visto'] };
        const [txt, title] = T[status] || T.sent;
        n.textContent = txt;
        n.title = title;
        n.setAttribute('aria-label', title);
        n.className = 'ml-1 ' + (status === 'read' ? 'text-sky-400' : 'text-[color:var(--text-muted)]');
    }

    function updateTicks(map) {
        if (!map) return;
        fmBox.querySelectorAll('[data-mid]').forEach((n) => { if (map[n.dataset.mid]) setTick(n, map[n.dataset.mid]); });
    }

    function fmBubble(m) {""")
sub(PROF, "        const t = new Date(m.created_at);\n        b.append(el('p', 'text-[10px] text-[color:var(--text-muted)] mt-1 text-right',\n            isNaN(t) ? null : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));",
"""        const t = new Date(m.created_at);
        const meta = el('p', 'text-[10px] text-[color:var(--text-muted)] mt-1 text-right',
            isNaN(t) ? null : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        if (m.mine) {
            const tick = el('span', '', '');
            tick.dataset.mid = String(m.id);
            setTick(tick, m.status);
            meta.append(tick);
        }
        b.append(meta);""")
sub(PROF, "if (fm.user === who) { appendDm(data.messages || []); showTyping(!!data.typing); }",
          "if (fm.user === who) { appendDm(data.messages || []); updateTicks(data.statuses); showTyping(!!data.typing); }")

# ============================ G · ver partidas en curso ============================
sub(GAME, """def get_active_rooms():
    active_rooms = []
    for room_id, players in manager.lobbies.items():
        max_p = manager.room_config.get(room_id, 4)
        active_rooms.append({
            "room_id": room_id,
            "current_players": len(players),
            "max_players": max_p
        })
    return {"rooms": active_rooms}""",
"""def get_active_rooms():
    rooms = {}
    for room_id, members in manager.lobbies.items():
        active = [w for w in members if not manager.lobby_players.get(w, {}).get("spectator")]
        rooms[room_id] = {
            "room_id": room_id,
            "current_players": len(active),
            "max_players": manager.room_config.get(room_id, 4),
            "in_game": False,
            "spectators": len(members) - len(active),
        }
    # Partidas ya empezadas: siguen apareciendo (aunque el lobby ya esté vacío) para poder verlas como espectador
    for room_id, game in manager.game_rooms.items():
        if game.finished or game.allowed is None:
            continue
        entry = rooms.setdefault(room_id, {"room_id": room_id, "current_players": len(game.players),
                                           "max_players": len(game.allowed)})
        entry.update(in_game=True, round=game.round_number, spectators=len(game.spectators),
                     players=sorted(game.players))
    return {"rooms": list(rooms.values())}""")
sub(GAME, "    async def connect_game(self, websocket: WebSocket, room_id: str, username: str) -> GameRoom:\n        await websocket.accept()\n",
          "    async def connect_game(self, websocket: WebSocket, room_id: str, username: str,\n"
          "                           spectate_only: bool = False) -> Optional[GameRoom]:\n        await websocket.accept()\n\n"
          "        # Modo \"solo ver\": nunca crea una partida; si no hay una en curso, se rechaza\n"
          "        if spectate_only:\n            existing = self.game_rooms.get(room_id)\n"
          "            if existing is None or existing.finished or existing.allowed is None:\n"
          "                await websocket.close(code=4404)\n                return None\n")
sub(GAME, "    room = await manager.connect_game(websocket, room_id, username)\n\n    try:",
          '    room = await manager.connect_game(websocket, room_id, username,\n'
          '                                      spectate_only=websocket.query_params.get("spectate") == "1")\n'
          '    if room is None:\n        return\n\n    try:')
sub(GJS, '?username=${encodeURIComponent(username)}`);\n\n        ws.onopen',
         '?username=${encodeURIComponent(username)}${urlParams.get("spectate") === "1" ? "&spectate=1" : ""}`);\n\n        ws.onopen')
sub(GJS, "        ws.onclose = () => {\n            if (gameEnded || leftGame) return;",
         '        ws.onclose = (ev) => {\n            if (ev && ev.code === 4404) {   // la partida que se quería ver ya terminó\n'
         '                leftGame = true;\n                if (roomStatus) roomStatus.textContent = "La partida ya no está disponible. Volviendo a las salas…";\n'
         '                setTimeout(() => { window.location.href = "rooms.html"; }, 1500);\n                return;\n            }\n'
         '            if (gameEnded || leftGame) return;')
sub(ROOMS, '                const joinBtn = document.createElement("button");',
"""                if (room.in_game || room.spectators) {
                    const st = document.createElement("div");
                    st.className = "text-[11px] text-amber-300 mt-0.5";
                    st.textContent = (room.in_game ? `▶ En curso · ronda ${room.round || 1} · ` : "") + `👁 ${room.spectators || 0} espectador(es)`;
                    infoDiv.appendChild(st);
                }

                const joinBtn = document.createElement("button");""")
sub(ROOMS, '                joinBtn.textContent = "Unirse";', '                joinBtn.textContent = room.in_game ? "👁 Ver partida" : "Unirse";')
sub(ROOMS, '                    window.location.href = `lobby.html?room=${encodeURIComponent(room.room_id)}`;\n                });',
           '                    window.location.href = room.in_game\n                        ? `game.html?room=${encodeURIComponent(room.room_id)}&spectate=1`\n'
           '                        : `lobby.html?room=${encodeURIComponent(room.room_id)}`;\n                });')
print('Hecho. Aplica con: make restart')
