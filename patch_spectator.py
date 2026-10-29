#!/usr/bin/env python3
"""Modo espectador en Adivina la Carta (límite de jugadores real + espectadores que ven pero no responden).
Desde ~/testeo:  python3 patch_spectator.py   |   python3 patch_spectator.py --undo"""
import os, shutil, sys
G, L, J = 'backend/routers/game.py', 'frontend/js/pages/lobby.js', 'frontend/js/pages/game.js'
if '--undo' in sys.argv:
    for f in (G, L, J):
        if os.path.exists(f + '.spbak'): shutil.copy(f + '.spbak', f); print('restaurado', f)
    sys.exit()
for f in (G, L, J):
    if not os.path.exists(f + '.spbak'): shutil.copy(f, f + '.spbak')

def sub(path, old, new):
    s = open(path).read()
    if new in s: return
    if old not in s: sys.exit(f'AVISO: ancla no encontrada en {path}: {old[:70]!r}')
    open(path, 'w').write(s.replace(old, new, 1))

# ======================= game.py =======================
sub(G, "        self.cleanup_task: Optional[asyncio.Task] = None\n        self.finished = False",
       "        self.cleanup_task: Optional[asyncio.Task] = None\n        self.finished = False\n"
       "        self.allowed: Optional[set] = None            # jugadores de la partida (None = abierta a todos)\n"
       "        self.spectators: Dict[str, dict] = {}         # username -> {\"ws\"}")
sub(G, "    async def broadcast(self, message: dict):\n        for p in list(self.players.values()):\n            await self.send(p[\"ws\"], message)",
       "    async def broadcast(self, message: dict):\n        for p in list(self.players.values()):\n            await self.send(p[\"ws\"], message)\n"
       "        for s in list(self.spectators.values()):\n            await self.send(s[\"ws\"], message)")
sub(G, "        for u, p in list(self.players.items()):\n            await self.send(p[\"ws\"], self.snapshot(u))",
       "        for u, p in list(self.players.items()):\n            await self.send(p[\"ws\"], self.snapshot(u))\n"
       "        for s in list(self.spectators.values()):\n            await self.send(s[\"ws\"], self.snapshot(None))")
sub(G, "        self.game_rooms: Dict[str, GameRoom] = {}\n",
       "        self.game_rooms: Dict[str, GameRoom] = {}\n        self.pending_players: Dict[str, List[str]] = {}   # jugadores que fija el lobby al empezar\n")

# --- lobby: límite real de jugadores; el resto entra como espectador ---
sub(G, """        self.lobbies[room_id].append(websocket)
        is_host = len(self.lobbies[room_id]) == 1
        if room_id not in self.room_config:
            self.room_config[room_id] = 4

        self.lobby_players[websocket] = {
            "username": username,
            "is_host": is_host
        }
        await self.broadcast_lobby_state(room_id)""",
"""        if room_id not in self.room_config:
            self.room_config[room_id] = 4
        members = self.lobbies[room_id]
        active = [w for w in members if not self.lobby_players.get(w, {}).get("spectator")]
        is_spectator = len(active) >= self.room_config[room_id]
        has_host = any(self.lobby_players.get(w, {}).get("is_host") for w in members)
        members.append(websocket)
        self.lobby_players[websocket] = {
            "username": username,
            "is_host": (not is_spectator) and not has_host,
            "spectator": is_spectator,
        }
        await self.broadcast_lobby_state(room_id)""")
sub(G, """            if self.lobby_players.get(websocket, {}).get("is_host") and self.lobbies[room_id]:
                next_host_ws = self.lobbies[room_id][0]
                if next_host_ws in self.lobby_players:
                    self.lobby_players[next_host_ws]["is_host"] = True
""", "            self._rebalance(room_id)\n")
sub(G, "    async def broadcast_lobby_state(self, room_id: str):",
"""    def _rebalance(self, room_id: str):
        \"\"\"Un espectador ocupa el hueco libre y siempre hay un host entre los jugadores.\"\"\"
        members = self.lobbies.get(room_id, [])
        mx = self.room_config.get(room_id, 4)
        info = lambda w: self.lobby_players.get(w, {})
        for w in members:
            active = [x for x in members if not info(x).get("spectator")]
            if len(active) >= mx:
                break
            if info(w).get("spectator"):
                info(w)["spectator"] = False
        active = [x for x in members if not info(x).get("spectator")]
        if active and not any(info(x).get("is_host") for x in active):
            info(active[0])["is_host"] = True

    async def broadcast_lobby_state(self, room_id: str):""")
sub(G, """                    "username": self.lobby_players[ws]["username"],
                    "is_host": self.lobby_players[ws]["is_host"]
                }""", """                    "username": self.lobby_players[ws]["username"],
                    "is_host": self.lobby_players[ws]["is_host"],
                    "spectator": bool(self.lobby_players[ws].get("spectator")),
                }""")

# --- partida: jugadores fijados por el lobby; el resto, espectadores ---
sub(G, """        room = self.game_rooms.get(room_id)
        if room is None:
            room = GameRoom(room_id)
            self.game_rooms[room_id] = room""", """        room = self.game_rooms.get(room_id)
        pending = self.pending_players.pop(room_id, None)
        if room is not None and pending is not None and room.finished:
            self._drop_game_room(room)
            room = None
        if room is None:
            room = GameRoom(room_id)
            if pending is not None:
                room.allowed = set(pending)
            self.game_rooms[room_id] = room""")
sub(G, "        if room.cleanup_task:\n            room.cleanup_task.cancel()\n            room.cleanup_task = None\n\n        player = room.players.get(username)",
"""        # Espectador: ve la partida en directo, pero el servidor nunca acepta sus respuestas
        if room.allowed is not None and username not in room.allowed:
            old = room.spectators.get(username)
            room.spectators[username] = {"ws": websocket}
            if old and old["ws"] is not websocket:
                try:
                    await old["ws"].close()
                except Exception:
                    pass
            await room.send(websocket, {"type": "ROLE", "role": "spectator"})
            if room.card is not None and room.phase != "waiting":
                await room.send(websocket, room.snapshot(None))
            await room.send(websocket, room.scores_payload())
            return room

        if room.cleanup_task:
            room.cleanup_task.cancel()
            room.cleanup_task = None

        player = room.players.get(username)""")
sub(G, "        # Estado actual con el tiempo restante REAL (igual para todos)",
       "        await room.send(websocket, {\"type\": \"ROLE\", \"role\": \"player\"})\n        # Estado actual con el tiempo restante REAL (igual para todos)")
sub(G, "        player = room.players.get(username)\n        if player and player[\"ws\"] is websocket:\n            player[\"ws\"] = None",
"""        spec = room.spectators.get(username)
        if spec is not None and username not in room.players:
            if spec["ws"] is websocket:
                del room.spectators[username]
            return

        player = room.players.get(username)
        if player and player["ws"] is websocket:
            player["ws"] = None""")
sub(G, """                    new_max = int(data.get("max_players", 4))
                    manager.room_config[room_id] = max(1, min(4, new_max))
                    await manager.broadcast_lobby_state(room_id)""",
"""                    new_max = max(1, min(4, int(data.get("max_players", 4))))
                    active = [w for w in manager.lobbies.get(room_id, [])
                              if not manager.lobby_players.get(w, {}).get("spectator")]
                    if new_max >= len(active):
                        manager.room_config[room_id] = new_max
                        manager._rebalance(room_id)
                    await manager.broadcast_lobby_state(room_id)""")
sub(G, """                if player_info.get("is_host"):
                    start_signal = {"type": "START_GAME"}""",
"""                if player_info.get("is_host"):
                    manager.pending_players[room_id] = [
                        manager.lobby_players[w]["username"] for w in manager.lobbies.get(room_id, [])
                        if w in manager.lobby_players and not manager.lobby_players[w].get("spectator")]
                    start_signal = {"type": "START_GAME"}""")

# ======================= lobby.js =======================
sub(L, "            playerCount.textContent = `${players.length}/${maxPlayers}`;",
       "            const active = players.filter(p => !p.spectator);\n"
       "            const watchers = players.length - active.length;\n"
       "            playerCount.textContent = `${active.length}/${maxPlayers}` + (watchers ? ` · 👁 ${watchers}` : \"\");")
sub(L, "                li.appendChild(nameSpan);\n                playersList.appendChild(li);",
       "                if (p.spectator) {\n"
       "                    const eye = document.createElement(\"span\");\n"
       "                    eye.className = \"text-[10px] px-1.5 py-0.5 rounded font-bold border border-[rgb(var(--c-gold)/0.3)] text-[rgb(var(--c-amber-200)/0.7)]\";\n"
       "                    eye.textContent = \"👁 ESPECTADOR\";\n"
       "                    nameSpan.appendChild(eye);\n"
       "                }\n\n"
       "                li.appendChild(nameSpan);\n                playersList.appendChild(li);")
sub(L, "opt.disabled = parseInt(opt.value) < players.length;", "opt.disabled = parseInt(opt.value) < active.length;")

# ======================= game.js =======================
sub(J, "    let gameEnded = false;\n", "    let gameEnded = false;\n    let isSpectator = false;      // los espectadores ven la partida pero no pueden responder\n")
sub(J, '                case "NEW_ROUND": startRound(data); break;',
       '                case "ROLE": setRole(data.role); break;\n                case "NEW_ROUND": startRound(data); break;')
sub(J, "    // ---------------- Rondas ----------------\n",
"""    function setRole(role) {
        isSpectator = role === "spectator";
        if (isSpectator) {
            lockOptions();
            if (roundBanner) roundBanner.textContent = "👁 Modo espectador: estás viendo la partida";
        }
    }

    // ---------------- Rondas ----------------
""")
sub(J, "        selectedOption = null;\n        locked = false;", "        selectedOption = null;\n        locked = isSpectator;")
sub(J, '        if (roundBanner) roundBanner.textContent = "";\n        if (titleMask)', '        if (roundBanner) roundBanner.textContent = isSpectator ? "👁 Modo espectador" : "";\n        if (titleMask)')
sub(J, "        renderOptions(data.options || []);\n", "        renderOptions(data.options || []);\n        if (isSpectator) lockOptions();\n")
sub(J, "        if (locked || phase !== \"playing\") return;", "        if (isSpectator || locked || phase !== \"playing\") return;")
print('Hecho. Aplica con: make restart')
